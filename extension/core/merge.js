// Normalisation d'URL, dédoublonnage, Reciprocal Rank Fusion (k=60), rareté.
export const RRF_K = 60;
export const INDEPENDENT = new Set(['marginalia', 'wiby', 'mojeek', 'brave', 'searxng', 'mojeek-web', 'brave-web', 'mwmbl']);
const TRACKING = /^(utm_[a-z]+|fbclid|gclid|dclid|msclkid|mc_cid|mc_eid|igshid|ref_src|_hsenc|_hsmi|yclid)$/i;

export function normalizeUrl(input) {
  let u;
  try { u = new URL(String(input).trim()); } catch { return String(input).trim().toLowerCase(); }
  const host = u.hostname.toLowerCase().replace(/^www\d?\./, '');
  const params = [...u.searchParams.entries()].filter(([k]) => !TRACKING.test(k)).sort(([a], [b]) => a.localeCompare(b));
  const qs = params.length ? `?${new URLSearchParams(params).toString()}` : '';
  let path = u.pathname.replace(/\/{2,}/g, '/').replace(/\/(index\.(html?|php))?$/i, '');
  if (!path) path = '';
  const port = u.port && !['80', '443'].includes(u.port) ? `:${u.port}` : '';
  return `${host}${port}${path}${qs}`;
}

export function domainOf(url) {
  try { return new URL(url).hostname.toLowerCase().replace(/^www\d?\./, ''); } catch { return ''; }
}

export function tldOf(url) {
  const d = domainOf(url);
  const i = d.lastIndexOf('.');
  return i > 0 ? d.slice(i + 1) : '';
}

const words = (s) => new Set(String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').split(/[^a-z0-9]+/).filter((w) => w.length > 2));
export function titleSimilarity(a, b) {
  const A = words(a); const B = words(b);
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const w of A) if (B.has(w)) inter++;
  return inter / (A.size + B.size - inter);
}

// rawByEngine : { engineId: RawResult[] }  -> résultats fusionnés triés par score RRF.
export function mergeResults(rawByEngine, { weights = {} } = {}) {
  const byKey = new Map();
  const list = [];
  for (const [engine, results] of Object.entries(rawByEngine)) {
    results.forEach((r, i) => {
      const rank = r.rank ?? i + 1;
      const key = normalizeUrl(r.url);
      let item = byKey.get(key);
      if (!item) {
        // Même domaine + titre quasi identique : fusion également.
        const d = domainOf(r.url);
        item = list.find((x) => x.domain === d && r.title && titleSimilarity(x.title, r.title) >= 0.9 && x.key.split('?')[0] === key.split('?')[0]);
      }
      if (!item) {
        item = { key, url: r.url, title: r.title || r.url, snippet: r.snippet || '', domain: domainOf(r.url), date: r.date || null, engines: [], ranks: {}, score: 0, extra: r.extra || null };
        byKey.set(key, item);
        list.push(item);
      }
      if (!item.engines.includes(engine)) item.engines.push(engine);
      item.ranks[engine] = Math.min(item.ranks[engine] ?? Infinity, rank);
      if (!item.snippet && r.snippet) item.snippet = r.snippet;
      if (r.snippet && r.snippet.length > item.snippet.length && item.snippet.length < 80) item.snippet = r.snippet;
      if (!item.date && r.date) item.date = r.date;
      if (r.url.startsWith('https:') && item.url.startsWith('http:')) item.url = r.url;
    });
  }
  for (const item of list) {
    item.score = Object.entries(item.ranks).reduce((s, [e, rank]) => s + (weights[e] ?? 1) / (RRF_K + rank), 0);
    item.rare = item.engines.length === 1 && INDEPENDENT.has(item.engines[0]);
  }
  return list.sort((a, b) => b.score - a.score);
}

// Lentille de rareté : 0 = grand public (RRF pur), 1 = profondeurs (rares, petit web, archives d'abord).
export function rarityScore(item, dominant = DEFAULT_DOMINANT) {
  let s = 0;
  if (item.rare) s += 0.5;
  if (item.engines.some((e) => e === 'wiby' || e === 'marginalia')) s += 0.25;
  if (item.engines.some((e) => e === 'wayback' || e === 'commoncrawl')) s += 0.25;
  if (dominant.some((d) => item.domain === d || item.domain.endsWith(`.${d}`))) s -= 0.6;
  return s;
}

export function sortResults(items, mode = 'relevance', lens = 0, dominant) {
  const arr = [...items];
  const max = Math.max(...arr.map((i) => i.score), 1e-9);
  if (mode === 'rarity') return arr.sort((a, b) => rarityScore(b, dominant) - rarityScore(a, dominant) || b.score - a.score);
  if (mode === 'date') return arr.sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')) || b.score - a.score);
  if (mode === 'domain') return arr.sort((a, b) => a.domain.localeCompare(b.domain) || b.score - a.score);
  const f = (i) => (1 - lens) * (i.score / max) + lens * rarityScore(i, dominant);
  return arr.sort((a, b) => f(b) - f(a));
}

export const DEFAULT_DOMINANT = ['wikipedia.org', 'youtube.com', 'amazon.com', 'amazon.fr', 'facebook.com', 'instagram.com', 'linkedin.com', 'pinterest.com', 'tiktok.com', 'x.com', 'twitter.com', 'reddit.com', 'quora.com'];

export function domainCounts(items) {
  const m = new Map();
  for (const i of items) m.set(i.domain, (m.get(i.domain) || 0) + 1);
  return [...m.entries()].sort((a, b) => b[1] - a[1]);
}

// Filtrage local des opérateurs non supportés par une API.
export function localFilter(results, ast, supports = {}) {
  let removed = 0;
  const applied = new Set();
  const low = (s) => String(s || '').toLowerCase();
  const kept = results.filter((r) => {
    const text = low(`${r.title} ${r.snippet}`);
    const url = low(r.url);
    const host = domainOf(r.url);
    const checks = [];
    if (!supports.site && ast.site.length) checks.push(['site', ast.site.some((s) => { const d = s.replace(/^\*\./, '').split('/')[0]; return host === d || host.endsWith(`.${d}`); })]);
    if (!supports.notSite && ast.notSite.length) checks.push(['notSite', !ast.notSite.some((s) => host === s || host.endsWith(`.${s}`))]);
    if (!supports.filetype && ast.filetype.length) checks.push(['filetype', ast.filetype.some((f) => new RegExp(`\\.${f}($|[?#])`, 'i').test(url))]);
    if (!supports.none && ast.none.length) checks.push(['none', !ast.none.filter((n) => !/^[a-z]+:/.test(n)).some((n) => text.includes(low(n)))]);
    if (!supports.inurl && ast.inurl.length) checks.push(['inurl', ast.inurl.every((s) => url.includes(low(s)))]);
    if (!supports.intitle && ast.intitle.length) checks.push(['intitle', ast.intitle.every((s) => low(r.title).includes(low(s)))]);
    for (const [k] of checks) applied.add(k);
    const ok = checks.every(([, v]) => v);
    if (!ok) removed++;
    return ok;
  });
  return { results: kept, removed, applied: [...applied] };
}
