// Adaptateurs FETCH (APIs publiques documentées). Interface : meta, buildQuery, search, test.
import { getJson, EngineError } from './http.js';
import { OPEN_ENGINES } from './open-engines.js';
import { translate, COMPAT } from '../core/operators-compat.js';
import { targetDomain, targetUrl, plainTerms } from '../core/query-parser.js';

const enc = encodeURIComponent;
const sup = (id) => {
  const c = COMPAT[id] || {};
  return { site: !!c.site, notSite: !!c.notSite, exact: !!c.exact, none: !!c.none, filetype: !!c.filetype, inurl: !!c.inurl, intitle: !!c.intitle };
};
const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
// Décodage des entités HTML renvoyées par certaines API (texte brut ensuite, jamais injecté en HTML).
export const decode = (s) => String(s || '').replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => (e[0] === '#' ? String.fromCodePoint(e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : +e.slice(1)) : ENT[e.toLowerCase()] ?? m)).replace(/\s+/g, ' ').trim();
const ymd = (ts) => (ts && ts.length >= 8 ? `${ts.slice(0, 4)}-${ts.slice(4, 6)}-${ts.slice(6, 8)}` : null);

const github = {
  meta: { id: 'github', name: 'GitHub (dépôts)', paged: true, method: 'API REST search/repositories non authentifiée', short: 'GH', color: '#24292F', kind: 'fetch', modes: ['code', 'tout'], homepage: 'https://github.com', termsUrl: 'https://docs.github.com/rest/search', keyOptional: true, supports: sup('github') },
  buildQuery: (ast) => translate('github', { ...ast, site: [], notSite: [] }),
  async search(ast, { key, signal, fetchImpl, page = 1 }) {
    const { query } = this.buildQuery(ast);
    if (!query.trim()) return [];
    const headers = { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' };
    if (key) headers.Authorization = `Bearer ${key}`;
    const { data } = await getJson(`https://api.github.com/search/repositories?q=${enc(query)}&per_page=20&page=${page}`, { fetchImpl, signal, headers, retries: 0 });
    return (data.items || []).map((r, i) => ({ url: r.html_url, title: r.full_name, snippet: [r.description, r.language, r.stargazers_count != null ? `${r.stargazers_count} étoiles` : ''].filter(Boolean).join(' · '), engine: 'github', rank: i + 1, date: r.pushed_at?.slice(0, 10) }));
  },
};

const wayback = {
  meta: { id: 'wayback', name: 'Wayback CDX', budget: 30000, method: 'API CDX web.archive.org', short: 'WA', color: '#A8742F', kind: 'fetch', modes: ['archives', 'infra', 'tout'], needsTarget: true, homepage: 'https://web.archive.org', termsUrl: 'https://archive.org/about/terms.php', supports: {} },
  buildQuery: (ast) => ({ query: targetUrl(ast) || '', ignored: [] }),
  async search(ast, { signal, fetchImpl, limit = 40 }) {
    const target = targetUrl(ast);
    if (!target) throw new EngineError('NO_TARGET', 'Domaine ou URL requis');
    const rows = await cdx(target, { signal, fetchImpl, limit, matchType: 'exact' });
    return rows.reverse().map((r, i) => ({ url: `https://web.archive.org/web/${r.timestamp}/${r.original}`, title: `${r.original} — capture du ${ymd(r.timestamp)}`, snippet: `HTTP ${r.statuscode} · ${r.mimetype}`, engine: 'wayback', rank: i + 1, date: ymd(r.timestamp), extra: r }));
  },
};

export async function cdx(target, { signal, fetchImpl, limit = 200, matchType } = {}) {
  const mt = matchType || (target.replace(/\/$/, '').includes('/') ? 'exact' : 'prefix');
  const { data } = await getJson(`https://web.archive.org/cdx/search/cdx?url=${enc(target)}&matchType=${mt}&output=json&fl=timestamp,original,statuscode,mimetype,digest&collapse=digest&limit=-${limit}`, { fetchImpl, signal, timeout: 25000, retries: 1 });
  if (!Array.isArray(data) || data.length < 2) return [];
  const [head, ...rows] = data;
  return rows.map((r) => Object.fromEntries(head.map((h, i) => [h, r[i]])));
}

export async function waybackAvailable(url, { signal, fetchImpl, timestamp } = {}) {
  const { data } = await getJson(`https://archive.org/wayback/available?url=${enc(url)}${timestamp ? `&timestamp=${timestamp}` : ''}`, { fetchImpl, signal });
  return data?.archived_snapshots?.closest || null;
}

// Common Crawl : 1 requête à la fois, pause >= 1 s, arrêt sur 503.
let ccQueue = Promise.resolve();
let ccLast = 0;
let ccIndexes = null;
export function ccSerial(fn) {
  const run = ccQueue.then(async () => {
    const wait = 1000 - (Date.now() - ccLast);
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    try { return await fn(); } finally { ccLast = Date.now(); }
  });
  ccQueue = run.catch(() => {});
  return run;
}

const commoncrawl = {
  meta: { id: 'commoncrawl', name: 'Common Crawl', budget: 50000, method: 'Index CDX des 2 dernières collectes (sérialisé, 1 req./s)', short: 'CC', color: '#1BA39C', kind: 'fetch', modes: ['archives', 'tout'], needsTarget: true, homepage: 'https://index.commoncrawl.org', termsUrl: 'https://commoncrawl.org/terms-of-use', supports: {} },
  buildQuery: (ast) => ({ query: targetDomain(ast) || '', ignored: [] }),
  async search(ast, { signal, fetchImpl }) {
    const domain = targetDomain(ast);
    if (!domain) throw new EngineError('NO_TARGET', 'Domaine requis');
    if (!ccIndexes) ccIndexes = (await ccSerial(() => getJson('https://index.commoncrawl.org/collinfo.json', { fetchImpl, signal, retries: 0 }))).data;
    let data; let idx; let lastErr;
    for (const cand of ccIndexes.slice(0, 2)) {
      idx = cand;
      try {
        ({ data } = await ccSerial(() => getJson(`${idx['cdx-api']}?url=${enc(`${domain}/*`)}&output=json&limit=40`, { fetchImpl, signal, retries: 1, timeout: 20000, ndjson: true })));
        lastErr = null; break;
      } catch (e) {
        if (e.status === 404) return [];
        if (e.code === 'ABORT') throw e;
        lastErr = e;
      }
    }
    if (lastErr) throw lastErr;
    const rows = Array.isArray(data) ? data : [data];
    return rows.filter(Boolean).map((r, i) => ({ url: r.url, title: `${r.url}`, snippet: `${idx.name} · HTTP ${r.status} · ${r.mime || ''}`, engine: 'commoncrawl', rank: i + 1, date: ymd(r.timestamp) }));
  },
};

const crtsh = {
  meta: { id: 'crtsh', name: 'crt.sh', budget: 65000, method: 'JSON crt.sh/?output=json (lent : jusqu’à 60 s)', short: 'CT', color: '#6B7280', kind: 'fetch', modes: ['infra', 'tout'], needsTarget: true, homepage: 'https://crt.sh', termsUrl: 'https://crt.sh', supports: {} },
  buildQuery: (ast) => ({ query: targetDomain(ast) || '', ignored: [] }),
  async search(ast, { signal, fetchImpl }) {
    const domain = targetDomain(ast);
    if (!domain) throw new EngineError('NO_TARGET', 'Domaine requis');
    const { data } = await getJson(`https://crt.sh/?q=${enc(`%.${domain}`)}&output=json`, { fetchImpl, signal, timeout: 30000, retries: 1 });
    const names = new Map();
    for (const c of Array.isArray(data) ? data : []) {
      for (const n of String(c.name_value || '').split('\n')) {
        const host = n.trim().toLowerCase().replace(/^\*\./, '');
        if (!host || !host.endsWith(domain)) continue;
        const prev = names.get(host);
        if (!prev || c.not_before > prev.not_before) names.set(host, c);
      }
    }
    return [...names.entries()].slice(0, 80).map(([host, c], i) => ({ url: `https://${host}/`, title: host, snippet: `Certificat ${c.issuer_name?.match(/O=([^,]+)/)?.[1] || ''} · valide du ${c.not_before?.slice(0, 10)} au ${c.not_after?.slice(0, 10)}`, engine: 'crtsh', rank: i + 1, date: c.not_before?.slice(0, 10) }));
  },
};

const rdap = {
  meta: { id: 'rdap', name: 'RDAP', method: 'rdap.org (redirection vers le registre)', short: 'RD', color: '#8A5CF6', kind: 'fetch', modes: ['infra', 'tout'], needsTarget: true, homepage: 'https://rdap.org', termsUrl: 'https://about.rdap.org', supports: {} },
  buildQuery: (ast) => ({ query: targetDomain(ast) || '', ignored: [] }),
  async search(ast, { signal, fetchImpl }) {
    const domain = targetDomain(ast);
    if (!domain) throw new EngineError('NO_TARGET', 'Domaine requis');
    const reg = domain.split('.').slice(-2).join('.');
    const { data, finalUrl } = await getJson(`https://rdap.org/domain/${enc(reg)}`, { fetchImpl, signal, retries: 0, headers: { Accept: 'application/rdap+json, application/json' } });
    const ev = Object.fromEntries((data.events || []).map((e) => [e.eventAction, e.eventDate?.slice(0, 10)]));
    const registrar = (data.entities || []).find((e) => (e.roles || []).includes('registrar'));
    const rname = registrar?.vcardArray?.[1]?.find((v) => v[0] === 'fn')?.[3] || registrar?.handle || 'non communiqué';
    const ns = (data.nameservers || []).map((n) => n.ldhName?.toLowerCase()).filter(Boolean).join(', ');
    return [{ url: finalUrl || `https://rdap.org/domain/${reg}`, title: `RDAP — ${data.ldhName?.toLowerCase() || reg}`, snippet: `Bureau d'enregistrement : ${rname} · créé le ${ev.registration || '?'} · expire le ${ev.expiration || '?'} · statut : ${(data.status || []).join(', ') || '?'}${ns ? ` · serveurs DNS : ${ns}` : ''}. Données souvent expurgées (RGPD).`, engine: 'rdap', rank: 1, date: ev['last changed'] || ev.registration }];
  },
};

const brave = {
  meta: { id: 'brave', name: 'Brave Search API', short: 'BR', color: '#FB542B', kind: 'key', modes: ['web', 'tout'], needsKey: true, homepage: 'https://brave.com/search/api/', termsUrl: 'https://api-dashboard.search.brave.com/terms-of-service', origin: 'https://api.search.brave.com/*', supports: sup('brave') },
  buildQuery: (ast) => translate('brave', ast),
  async search(ast, { key, signal, fetchImpl }) {
    if (!key) throw new EngineError('NO_KEY', 'Clé API manquante');
    const { query } = this.buildQuery(ast);
    const { data } = await getJson(`https://api.search.brave.com/res/v1/web/search?q=${enc(query)}&count=20${ast.lang ? `&search_lang=${enc(ast.lang)}` : ''}`, { fetchImpl, signal, headers: { 'X-Subscription-Token': key } });
    return (data.web?.results || []).map((r, i) => ({ url: r.url, title: r.title, snippet: (r.description || '').replace(/<[^>]+>/g, ''), engine: 'brave', rank: i + 1, date: r.page_age?.slice(0, 10) }));
  },
};

const mojeek = {
  meta: { id: 'mojeek', name: 'Mojeek API', short: 'MJ', color: '#2E7BCF', kind: 'key', modes: ['web', 'petit', 'tout'], needsKey: true, homepage: 'https://www.mojeek.com/services/search/web-search-api/', termsUrl: 'https://www.mojeek.com/about/legal/api-terms.html', origin: 'https://api.mojeek.com/*', supports: sup('mojeek') },
  buildQuery: (ast) => translate('mojeek', ast),
  async search(ast, { key, signal, fetchImpl }) {
    if (!key) throw new EngineError('NO_KEY', 'Clé API manquante');
    const { query } = this.buildQuery(ast);
    const { data } = await getJson(`https://api.mojeek.com/search?q=${enc(query)}&api_key=${enc(key)}&fmt=json&t=20`, { fetchImpl, signal });
    return (data.response?.results || []).map((r, i) => ({ url: r.url, title: r.title, snippet: r.desc || '', engine: 'mojeek', rank: i + 1, date: r.date ? String(r.date).slice(0, 10) : undefined }));
  },
};

const searxng = {
  meta: { id: 'searxng', name: 'SearXNG (instance personnelle)', short: 'SX', color: '#3050FF', kind: 'key', modes: ['web', 'tout'], needsKey: true, homepage: 'https://docs.searxng.org', termsUrl: 'https://docs.searxng.org/dev/search_api.html', supports: sup('generic') },
  buildQuery: (ast) => translate('generic', ast),
  async search(ast, { key: base, signal, fetchImpl }) {
    if (!base) throw new EngineError('NO_KEY', "URL d'instance manquante");
    const { query } = this.buildQuery(ast);
    const { data } = await getJson(`${base.replace(/\/$/, '')}/search?q=${enc(query)}&format=json${ast.lang ? `&language=${enc(ast.lang)}` : ''}`, { fetchImpl, signal });
    return (data.results || []).map((r, i) => ({ url: r.url, title: r.title, snippet: r.content || '', engine: 'searxng', rank: i + 1, date: r.publishedDate?.slice(0, 10) }));
  },
};

export const FETCH_ENGINES = [...OPEN_ENGINES, github, wayback, commoncrawl, crtsh, rdap, brave, mojeek, searxng];
export const engineById = (id) => FETCH_ENGINES.find((e) => e.meta.id === id);
export const ENGINE_META = Object.fromEntries(FETCH_ENGINES.map((e) => [e.meta.id, e.meta]));
