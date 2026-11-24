// ARGUS Lens v2 — sources ouvertes sans clé ni paiement.
// « Reverse API » : endpoints publics que les sites utilisent eux-mêmes (pages HTML de résultats, flux RSS,
// JSON publics). Les requêtes partent du service worker, sans cookie (credentials: 'omit'), avec le
// navigateur réel de l'utilisateur. Si une source répond par un captcha, un défi anti-robot ou exige une
// clé, elle est marquée « bloquée / indisponible » et l'agrégateur passe à la suivante : aucun contournement.
// Sélecteurs et endpoints réécrits d'après la documentation publique et la lecture de projets ouverts
// (ddgs — MIT ; SearXNG — AGPL-3.0, consulté uniquement pour les URL publiques, aucun code copié).
import { getJson, getText, EngineError } from './http.js';
import { parseHtml, parseXml, clean } from '../core/html.js';
import { translate, COMPAT } from '../core/operators-compat.js';
import { targetDomain, plainTerms } from '../core/query-parser.js';

const enc = encodeURIComponent;
const sup = (id) => { const c = COMPAT[id] || COMPAT.generic; return { site: !!c.site, notSite: !!c.notSite, exact: !!c.exact, none: !!c.none, filetype: !!c.filetype, inurl: !!c.inurl, intitle: !!c.intitle }; };
const NONE = sup('wiby');
const simple = (ast) => [...ast.exact.map((s) => `"${s}"`), ...ast.all, ...ast.any].join(' ').trim();
const terms = (ast) => [...ast.exact, ...ast.all, ...ast.any].join(' ').trim();
const lang2 = (ast, d = 'fr') => (ast.lang || d).slice(0, 2);
const stripTags = (s) => clean(String(s || '').replace(/<[^>]+>/g, ' '));
const isHttp = (u) => /^https?:\/\//i.test(u || '');
const day = (s) => (s ? String(s).slice(0, 10) : undefined);
const mk = (engine, list) => list.filter((r) => r && isHttp(r.url)).map((r, i) => ({ ...r, title: r.title || r.url, snippet: r.snippet || '', engine, rank: i + 1 }));
const W = ['web', 'tout'];

// ---------- Moteurs web (pages de résultats publiques) ----------

function unwrapDdg(href) {
  try { const u = new URL(href, 'https://duckduckgo.com'); const real = u.searchParams.get('uddg'); return real || u.href; } catch { return href; }
}
const ddg = {
  meta: { id: 'ddg', name: 'DuckDuckGo', short: 'DD', color: '#DE5833', kind: 'web', modes: W, paged: true, homepage: 'https://duckduckgo.com', termsUrl: 'https://duckduckgo.com/terms', supports: sup('ddg'), method: 'HTML html.duckduckgo.com (repli lite.duckduckgo.com)' },
  buildQuery: (ast) => translate('ddg', ast),
  async search(ast, { signal, fetchImpl, page = 1 }) {
    const { query } = this.buildQuery(ast);
    if (!query.trim()) return [];
    const kl = ast.region || ast.lang ? `&kl=${enc(`${ast.region || ast.lang}-${ast.lang || ast.region}`)}` : '';
    const s = page > 1 ? `&s=${10 + (page - 2) * 15}&dc=${11 + (page - 2) * 15}` : '';
    try {
      const { text, status } = await getText(`https://html.duckduckgo.com/html/?q=${enc(query)}${kl}${s}`, { fetchImpl, signal });
      if (status === 202) throw new EngineError('BLOCKED', 'DuckDuckGo renvoie son défi anti-robot (HTTP 202) : non contourné', 202);
      const doc = parseHtml(text);
      const out = doc.qsa('div.result').filter((r) => !r.classes.includes('result--ad')).map((r) => {
        const a = r.qs('a.result__a');
        return a && { url: unwrapDdg(a.attr('href')), title: clean(a.text), snippet: clean(r.qs('.result__snippet')?.text) };
      }).filter((r) => r && !/duckduckgo\.com\/y\.js/.test(r.url));
      if (out.length || doc.qs('.no-results')) return mk('ddg', out);
    } catch (e) { if (e.code === 'ABORT' || e.code === 'BLOCKED') throw e; }
    // Repli : version « lite » (même moteur, page plus légère).
    const off = page > 1 ? `&s=${(page - 1) * 30 - 10}` : '';
    const { text, status } = await getText(`https://lite.duckduckgo.com/lite/?q=${enc(query)}${kl}${off}`, { fetchImpl, signal });
    if (status === 202) throw new EngineError('BLOCKED', 'DuckDuckGo renvoie son défi anti-robot (HTTP 202) : non contourné', 202);
    const doc = parseHtml(text);
    const links = doc.qsa('a.result-link');
    const snips = doc.qsa('td.result-snippet');
    return mk('ddg', links.map((a, i) => ({ url: unwrapDdg(a.attr('href')), title: clean(a.text), snippet: clean(snips[i]?.text) })).filter((r) => !/duckduckgo\.com\/y\.js/.test(r.url)));
  },
};

function unwrapBing(href) {
  try {
    const u = new URL(href, 'https://www.bing.com');
    if (!/bing\.com$/.test(u.hostname) || !u.pathname.startsWith('/ck/')) return u.href;
    const v = u.searchParams.get('u') || '';
    const b64 = v.slice(2).replace(/-/g, '+').replace(/_/g, '/');
    return decodeURIComponent(escape(atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4))));
  } catch { return href; }
}
const bing = {
  meta: { id: 'bing', name: 'Bing', short: 'BI', color: '#0F7C8C', kind: 'web', modes: W, paged: true, homepage: 'https://www.bing.com', termsUrl: 'https://www.microsoft.com/servicesagreement', supports: sup('bing'), method: 'Flux RSS public bing.com/search?format=rss&mkt=… (repli page HTML)' },
  buildQuery: (ast) => translate('bing', ast),
  async search(ast, { signal, fetchImpl, page = 1, lang, region }) {
    const { query } = this.buildQuery(ast);
    if (!query.trim()) return [];
    const first = page > 1 ? `&first=${(page - 1) * 10 + 1}` : '';
    const l = (ast.lang || lang || 'fr').slice(0, 2);
    const mkts = [...new Set([`${l}-${(ast.region || region || l).toUpperCase()}`, 'en-US'])];
    for (const mkt of mkts) {
      const { text } = await getText(`https://www.bing.com/search?format=rss&q=${enc(query)}&mkt=${mkt}${first}`, { fetchImpl, signal });
      const doc = parseXml(text);
      const items = doc.qsa('item').map((it) => ({ url: clean(it.qs('link')?.text), title: clean(it.qs('title')?.text), snippet: clean(it.qs('description')?.text), date: (() => { const d = new Date(clean(it.qs('pubDate')?.text)); return Number.isNaN(+d) ? undefined : d.toISOString().slice(0, 10); })() }));
      if (items.length) return mk('bing', items);
    }
    // Repli : page HTML de résultats (liens enveloppés /ck/a décodés localement).
    const { text } = await getText(`https://www.bing.com/search?q=${enc(query)}${first}`, { fetchImpl, signal });
    const doc = parseHtml(text);
    return mk('bing', doc.qsa('li.b_algo').map((li) => {
      const a = li.qs('h2 a');
      return a && { url: unwrapBing(a.attr('href')), title: clean(a.text), snippet: clean((li.qs('.b_caption p') || li.qs('p'))?.text) };
    }).filter(Boolean));
  },
};

const mojeekWeb = {
  meta: { id: 'mojeek-web', name: 'Mojeek', short: 'MO', color: '#2E7BCF', kind: 'web', modes: ['web', 'petit', 'tout'], paged: true, homepage: 'https://www.mojeek.com', termsUrl: 'https://www.mojeek.com/about/legal/', supports: sup('mojeek'), method: 'HTML www.mojeek.com/search' },
  buildQuery: (ast) => translate('mojeek', ast),
  async search(ast, { signal, fetchImpl, page = 1 }) {
    const { query } = this.buildQuery(ast);
    if (!query.trim()) return [];
    const { text } = await getText(`https://www.mojeek.com/search?q=${enc(query)}${page > 1 ? `&s=${(page - 1) * 10 + 1}` : ''}${ast.lang ? `&lb=${enc(lang2(ast))}` : ''}`, { fetchImpl, signal });
    const doc = parseHtml(text);
    return mk('mojeek-web', doc.qsa('ul.results-standard > li, ul[class*=results] > li').map((li) => {
      const a = li.qs('h2 a') || li.qs('a.title') || li.qs('a.ob');
      return a && { url: a.attr('href'), title: clean(a.text), snippet: clean(li.qs('p.s')?.text) };
    }).filter(Boolean));
  },
};

const braveWeb = {
  meta: { id: 'brave-web', name: 'Brave Search', short: 'BV', color: '#FB542B', kind: 'web', modes: W, paged: true, homepage: 'https://search.brave.com', termsUrl: 'https://search.brave.com/help/terms-of-service', supports: sup('brave'), method: 'HTML search.brave.com/search' },
  buildQuery: (ast) => translate('brave', ast),
  async search(ast, { signal, fetchImpl, page = 1 }) {
    const { query } = this.buildQuery(ast);
    if (!query.trim()) return [];
    const { text } = await getText(`https://search.brave.com/search?q=${enc(query)}&source=web${page > 1 ? `&offset=${page - 1}` : ''}`, { fetchImpl, signal, retries: 0 });
    const doc = parseHtml(text);
    return mk('brave-web', doc.qsa('div[data-type=web]').map((d) => {
      const a = d.qsa('a').find((x) => isHttp(x.attr('href')) && x.qs('[class*=title]')) || d.qsa('a').find((x) => isHttp(x.attr('href')) && !x.attr('href').includes('#')) || d.qsa('a').find((x) => isHttp(x.attr('href')));
      if (!a) return null;
      const t = a.qsa('[class*=title]');
      const sn = d.qs('[class*=snippet] [class*=content]') || d.qs('[class*=snippet]') || d.qs('[class*=description]');
      return { url: a.attr('href'), title: clean((t[t.length - 1] || a).text), snippet: clean(sn?.text) };
    }).filter(Boolean));
  },
};

function unwrapYahoo(u) { const i = u.indexOf('/RU='); return i < 0 ? u : decodeURIComponent(u.slice(i + 4).split('/RK=')[0].split('/RS=')[0]); }
const yahoo = {
  meta: { id: 'yahoo', name: 'Yahoo', short: 'YH', color: '#6001D2', kind: 'web', modes: W, paged: true, homepage: 'https://search.yahoo.com', termsUrl: 'https://legal.yahoo.com', supports: sup('yahoo'), method: 'HTML search.yahoo.com/search' },
  buildQuery: (ast) => translate('yahoo', ast),
  async search(ast, { signal, fetchImpl, page = 1 }) {
    const { query } = this.buildQuery(ast);
    if (!query.trim()) return [];
    const host = ast.lang === 'fr' || ast.region === 'fr' ? 'fr.search.yahoo.com' : 'search.yahoo.com';
    let r;
    try { r = await getText(`https://${host}/search?p=${enc(query)}${page > 1 ? `&b=${(page - 1) * 7 + 1}` : ''}`, { fetchImpl, signal, retries: 0 }); } catch (e) {
      if (e.status === 500 || e.status === 999) throw new EngineError('BLOCKED', `Yahoo redirige vers sa vérification anti-robot (HTTP ${e.status}) : non contourné`, e.status);
      throw e;
    }
    if (/\/_bv\//.test(r.finalUrl || '')) throw new EngineError('BLOCKED', 'Yahoo : vérification anti-robot (_bv) : non contournée');
    const { text } = r;
    const doc = parseHtml(text);
    return mk('yahoo', doc.qsa('div[class*=algo]').map((d) => {
      const a = d.qs('[class*=title] a') || d.qs('h3 a') || d.qs('a');
      if (!a) return null;
      const h3 = d.qs('h3');
      return { url: unwrapYahoo(a.attr('href') || ''), title: clean((h3?.qs('span') ? [...h3.qsa('span')].pop() : h3 || a).text), snippet: clean((d.qs('[class*=compText]') || d.qs('p'))?.text) };
    }).filter((r) => r && !/yahoo\.com|bing\.com\/aclick/.test(r.url)));
  },
};

const startpage = {
  meta: { id: 'startpage-web', name: 'Startpage', short: 'SP', color: '#5468FF', kind: 'web', modes: W, homepage: 'https://www.startpage.com', termsUrl: 'https://www.startpage.com/en/search/terms-of-service', supports: sup('startpage'), method: 'HTML www.startpage.com/sp/search' },
  buildQuery: (ast) => translate('startpage', ast),
  async search(ast, { signal, fetchImpl, page = 1 }) {
    const { query } = this.buildQuery(ast);
    if (!query.trim()) return [];
    const { text } = await getText(`https://www.startpage.com/sp/search?query=${enc(query)}${page > 1 ? `&page=${page}` : ''}`, { fetchImpl, signal, retries: 0 });
    const doc = parseHtml(text);
    return mk('startpage-web', doc.qsa('div[class*=result]').map((d) => {
      const a = d.qs('a[class*=result-title]') || d.qs('a[class*=result-link]');
      return a && { url: a.attr('href'), title: clean((a.qs('h2') || a).text), snippet: clean(d.qs('p')?.text) };
    }).filter(Boolean));
  },
};

const qwant = {
  meta: { id: 'qwant', name: 'Qwant', short: 'QW', color: '#5C97FF', kind: 'web', modes: W, paged: true, homepage: 'https://www.qwant.com', termsUrl: 'https://about.qwant.com/legal/terms-of-service/', supports: sup('qwant'), method: 'JSON api.qwant.com/v3/search/web (API interne du site)' },
  buildQuery: (ast) => translate('qwant', ast),
  async search(ast, { signal, fetchImpl, page = 1 }) {
    const { query } = this.buildQuery(ast);
    if (!query.trim()) return [];
    const locale = `${lang2(ast)}_${(ast.region || lang2(ast)).toUpperCase()}`;
    const { data } = await getJson(`https://api.qwant.com/v3/search/web?q=${enc(query)}&count=10&locale=${locale}&offset=${(page - 1) * 10}&device=desktop&safesearch=1`, { fetchImpl, signal, retries: 0 });
    if (data.status !== 'success') throw new EngineError('BLOCKED', `Qwant : ${data.data?.error_code === 27 ? 'captcha exigé' : 'refus'}`);
    const items = (data.data?.result?.items?.mainline || []).filter((b) => b.type === 'web').flatMap((b) => b.items || []);
    return mk('qwant', items.map((r) => ({ url: r.url, title: r.title, snippet: r.desc })));
  },
};

const mwmbl = {
  meta: { id: 'mwmbl', name: 'Mwmbl', short: 'MW', color: '#4C9A2A', kind: 'web', modes: ['web', 'petit', 'tout'], homepage: 'https://mwmbl.org', termsUrl: 'https://github.com/mwmbl/mwmbl', supports: NONE, method: 'JSON api.mwmbl.org/search (index libre)' },
  buildQuery: (ast) => ({ query: terms(ast), ignored: [] }),
  async search(ast, { signal, fetchImpl }) {
    const q = terms(ast);
    if (!q) return [];
    const { data } = await getJson(`https://api.mwmbl.org/search/?s=${enc(q)}`, { fetchImpl, signal });
    const join = (a) => (Array.isArray(a) ? a.map((x) => x.value).join('') : String(a || ''));
    return mk('mwmbl', (Array.isArray(data) ? data : []).slice(0, 30).map((r) => ({ url: r.url, title: clean(join(r.title)), snippet: clean(join(r.extract)) })));
  },
};

// SearXNG publiques : liste searx.space, bascule automatique (au plus 3 instances par recherche).
// Beaucoup d'instances désactivent le format JSON pour les robots (403/429) : c'est respecté.
const SX_FALLBACK = ['https://search.inetol.net/', 'https://sx.catgirl.cloud/', 'https://searx.tiekoetter.com/', 'https://search.hbubli.cc/', 'https://searxng.website/', 'https://priv.au/', 'https://search.sapti.me/', 'https://baresearch.org/'];
let sxList = null; let sxAt = 0;
const sxBad = new Map();
async function sxInstances({ fetchImpl, signal }) {
  if (sxList && Date.now() - sxAt < 6 * 3600e3) return sxList;
  // La liste dynamique searx.space n'est utilisée que si Monsieur a accordé l'accès optionnel à tous les sites
  // (Paramètres) ; sinon seules les instances déclarées dans le manifeste sont essayées.
  const broad = await globalThis.chrome?.permissions?.contains?.({ origins: ['https://*/*'] }).catch(() => false);
  if (globalThis.chrome?.permissions && !broad) { sxList = SX_FALLBACK; sxAt = Date.now(); return sxList; }
  try {
    const { data } = await getJson('https://searx.space/data/instances.json', { fetchImpl, signal, timeout: 8000, retries: 0 });
    const list = Object.entries(data.instances || {}).filter(([, i]) => i.network_type === 'normal' && (i.timing?.search?.success_percentage || 0) >= 80)
      .sort((a, b) => (b[1].timing?.search?.success_percentage || 0) - (a[1].timing?.search?.success_percentage || 0)).map(([u]) => u);
    sxList = [...new Set([...SX_FALLBACK, ...list])];
  } catch { sxList = SX_FALLBACK; }
  sxAt = Date.now();
  return sxList;
}
const searxPublic = {
  meta: { id: 'searx-public', name: 'SearXNG publiques', short: 'SN', color: '#3050FF', kind: 'web', modes: W, paged: true, homepage: 'https://searx.space', termsUrl: 'https://docs.searxng.org/dev/search_api.html', supports: sup('generic'), method: 'JSON /search?format=json, bascule sur 3 instances max' },
  buildQuery: (ast) => translate('generic', ast),
  async search(ast, { signal, fetchImpl, page = 1, key }) {
    const { query } = this.buildQuery(ast);
    if (!query.trim()) return [];
    const list = key ? [key.replace(/\/?$/, '/')] : (await sxInstances({ fetchImpl, signal })).filter((u) => !(sxBad.get(u) > Date.now()));
    const errors = [];
    if (!list.length) throw new EngineError('BLOCKED', 'Toutes les instances SearXNG connues refusent le JSON (en pause 30 min)');
    for (const base of list.slice(0, 3)) {
      try {
        const { data } = await getJson(`${base}search?q=${enc(query)}&format=json&pageno=${page}${ast.lang ? `&language=${enc(ast.lang)}` : ''}`, { fetchImpl, signal, retries: 0, timeout: 7000 });
        const res = (data.results || []).map((r) => ({ url: r.url, title: r.title, snippet: r.content || '', date: day(r.publishedDate), via: base }));
        if (res.length) return mk('searx-public', res);
        errors.push(`${new URL(base).host}: 0`);
      } catch (e) {
        if (e.code === 'ABORT') throw e;
        sxBad.set(base, Date.now() + 30 * 60e3);
        errors.push(`${new URL(base).host}: ${e.status || e.code}`);
      }
    }
    throw new EngineError(errors.every((x) => /403|429|BLOCKED|NO_KEY/.test(x)) ? 'BLOCKED' : 'HTTP', `Aucune instance n'accepte le JSON (${errors.join(', ')})`);
  },
};

const marginalia = {
  meta: { id: 'marginalia', name: 'Marginalia', short: 'MG', color: '#7C5CFF', kind: 'fetch', modes: ['web', 'petit', 'tout'], paged: true, homepage: 'https://marginalia-search.com', termsUrl: 'https://about.marginalia-search.com/article/api/', license: 'CC-BY-NC-SA 4.0', keyOptional: true, supports: sup('marginalia'), method: "API officielle, clé partagée « public » (souvent saturée) ou clé gratuite personnelle" },
  buildQuery: (ast) => translate('marginalia', ast),
  async search(ast, { key, signal, fetchImpl, page = 1 }) {
    const { query } = this.buildQuery(ast);
    if (!query.trim()) return [];
    const { data } = await getJson(`https://api2.marginalia-search.com/search?query=${enc(query)}&count=20&page=${page}&dc=2&nsfw=0`, { fetchImpl, signal, retries: 0, headers: { 'API-Key': key || 'public' } });
    return mk('marginalia', (data.results || []).map((r) => ({ url: r.url, title: clean(r.title), snippet: clean(r.description) })));
  },
};

const wiby = {
  meta: { id: 'wiby', name: 'Wiby', short: 'WB', color: '#3FA34D', kind: 'fetch', modes: ['web', 'petit', 'tout'], paged: true, homepage: 'https://wiby.me', termsUrl: 'https://wiby.me/about/', supports: NONE, method: 'JSON wiby.me/json' },
  buildQuery: (ast) => ({ query: plainTerms(ast).join(' '), ignored: [] }),
  async search(ast, { signal, fetchImpl, page = 1 }) {
    const q = plainTerms(ast).join(' ');
    if (!q.trim()) return [];
    const { data } = await getJson(`https://wiby.me/json/?q=${enc(q)}${page > 1 ? `&p=${page}` : ''}`, { fetchImpl, signal });
    return mk('wiby', (Array.isArray(data) ? data : []).map((r) => ({ url: r.URL, title: clean(r.Title), snippet: clean(r.Snippet) })));
  },
};


// 4get : métamoteur libre (AGPL-3.0) dont l'API JSON publique autorise l'usage personnel déclenché par un humain.
// Certaines instances exigent un « pass » obtenu par captcha : dans ce cas la source est marquée bloquée.
const fourget = {
  meta: { id: '4get', name: '4get (4get.ca)', short: '4G', color: '#8F4AE0', kind: 'web', modes: W, homepage: 'https://4get.ca', termsUrl: 'https://4get.ca/api.txt', supports: sup('generic'), method: 'API JSON publique /api/v1/web (usage personnel)' },
  buildQuery: (ast) => translate('generic', ast),
  async search(ast, { signal, fetchImpl }) {
    const { query } = this.buildQuery(ast);
    if (!query.trim()) return [];
    const { data } = await getJson(`https://4get.ca/api/v1/web?s=${enc(query)}`, { fetchImpl, signal, retries: 0 });
    if (data.status !== 'ok') throw new EngineError('BLOCKED', `4get : ${String(data.status).slice(0, 80)}`);
    return mk('4get', (data.web || []).map((r) => ({ url: r.url, title: r.title, snippet: r.description || '', date: r.date ? new Date(r.date * 1000).toISOString().slice(0, 10) : undefined })));
  },
};

// ---------- Savoir ----------
const wikipedia = {
  meta: { id: 'wikipedia', name: 'Wikipédia', short: 'WP', color: '#636466', kind: 'fetch', modes: ['web', 'savoir', 'tout'], paged: true, homepage: 'https://www.wikipedia.org', termsUrl: 'https://foundation.wikimedia.org/wiki/Policy:Terms_of_Use', license: 'CC BY-SA 4.0', supports: NONE, method: 'API MediaWiki list=search (FR puis EN)' },
  buildQuery: (ast) => ({ query: simple(ast), ignored: [] }),
  async search(ast, { signal, fetchImpl, page = 1 }) {
    const q = simple(ast);
    if (!q) return [];
    const langs = ast.lang ? [lang2(ast)] : ['fr', 'en'];
    const all = await Promise.all(langs.map(async (l) => {
      const { data } = await getJson(`https://${l}.wikipedia.org/w/api.php?action=query&list=search&srsearch=${enc(q)}&srlimit=10&sroffset=${(page - 1) * 10}&format=json&utf8=1`, { fetchImpl, signal });
      return (data.query?.search || []).map((r) => ({ url: `https://${l}.wikipedia.org/wiki/${enc(r.title.replace(/ /g, '_'))}`, title: `${r.title} (${l})`, snippet: stripTags(r.snippet), date: day(r.timestamp) }));
    }));
    const out = []; const n = Math.max(...all.map((a) => a.length));
    for (let i = 0; i < n; i++) for (const a of all) if (a[i]) out.push(a[i]);
    return mk('wikipedia', out);
  },
};

const wikidata = {
  meta: { id: 'wikidata', name: 'Wikidata', short: 'WD', color: '#006699', kind: 'fetch', modes: ['savoir', 'tout'], homepage: 'https://www.wikidata.org', termsUrl: 'https://www.wikidata.org/wiki/Wikidata:Licensing', license: 'CC0', supports: NONE, method: 'API wbsearchentities' },
  buildQuery: (ast) => ({ query: terms(ast), ignored: [] }),
  async search(ast, { signal, fetchImpl }) {
    const q = terms(ast);
    if (!q) return [];
    const { data } = await getJson(`https://www.wikidata.org/w/api.php?action=wbsearchentities&search=${enc(q)}&language=${lang2(ast)}&uselang=${lang2(ast)}&type=item&limit=20&format=json`, { fetchImpl, signal });
    return mk('wikidata', (data.search || []).map((r) => ({ url: r.concepturi?.replace('http://', 'https://') || `https://www.wikidata.org/wiki/${r.id}`, title: `${r.label || r.id} — ${r.id}`, snippet: r.description || '' })));
  },
};

const openalex = {
  meta: { id: 'openalex', name: 'OpenAlex', short: 'OA', color: '#C2410C', kind: 'fetch', modes: ['savoir', 'tout'], paged: true, homepage: 'https://openalex.org', termsUrl: 'https://openalex.org/terms', license: 'CC0', supports: NONE, method: 'API publique /works?search (budget gratuit partagé par IP)' },
  buildQuery: (ast) => ({ query: terms(ast), ignored: [] }),
  async search(ast, { signal, fetchImpl, page = 1 }) {
    const q = terms(ast);
    if (!q) return [];
    const { data } = await getJson(`https://api.openalex.org/works?search=${enc(q)}&per_page=20&page=${page}&select=id,doi,display_name,publication_date,primary_location,authorships,cited_by_count`, { fetchImpl, signal });
    return mk('openalex', (data.results || []).map((w) => ({ url: w.doi || w.primary_location?.landing_page_url || w.id, title: w.display_name, snippet: [(w.authorships || []).slice(0, 3).map((a) => a.author?.display_name).filter(Boolean).join(', '), w.primary_location?.source?.display_name, w.cited_by_count != null ? `${w.cited_by_count} citations` : ''].filter(Boolean).join(' · '), date: w.publication_date })));
  },
};

const crossref = {
  meta: { id: 'crossref', name: 'Crossref', short: 'CR', color: '#3EB1C8', kind: 'fetch', modes: ['savoir', 'tout'], paged: true, homepage: 'https://www.crossref.org', termsUrl: 'https://www.crossref.org/documentation/retrieve-metadata/rest-api/', supports: NONE, method: 'API REST publique /works' },
  buildQuery: (ast) => ({ query: terms(ast), ignored: [] }),
  async search(ast, { signal, fetchImpl, page = 1 }) {
    const q = terms(ast);
    if (!q) return [];
    const { data } = await getJson(`https://api.crossref.org/works?query=${enc(q)}&rows=20&offset=${(page - 1) * 20}&select=DOI,title,author,container-title,issued,URL`, { fetchImpl, signal, timeout: 12000 });
    return mk('crossref', (data.message?.items || []).map((w) => ({ url: w.URL || `https://doi.org/${w.DOI}`, title: clean((w.title || [])[0] || w.DOI), snippet: [(w.author || []).slice(0, 3).map((a) => `${a.given || ''} ${a.family || ''}`.trim()).join(', '), (w['container-title'] || [])[0]].filter(Boolean).join(' · '), date: w.issued?.['date-parts']?.[0]?.filter(Boolean).map((x) => String(x).padStart(2, '0')).join('-') })));
  },
};

const arxiv = {
  meta: { id: 'arxiv', name: 'arXiv', short: 'AX', color: '#B31B1B', kind: 'fetch', modes: ['savoir', 'tout'], paged: true, homepage: 'https://arxiv.org', termsUrl: 'https://info.arxiv.org/help/api/tou.html', supports: NONE, method: 'API Atom export.arxiv.org (1 requête / 3 s)' },
  buildQuery: (ast) => ({ query: terms(ast), ignored: [] }),
  async search(ast, { signal, fetchImpl, page = 1 }) {
    const q = terms(ast);
    if (!q) return [];
    const sq = q.split(/\s+/).map((w) => `all:${w.replace(/[^\p{L}\p{N}-]/gu, '')}`).filter((w) => w.length > 4).join('+AND+');
    const { text } = await getText(`https://export.arxiv.org/api/query?search_query=${sq}&start=${(page - 1) * 20}&max_results=20`, { fetchImpl, signal, timeout: 15000 });
    const doc = parseXml(text);
    return mk('arxiv', doc.qsa('entry').map((e) => ({ url: clean(e.qs('id')?.text).replace(/^http:/, 'https:'), title: clean(e.qs('title')?.text), snippet: `${e.qsa('author > name').slice(0, 3).map((n) => clean(n.text)).join(', ')} · ${clean(e.qs('summary')?.text).slice(0, 220)}`, date: day(clean(e.qs('published')?.text)) })));
  },
};

const iaSearch = {
  meta: { id: 'ia-search', name: 'Internet Archive (collections)', short: 'IA', color: '#A8742F', kind: 'fetch', modes: ['archives', 'savoir', 'tout'], paged: true, homepage: 'https://archive.org', termsUrl: 'https://archive.org/about/terms.php', supports: NONE, method: 'advancedsearch.php output=json' },
  buildQuery: (ast) => ({ query: terms(ast), ignored: [] }),
  async search(ast, { signal, fetchImpl, page = 1 }) {
    const q = terms(ast);
    if (!q) return [];
    const { data } = await getJson(`https://archive.org/advancedsearch.php?q=${enc(q)}&fl%5B%5D=identifier&fl%5B%5D=title&fl%5B%5D=description&fl%5B%5D=date&fl%5B%5D=mediatype&rows=25&page=${page}&output=json`, { fetchImpl, signal, timeout: 12000 });
    return mk('ia-search', (data.response?.docs || []).map((d) => ({ url: `https://archive.org/details/${d.identifier}`, title: Array.isArray(d.title) ? d.title[0] : d.title, snippet: `${d.mediatype || ''} · ${stripTags(Array.isArray(d.description) ? d.description[0] : d.description).slice(0, 220)}`, date: day(d.date) })));
  },
};

// ---------- Code et communautés ----------
const githubIssues = {
  meta: { id: 'github-issues', name: 'GitHub (tickets et PR)', short: 'GI', color: '#57606A', kind: 'fetch', modes: ['code', 'tout'], paged: true, homepage: 'https://github.com', termsUrl: 'https://docs.github.com/rest/search', keyOptional: true, supports: NONE, method: 'API REST search/issues non authentifiée (10 req./min)' },
  buildQuery: (ast) => ({ query: simple(ast), ignored: [] }),
  async search(ast, { signal, fetchImpl, page = 1, key }) {
    const q = simple(ast);
    if (!q) return [];
    const headers = { Accept: 'application/vnd.github+json' };
    if (key) headers.Authorization = `Bearer ${key}`;
    const { data } = await getJson(`https://api.github.com/search/issues?q=${enc(q)}&per_page=20&page=${page}`, { fetchImpl, signal, headers, retries: 0 });
    return mk('github-issues', (data.items || []).map((r) => ({ url: r.html_url, title: r.title, snippet: `${r.repository_url?.split('/repos/')[1] || ''} · ${r.state} · ${r.comments} commentaire(s)`, date: day(r.updated_at) })));
  },
};

const hn = {
  meta: { id: 'hn', name: 'Hacker News', short: 'HN', color: '#FF6600', kind: 'fetch', modes: ['code', 'social', 'tout'], paged: true, homepage: 'https://news.ycombinator.com', termsUrl: 'https://hn.algolia.com/api', supports: NONE, method: 'API Algolia publique' },
  buildQuery: (ast) => ({ query: simple(ast), ignored: [] }),
  async search(ast, { signal, fetchImpl, page = 1 }) {
    const q = simple(ast);
    if (!q) return [];
    const { data } = await getJson(`https://hn.algolia.com/api/v1/search?query=${enc(q)}&hitsPerPage=20&page=${page - 1}`, { fetchImpl, signal });
    return mk('hn', (data.hits || []).map((h) => ({ url: h.url || `https://news.ycombinator.com/item?id=${h.objectID}`, title: h.title || h.story_title || stripTags(h.comment_text).slice(0, 90), snippet: `HN · ${h.points ?? 0} points · ${h.num_comments ?? 0} commentaires · https://news.ycombinator.com/item?id=${h.objectID}`, date: day(h.created_at) })));
  },
};

const reddit = {
  meta: { id: 'reddit', name: 'Reddit', short: 'RE', color: '#FF4500', kind: 'fetch', modes: ['social', 'tout'], paged: false, homepage: 'https://www.reddit.com', termsUrl: 'https://www.redditinc.com/policies/data-api-terms', supports: NONE, method: 'JSON public /search.json' },
  buildQuery: (ast) => ({ query: simple(ast), ignored: [] }),
  async search(ast, { signal, fetchImpl }) {
    const q = simple(ast);
    if (!q) return [];
    const { data } = await getJson(`https://www.reddit.com/search.json?q=${enc(q)}&limit=25&sort=relevance&raw_json=1`, { fetchImpl, signal, retries: 0 });
    return mk('reddit', (data.data?.children || []).map(({ data: p }) => ({ url: `https://www.reddit.com${p.permalink}`, title: p.title, snippet: `r/${p.subreddit} · ${p.score} votes · ${p.num_comments} commentaires${p.selftext ? ` · ${p.selftext.slice(0, 160)}` : ''}`, date: p.created_utc ? new Date(p.created_utc * 1000).toISOString().slice(0, 10) : undefined })));
  },
};

const stackexchange = {
  meta: { id: 'stackexchange', name: 'Stack Exchange', short: 'SE', color: '#F48024', kind: 'fetch', modes: ['code', 'tout'], paged: true, homepage: 'https://stackexchange.com', termsUrl: 'https://api.stackexchange.com/docs/throttle', supports: NONE, method: 'API 2.3 sans clé (300 req./jour/IP)' },
  buildQuery: (ast) => ({ query: terms(ast), ignored: [] }),
  async search(ast, { signal, fetchImpl, page = 1 }) {
    const q = terms(ast);
    if (!q) return [];
    const { data } = await getJson(`https://api.stackexchange.com/2.3/search/advanced?q=${enc(q)}&site=stackoverflow&order=desc&sort=relevance&pagesize=20&page=${page}`, { fetchImpl, signal, retries: 0 });
    if (data.error_id) throw new EngineError(data.error_id === 502 ? 'RATE_LIMIT' : 'HTTP', data.error_message || 'Erreur Stack Exchange');
    return mk('stackexchange', (data.items || []).map((r) => ({ url: r.link, title: clean(r.title), snippet: `${r.is_answered ? 'Résolu' : 'Ouvert'} · ${r.score} votes · ${r.answer_count} réponses · ${(r.tags || []).slice(0, 4).join(', ')}`, date: r.last_activity_date ? new Date(r.last_activity_date * 1000).toISOString().slice(0, 10) : undefined })));
  },
};

const LEMMY = ['https://lemmy.world', 'https://lemmy.ml'];
const lemmy = {
  meta: { id: 'lemmy', name: 'Lemmy', budget: 30000, short: 'LM', color: '#00BC8C', kind: 'fetch', modes: ['social', 'tout'], paged: true, homepage: 'https://join-lemmy.org', termsUrl: 'https://join-lemmy.org/docs/', supports: NONE, method: 'API v3 /search publique (lemmy.world, repli lemmy.ml)' },
  buildQuery: (ast) => ({ query: terms(ast), ignored: [] }),
  async search(ast, { signal, fetchImpl, page = 1 }) {
    const q = terms(ast);
    if (!q) return [];
    let last;
    for (const base of LEMMY) {
      try {
        const { data } = await getJson(`${base}/api/v3/search?q=${enc(q)}&type_=Posts&sort=TopAll&listing_type=All&limit=20&page=${page}`, { fetchImpl, signal, retries: 0, timeout: 12000 });
        return mk('lemmy', (data.posts || []).map(({ post, community, counts }) => ({ url: post.url && isHttp(post.url) ? post.url : post.ap_id, title: post.name, snippet: `!${community?.name || ''} · ${counts?.score ?? 0} points · ${counts?.comments ?? 0} commentaires · discussion : ${post.ap_id}`, date: day(post.published) })));
      } catch (e) { if (e.code === 'ABORT') throw e; last = e; }
    }
    throw last;
  },
};

const mastodon = {
  meta: { id: 'mastodon', name: 'Mastodon', short: 'MA', color: '#6364FF', kind: 'fetch', modes: ['social', 'tout'], homepage: 'https://mastodon.social', termsUrl: 'https://mastodon.social/terms', supports: NONE, method: 'API publique : comptes et hashtags (/api/v2/search) + fil public du hashtag' },
  buildQuery: (ast) => ({ query: terms(ast), ignored: [] }),
  async search(ast, { signal, fetchImpl }) {
    const q = terms(ast);
    if (!q) return [];
    const { data } = await getJson(`https://mastodon.social/api/v2/search?q=${enc(q)}&limit=20&resolve=false`, { fetchImpl, signal });
    const tag = /\s/.test(q.trim()) ? '' : q.replace(/[^\p{L}\p{N}_]/gu, '');
    let posts = [];
    if (tag) {
      try { posts = (await getJson(`https://mastodon.social/api/v1/timelines/tag/${enc(tag)}?limit=20`, { fetchImpl, signal, retries: 0 })).data || []; } catch { posts = []; }
    }
    return mk('mastodon', [
      ...(data.accounts || []).map((a) => ({ url: a.url, title: `${a.display_name || a.username} (@${a.acct})`, snippet: `Compte · ${a.followers_count} abonnés · ${stripTags(a.note).slice(0, 160)}`, date: day(a.created_at) })),
      ...(data.hashtags || []).map((h) => ({ url: h.url, title: `#${h.name}`, snippet: 'Hashtag Mastodon' })),
      ...posts.map((p) => ({ url: p.url || p.uri, title: `${p.account?.display_name || p.account?.acct} : ${stripTags(p.content).slice(0, 90)}`, snippet: stripTags(p.content).slice(0, 240), date: day(p.created_at) })),
    ]);
  },
};

const bluesky = {
  meta: { id: 'bluesky', name: 'Bluesky', short: 'BS', color: '#1185FE', kind: 'fetch', modes: ['social', 'tout'], paged: true, homepage: 'https://bsky.app', termsUrl: 'https://docs.bsky.app/docs/advanced-guides/api-directory', supports: NONE, method: 'AppView publique : searchPosts (api.bsky.app) + searchActors (public.api.bsky.app)' },
  buildQuery: (ast) => ({ query: simple(ast), ignored: [] }),
  async search(ast, { signal, fetchImpl }) {
    const q = simple(ast);
    if (!q) return [];
    const toUrl = (uri, handle) => { const m = /^at:\/\/([^/]+)\/app\.bsky\.feed\.post\/(.+)$/.exec(uri || ''); return m ? `https://bsky.app/profile/${handle || m[1]}/post/${m[2]}` : null; };
    const [posts, actors] = await Promise.allSettled([
      getJson(`https://api.bsky.app/xrpc/app.bsky.feed.searchPosts?q=${enc(q)}&limit=25${ast.lang ? `&lang=${enc(ast.lang)}` : ''}`, { fetchImpl, signal, retries: 0 }),
      getJson(`https://public.api.bsky.app/xrpc/app.bsky.actor.searchActors?q=${enc(q)}&limit=10`, { fetchImpl, signal, retries: 0 }),
    ]);
    if (posts.status === 'rejected' && actors.status === 'rejected') throw posts.reason;
    const out = [];
    if (posts.status === 'fulfilled') out.push(...(posts.value.data.posts || []).map((p) => ({ url: toUrl(p.uri, p.author?.handle), title: `${p.author?.displayName || p.author?.handle} : ${(p.record?.text || '').slice(0, 90)}`, snippet: `${p.record?.text || ''} · ${p.likeCount ?? 0} j'aime`, date: day(p.record?.createdAt || p.indexedAt) })));
    if (actors.status === 'fulfilled') out.push(...(actors.value.data.actors || []).map((a) => ({ url: `https://bsky.app/profile/${a.handle}`, title: `${a.displayName || a.handle} (@${a.handle})`, snippet: `Compte · ${(a.description || '').slice(0, 180)}` })));
    return mk('bluesky', out);
  },
};

// ---------- Infrastructure passive ----------
const DNS_TYPES = ['A', 'AAAA', 'MX', 'NS', 'TXT', 'CNAME', 'SOA', 'CAA'];
const doh = {
  meta: { id: 'doh', name: 'DNS (DoH)', short: 'DN', color: '#0E7490', kind: 'fetch', modes: ['infra', 'tout'], needsTarget: true, homepage: 'https://developers.google.com/speed/public-dns/docs/doh/json', termsUrl: 'https://developers.google.com/speed/public-dns/terms', supports: {}, method: 'DNS-over-HTTPS JSON (dns.google, repli Cloudflare)' },
  buildQuery: (ast) => ({ query: targetDomain(ast) || '', ignored: [] }),
  async search(ast, { signal, fetchImpl }) {
    const domain = targetDomain(ast);
    if (!domain) throw new EngineError('NO_TARGET', 'Domaine requis');
    const one = async (type) => {
      try { return (await getJson(`https://dns.google/resolve?name=${enc(domain)}&type=${type}`, { fetchImpl, signal, retries: 0 })).data; } catch (e) {
        if (e.code === 'ABORT') throw e;
        return (await getJson(`https://cloudflare-dns.com/dns-query?name=${enc(domain)}&type=${type}`, { fetchImpl, signal, retries: 0, headers: { Accept: 'application/dns-json' } })).data;
      }
    };
    const res = await Promise.all(DNS_TYPES.map(async (t) => [t, await one(t).catch(() => null)]));
    const out = res.filter(([, d]) => d?.Answer?.length).map(([t, d]) => ({ url: `https://dns.google/query?name=${enc(domain)}&rr_type=${t}`, title: `${domain} — enregistrements ${t}`, snippet: d.Answer.map((a) => a.data).slice(0, 12).join(' · ') }));
    if (!res.some(([, d]) => d)) throw new EngineError('NETWORK', 'Résolveurs DoH injoignables');
    return mk('doh', out);
  },
};

export const OPEN_ENGINES = [ddg, bing, braveWeb, mojeekWeb, yahoo, startpage, qwant, searxPublic, fourget, mwmbl, marginalia, wiby, wikipedia, wikidata, openalex, crossref, arxiv, iaSearch, githubIssues, hn, reddit, stackexchange, lemmy, mastodon, bluesky, doh];
