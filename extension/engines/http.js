// Requêtes polies : timeout, backoff 1 s puis 2 s sur 429/503 (2 essais max), file d'attente par hôte,
// pause automatique d'une source bloquée. Aucun contournement : pas de proxy, pas de changement d'identité,
// pas de résolution de captcha. Une page anti-robot est simplement signalée « bloquée ».
export class EngineError extends Error {
  constructor(code, message, status) { super(message); this.code = code; this.status = status; }
}

const sleep = (ms, signal) => new Promise((res, rej) => {
  const t = setTimeout(res, ms);
  signal?.addEventListener('abort', () => { clearTimeout(t); rej(new EngineError('ABORT', 'Annulé')); }, { once: true });
});

// --- Rate limiting poli : un intervalle minimal entre deux requêtes vers le même hôte. ---
const HOST_GAP = { 'html.duckduckgo.com': 1500, 'lite.duckduckgo.com': 1500, 'search.brave.com': 2000, 'www.mojeek.com': 1500, 'search.yahoo.com': 1200, 'www.bing.com': 800, 'api.github.com': 1000, 'www.reddit.com': 2000, 'api.stackexchange.com': 500, 'crt.sh': 1500, 'index.commoncrawl.org': 1000, 'export.arxiv.org': 3000, default: 250 };
const hostQueue = new Map();
const hostLast = new Map();
export function politeGate(url) {
  let host = '';
  try { host = new URL(url).hostname; } catch { return Promise.resolve(); }
  const gap = HOST_GAP[host] ?? HOST_GAP.default;
  const prev = hostQueue.get(host) || Promise.resolve();
  const run = prev.then(async () => {
    const wait = gap - (Date.now() - (hostLast.get(host) || 0));
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    hostLast.set(host, Date.now());
  });
  hostQueue.set(host, run.catch(() => {}));
  return run;
}

// --- Pause d'une source après blocage (429 / anti-robot) : on ne réessaie pas en boucle. ---
const cooldown = new Map();
export const COOLDOWN_MS = 10 * 60 * 1000;
export function inCooldown(id) { const t = cooldown.get(id); return t && Date.now() < t ? t : 0; }
export function setCooldown(id, ms = COOLDOWN_MS) { cooldown.set(id, Date.now() + ms); }
export function clearCooldowns() { cooldown.clear(); }

// Indices d'une page de défi anti-robot ou de captcha : la source est marquée bloquée, rien n'est contourné.
const BLOCK_MARKERS = /<title>[^<]{0,40}(captcha|just a moment|attention required|security check)|anubis_challenge|g-recaptcha|h-captcha|hcaptcha\.com|cf-chl-|challenge-platform|captcha-delivery|anomaly-modal|automated queries|unusual traffic|are you a robot|showcaptcha|smartcaptcha|"captcha"|id="captcha|verify you are human/i;
export function looksBlocked(text) { return BLOCK_MARKERS.test(String(text || '').slice(0, 60000)); }

async function request(url, { fetchImpl = fetch, headers = {}, signal, timeout = 9000, retries = 2, backoff = [1000, 2000], method = 'GET', body, accept = 'application/json' } = {}) {
  for (let attempt = 0; ; attempt++) {
    await politeGate(url);
    const ctrl = new AbortController();
    const onAbort = () => ctrl.abort();
    signal?.addEventListener('abort', onAbort, { once: true });
    const timer = setTimeout(() => ctrl.abort('timeout'), timeout);
    let res; let text;
    try {
      res = await fetchImpl(url, { method, body, headers: { Accept: accept, ...headers }, signal: ctrl.signal, credentials: 'omit', referrerPolicy: 'no-referrer', redirect: 'follow' });
      text = await res.text();
    } catch (e) {
      if (signal?.aborted) throw new EngineError('ABORT', 'Annulé');
      const to = ctrl.signal.reason === 'timeout';
      throw new EngineError(to ? 'TIMEOUT' : 'NETWORK', to ? `Délai de ${timeout / 1000} s dépassé` : `Réseau indisponible (${e.message || e})`);
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
    }
    if ((res.status === 429 || res.status === 503) && attempt < retries) { await sleep(backoff[attempt] ?? 2000, signal); continue; }
    if (res.status === 429) throw new EngineError('RATE_LIMIT', 'Quota atteint (429)', 429);
    if (res.status === 401) throw new EngineError('NO_KEY', 'Authentification exigée (401)', 401);
    if (res.status === 403 && res.headers.get('x-ratelimit-remaining') === '0') throw new EngineError('RATE_LIMIT', 'Quota horaire atteint (403)', 403);
    if (res.status === 403) throw new EngineError('BLOCKED', looksBlocked(text) ? 'Bloqué par une protection anti-robot (403)' : 'Accès refusé (403) : filtrage du réseau ou clé exigée', 403);
    if (!res.ok) throw new EngineError('HTTP', `Erreur HTTP ${res.status}`, res.status);
    return { text, status: res.status, finalUrl: res.url, headers: res.headers };
  }
}

export async function getText(url, opts = {}) {
  const r = await request(url, { accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8', ...opts });
  if (!opts.allowChallenge && looksBlocked(r.text)) throw new EngineError('BLOCKED', 'Page anti-robot ou captcha : source non contournée', r.status);
  return r;
}

export async function getJson(url, { ndjson = false, ...opts } = {}) {
  const r = await request(url, opts);
  try {
    const data = ndjson ? r.text.split('\n').filter((l) => l.trim()).map((l) => JSON.parse(l)) : JSON.parse(r.text);
    return { data, status: r.status, finalUrl: r.finalUrl };
  } catch {
    if (looksBlocked(r.text)) throw new EngineError('BLOCKED', 'Page anti-robot au lieu des données', r.status);
    throw new EngineError('PARSE', 'Réponse illisible');
  }
}
