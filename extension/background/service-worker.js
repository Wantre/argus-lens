// ARGUS Lens — service worker : omnibox, menus contextuels, méta-recherche (Port), captures/preuves, onglets en rafale.
import { metasearch } from '../core/metasearch.js';
import { engineById, cdx, ccSerial, FETCH_ENGINES } from '../engines/fetch-engines.js';
import { getJson } from '../engines/http.js';
import { getSettings, setSettings, listHistory, addEntry, listSpaces, purgeHistory } from '../core/store.js';
import { idb } from '../core/idb.js';
import { buildEvidence, dataUrlToBytes } from '../core/evidence.js';
import { parisIso } from '../core/time.js';
import { REVERSE_IMAGE } from '../engines/tab-engines.js';

const api = globalThis.browser ?? globalThis.chrome;
const lensUrl = (hash) => api.runtime.getURL(`pages/newtab.html${hash}`);
const enc = encodeURIComponent;
const CACHE_TTL = 30 * 60 * 1000; // 30 min max : cache de session, jamais de stockage durable des résultats

// Cache en mémoire de session (storage.session : effacé à la fermeture du navigateur).
const cache = {
  async get(k) { const { [`c:${k}`]: v } = await api.storage.session.get(`c:${k}`); return v && Date.now() - v.t < CACHE_TTL ? v.r : null; },
  async set(k, r) { try { await api.storage.session.set({ [`c:${k}`]: { t: Date.now(), r } }); } catch { /* quota session : on ignore */ } },
};

// Menus contextuels
function createMenus() {
  api.contextMenus.removeAll(() => {
    const m = (id, title, contexts) => api.contextMenus.create({ id, title, contexts });
    m('lens-search', 'Rechercher « %s » avec ARGUS Lens', ['selection']);
    m('lens-exact', 'Mots exacts « %s »', ['selection']);
    m('lens-site', 'Rechercher « %s » sur ce site uniquement', ['selection']);
    m('lens-note', 'Ajouter la sélection au Space actif', ['selection']);
    m('lens-archive-link', 'Archives de ce lien', ['link']);
    m('lens-image', 'Recherche inversée de cette image', ['image']);
    m('lens-archive-page', 'Archives de cette page', ['page']);
    m('lens-capture', 'Capturer cette page comme preuve', ['page']);
  });
}

api.runtime.onInstalled.addListener(() => { createMenus(); purgeOld(); });
api.runtime.onStartup?.addListener(() => { createMenus(); purgeOld(); });

async function purgeOld() {
  const s = await getSettings();
  await purgeHistory(s.retentionDays || 30).catch(() => {});
}

api.contextMenus.onClicked.addListener(async (info, tab) => {
  const sel = (info.selectionText || '').trim();
  let host = '';
  try { host = new URL(info.pageUrl || tab?.url || '').hostname.replace(/^www\./, ''); } catch { /* page interne */ }
  const open = (hash) => api.tabs.create({ url: lensUrl(hash), index: tab ? tab.index + 1 : undefined });
  switch (info.menuItemId) {
    case 'lens-search': return open(`#/r?q=${enc(sel)}&mode=web`);
    case 'lens-exact': return open(`#/r?q=${enc(`"${sel.replace(/"/g, '')}"`)}&mode=web`);
    case 'lens-site': return open(`#/r?q=${enc(`${sel}${host ? ` site:${host}` : ''}`)}&mode=web`);
    case 'lens-archive-link': return open(`#/archive?u=${enc(info.linkUrl)}`);
    case 'lens-archive-page': return open(`#/archive?u=${enc(info.pageUrl)}`);
    case 'lens-image': return open(`#/image?u=${enc(info.srcUrl)}`);
    case 'lens-note': {
      const s = await getSettings();
      if (s.ephemeral || !s.activeSpace) return open('#/spaces');
      await addEntry({ spaceId: s.activeSpace, type: 'note', text: sel, url: info.pageUrl, label: 'observation', confidence: 'moyenne', fromSelection: true });
      return notify();
    }
    case 'lens-capture': return capture(tab);
    default: return undefined;
  }
});

// Omnibox : « a » + espace
api.omnibox.setDefaultSuggestion({ description: 'Rechercher avec ARGUS Lens : %s' });
api.omnibox.onInputChanged.addListener(async (text, suggest) => {
  const t = text.trim().toLowerCase();
  const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const hist = (await listHistory().catch(() => [])).filter((h) => !t || h.q.toLowerCase().includes(t)).slice(0, 4);
  const out = hist.map((h) => ({ content: h.q, description: `${esc(h.q)} — historique` }));
  if (t) {
    out.push({ content: `!tout ${text}`, description: `${esc(text)} — mode Tout voir` });
    if (/^[a-z0-9-]+(\.[a-z0-9-]+)+$/i.test(t)) out.push({ content: `/wayback ${t}`, description: `Archives Wayback de ${esc(t)}` });
  }
  suggest(out.slice(0, 6));
});
api.omnibox.onInputEntered.addListener((text, disposition) => {
  let mode = 'web';
  let q = text.trim();
  if (q.startsWith('!tout ')) { mode = 'tout'; q = q.slice(6); }
  const url = q.startsWith('/wayback ') ? lensUrl(`#/archive?u=${enc(q.slice(9))}`) : lensUrl(`#/r?q=${enc(q)}&mode=${mode}`);
  if (disposition === 'currentTab') api.tabs.update({ url });
  else api.tabs.create({ url, active: disposition === 'newForegroundTab' });
});

// Raccourci : panneau latéral
api.commands?.onCommand.addListener(async (cmd, tab) => {
  if (cmd === 'open-side-panel' && api.sidePanel) {
    const win = tab?.windowId ?? (await api.windows.getCurrent()).id;
    api.sidePanel.open({ windowId: win }).catch(() => {});
  }
});

// Méta-recherche en streaming
api.runtime.onConnect.addListener((port) => {
  if (port.name !== 'lens-search') return;
  const ctrl = new AbortController();
  port.onDisconnect.addListener(() => ctrl.abort());
  let session = null; // { ast, engines, ephemeral, acc } : conservé pour « Plus de résultats »
  port.onMessage.addListener(async (msg) => {
    const post = (ev) => { try { port.postMessage(ev); } catch { /* onglet fermé */ } };
    const settings = await getSettings();
    if (msg.type === 'search') {
      session = { ast: msg.ast, engines: msg.engines.map(engineById).filter(Boolean), ephemeral: msg.ephemeral, acc: {} };
      await metasearch({ ast: session.ast, engines: session.engines, settings, signal: ctrl.signal, cache: session.ephemeral ? null : cache, onEvent: post, acc: session.acc });
    } else if (msg.type === 'more' && session) {
      const page = Math.max(2, Math.min(8, msg.page | 0));
      const engines = session.engines.filter((e) => e.meta.paged && session.acc[e.meta.id]?.results.length && !session.acc[e.meta.id].done);
      await metasearch({ ast: session.ast, engines, settings, signal: ctrl.signal, cache: session.ephemeral ? null : cache, onEvent: post, acc: session.acc, pageFrom: page, pageTo: page });
    }
  });
});

function notify() {
  api.runtime.sendMessage({ type: 'data-changed' }).catch(() => {});
}

async function capture(tab) {
  const s = await getSettings();
  if (s.ephemeral) return { ok: false, error: 'mode éphémère actif : rien n’est enregistré' };
  const t = tab || (await api.tabs.query({ active: true, lastFocusedWindow: true }))[0];
  if (!t || !/^https?:/.test(t.url || '')) return { ok: false, error: 'seules les pages web http(s) peuvent être capturées' };
  let dataUrl;
  try { dataUrl = await api.tabs.captureVisibleTab(t.windowId, { format: 'png' }); }
  catch (e) { return { ok: false, error: `capture refusée par le navigateur (${e.message}). Utilisez la popup, le menu contextuel ou le raccourci.` }; }
  const bytes = dataUrlToBytes(dataUrl);
  const ev = await buildEvidence({ originalUrl: t.pendingUrl || t.url, finalUrl: t.url, title: t.title, bytes });
  const blobId = `b-${Date.now().toString(36)}`;
  await idb.put('blobs', { id: blobId, dataUrl });
  let spaceId = s.activeSpace;
  if (!spaceId) { const sp = await listSpaces(); spaceId = sp[0]?.id || null; }
  const entry = await addEntry({ ...ev, spaceId, blobId });
  notify();
  return { ok: true, evidence: entry, spaceId };
}

async function testEngine(id) {
  const e = engineById(id);
  const s = await getSettings();
  const conf = s.engines[id] || {};
  const key = id === 'searxng' ? conf.url : conf.key;
  const probe = { all: ['test'], exact: [], any: [], none: [], site: [], notSite: [], inurl: [], intitle: [], allintitle: [], intext: [], filetype: [], after: null, before: null, lang: null, region: null };
  if (e.meta.needsTarget) probe.all = ['example.com'];
  const t0 = performance.now();
  let status = 'ok'; let detail = '';
  if (e.meta.needsKey && !key) status = 'no_key';
  else {
    try { const r = await e.search(probe, { key }); detail = `${r.length} résultat(s)`; }
    catch (err) { status = { RATE_LIMIT: 'limited', NO_KEY: 'no_key', BLOCKED: 'blocked' }[err.code] || 'down'; detail = err.message; }
  }
  const result = { status, ms: Math.round(performance.now() - t0), detail, at: parisIso() };
  await setSettings({ engineStatus: { ...(s.engineStatus || {}), [id]: result } });
  return result;
}

api.runtime.onMessage.addListener((msg, sender, reply) => {
  (async () => {
    switch (msg?.type) {
      case 'capture': return capture();
      case 'burst': {
        const tabs = [];
        for (const [i, url] of msg.urls.entries()) tabs.push(await api.tabs.create({ url, active: i === 0 }));
        if (api.tabGroups && api.tabs.group) {
          const groupId = await api.tabs.group({ tabIds: tabs.map((t) => t.id) });
          await api.tabGroups.update(groupId, { title: `ARGUS · ${msg.title}`, color: 'purple' });
        }
        return { ok: true };
      }
      case 'cdx': try { return { ok: true, rows: await cdx(msg.target, { limit: msg.limit || 200 }) }; } catch (e) { return { ok: false, error: e.message }; }
      case 'cc': try {
        const { data: idx } = await ccSerial(() => getJson('https://index.commoncrawl.org/collinfo.json', { retries: 0 }));
        const { data } = await ccSerial(() => getJson(`${idx[0]['cdx-api']}?url=${enc(`${msg.domain}/*`)}&output=json&limit=20`, { retries: 0, timeout: 15000, ndjson: true })).catch((e) => { if (e.status === 404) return { data: [] }; throw e; });
        return { ok: true, index: idx[0].name, rows: data.map((r) => ({ url: r.url, status: r.status, date: r.timestamp && `${r.timestamp.slice(0, 4)}-${r.timestamp.slice(4, 6)}-${r.timestamp.slice(6, 8)}` })) };
      } catch (e) { return { ok: false, error: e.message }; }
      case 'test-engine': return testEngine(msg.id);
      case 'test-all': { const out = {}; for (const e of FETCH_ENGINES) out[e.meta.id] = await testEngine(e.meta.id); return out; }
      case 'fetch-html': try {
        const res = await fetch(msg.url, { credentials: 'omit', redirect: 'follow', signal: AbortSignal.timeout(10000) });
        const type = res.headers.get('content-type') || '';
        if (!type.includes('html')) return { ok: false, error: `contenu non HTML (${type || 'inconnu'})` };
        const html = (await res.text()).slice(0, 1_500_000);
        return { ok: true, html, status: res.status, finalUrl: res.url };
      } catch (e) { return { ok: false, error: e.message }; }
      case 'open-side-panel': {
        if (!api.sidePanel) return { ok: false };
        await api.sidePanel.open({ windowId: msg.windowId }); return { ok: true };
      }
      case 'reverse-image': for (const r of REVERSE_IMAGE) await api.tabs.create({ url: r.url(msg.url), active: false }); return { ok: true };
      default: return undefined;
    }
  })().then(reply, (e) => reply({ ok: false, error: e.message }));
  return true;
});
