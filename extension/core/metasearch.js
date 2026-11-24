// Orchestration parallèle des moteurs (Promise.allSettled), rendu progressif via onEvent.
// v2 : pagination multi-pages, délai global par source, pause des sources bloquées, latence mesurée.
import { localFilter } from './merge.js';
import { inCooldown, setCooldown } from '../engines/http.js';

export const STATUS_LABEL = { ok: 'OK', limited: 'Limité', no_key: 'Clé manquante', down: 'Hors service', blocked: 'Bloqué', paused: 'En pause', na: 'Non applicable', off: 'Désactivé', loading: 'Chargement', empty: '0 résultat' };

export function codeToStatus(code) {
  if (code === 'RATE_LIMIT') return 'limited';
  if (code === 'NO_KEY') return 'no_key';
  if (code === 'BLOCKED') return 'blocked';
  if (code === 'NO_TARGET') return 'na';
  return 'down';
}

const ENGINE_BUDGET = 25000; // délai global par source et par page
function withBudget(p, ms, ctrl) {
  let t;
  const guard = new Promise((_, rej) => { t = setTimeout(() => { ctrl.abort(); const e = new Error(`Délai global de ${ms / 1000} s dépassé`); e.code = 'TIMEOUT'; rej(e); }, ms); });
  return Promise.race([p, guard]).finally(() => clearTimeout(t));
}

// engines : adaptateurs ; settings.engines[id] = { enabled, key, url, weight } ; settings.depth = pages par source
// acc : accumulateur { [id]: { results:[], pages:n, done:bool } } partagé entre « search » et « more ».
export async function metasearch({ ast, engines, settings, onEvent = () => {}, signal, fetchImpl, cache, pageFrom = 1, pageTo, acc = {} }) {
  const raw = {};
  const summary = {};
  const depth = Math.max(1, Math.min(5, settings?.depth || 2));
  const last = pageTo || depth;
  const tasks = engines.map(async (eng) => {
    const id = eng.meta.id;
    const conf = settings?.engines?.[id] || {};
    const key = id === 'searxng' ? conf.url : conf.key;
    const a = acc[id] || (acc[id] = { results: [], pages: 0, done: false, ms: 0 });
    if (eng.meta.needsKey && !key) {
      summary[id] = { status: 'no_key', count: 0 };
      onEvent({ type: 'engine', id, status: 'no_key', message: id === 'searxng' ? 'URL à saisir dans les Paramètres' : 'Clé à saisir dans les Paramètres' });
      return;
    }
    const until = inCooldown(id);
    if (until) {
      summary[id] = { status: 'paused', count: a.results.length, error: 'Source bloquée récemment : pause de politesse' };
      onEvent({ type: 'engine', id, status: 'paused', message: `En pause jusqu'à ${new Date(until).toLocaleTimeString('fr-FR', { timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit' })} (blocage précédent)` });
      return;
    }
    const maxPage = eng.meta.paged ? last : Math.min(last, 1);
    onEvent({ type: 'engine', id, status: 'loading' });
    let err = null; let removed = 0; let applied = []; let cached = false;
    const t0 = performance.now();
    for (let page = pageFrom; page <= maxPage && !a.done; page++) {
      try {
        const cacheKey = `${id}:${page}:${JSON.stringify(ast)}`;
        let results = cache ? await cache.get(cacheKey) : null;
        cached = cached || !!results;
        if (!results) {
          const ctrl = new AbortController();
          signal?.addEventListener('abort', () => ctrl.abort(), { once: true });
          results = await withBudget(eng.search(ast, { key, signal: ctrl.signal, fetchImpl, page, lang: settings?.lang, region: settings?.region }), eng.meta.budget || ENGINE_BUDGET, ctrl);
          if (cache && results.length) await cache.set(cacheKey, results);
        }
        const known = new Set(a.results.map((r) => r.url));
        const fresh = results.filter((r) => !known.has(r.url));
        if (!fresh.length) { a.done = true; break; }
        a.pages = page;
        const base = a.results.length;
        const f = localFilter(fresh, ast, eng.meta.supports || {});
        removed += f.removed; applied = [...new Set([...applied, ...f.applied])];
        a.results.push(...f.results.map((r, i) => ({ ...r, rank: base + i + 1, page })));
        if (results.length < 5) a.done = true;
        const ms = Math.round(performance.now() - t0);
        onEvent({ type: 'results', id, results: a.results, ms, page, removed, applied, cached, status: a.results.length ? 'ok' : 'empty' });
      } catch (e) {
        if (signal?.aborted) return;
        err = e;
        if (['RATE_LIMIT', 'BLOCKED'].includes(e.code)) setCooldown(id);
        break;
      }
    }
    const ms = Math.round(performance.now() - t0);
    a.ms = ms;
    raw[id] = a.results;
    if (err && !a.results.length) {
      const status = codeToStatus(err.code);
      summary[id] = { status, count: 0, ms, error: err.message, code: err.code, http: err.status };
      onEvent({ type: 'engine', id, status, message: err.message, http: err.status, ms });
    } else {
      summary[id] = { status: a.results.length ? (err ? 'limited' : 'ok') : 'empty', count: a.results.length, ms, pages: a.pages, removed, applied, cached, error: err?.message };
      onEvent({ type: 'results', id, results: a.results, ms, page: a.pages, removed, applied, cached, status: summary[id].status, message: err ? `page suivante : ${err.message}` : undefined, final: true });
    }
  });
  await Promise.allSettled(tasks);
  onEvent({ type: 'done', summary, page: last });
  return { raw, summary };
}

// Choix des moteurs selon le mode (et présence d'une cible domaine pour archives/infra).
export function enginesForMode(mode, all, settings, hasTarget) {
  return all.filter((e) => {
    const conf = settings?.engines?.[e.meta.id];
    if (conf && conf.enabled === false) return false;
    if (!e.meta.modes.includes(mode)) return false;
    if (e.meta.needsTarget && !hasTarget) return false;
    if (e.meta.needsKey && !(conf && (conf.key || conf.url))) return false;
    return true;
  });
}
