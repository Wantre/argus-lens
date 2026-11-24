// É5 — Popup : mini-recherche, mode, 3 dernières recherches, panneau latéral, capture de la page.
import { h, toast } from '../ui/dom.js';
import { icon, logo } from '../ui/icons.js';
import { createSearchBar, MODES } from '../ui/searchbar.js';
import { getSettings, listHistory } from '../core/store.js';
import { applySettingsToDom } from '../ui/theme.js';
import { api } from '../core/api.js';

const app = document.getElementById('app');
const open = (hash) => { api.tabs.create({ url: api.runtime.getURL(`pages/newtab.html${hash}`) }); window.close(); };

(async () => {
  const settings = await getSettings();
  applySettingsToDom(settings);
  const hist = (await listHistory().catch(() => [])).slice(0, 3);
  const bar = createSearchBar({ compact: true, placeholder: 'Rechercher…', sources: { history: async () => hist }, onSubmit: (q, mode) => open(q.startsWith('/wayback ') ? `#/archive?u=${encodeURIComponent(q.slice(9))}` : `#/r?q=${encodeURIComponent(q)}&mode=${mode}`) });
  const status = h('p', { class: 'muted pop-status', role: 'status' });
  app.append(
    h('header', { class: 'pop-head' }, logo(), h('h1', { class: 'pop-h1' }, 'ARGUS Lens'), h('button', { type: 'button', class: 'icon-btn sm', 'aria-label': 'Paramètres', title: 'Paramètres', style: { marginLeft: 'auto' }, onclick: () => api.runtime.openOptionsPage() }, icon('settings', 16))),
    bar.el,
    hist.length ? h('section', { 'aria-labelledby': 'pop-recent' }, h('h2', { id: 'pop-recent', class: 'pop-title' }, 'Dernières recherches'),
      h('ul', { class: 'pop-list' }, hist.map((x) => h('li', {}, h('button', { type: 'button', class: 'tab-row', onclick: () => open(`#/r?q=${encodeURIComponent(x.q)}&mode=${x.mode}`) }, icon('clock', 15), h('span', { class: 't' }, x.q), h('span', { class: 'badge' }, MODES.find((m) => m.id === x.mode)?.label)))))) : null,
    h('div', { class: 'pop-actions' },
      h('button', { type: 'button', class: 'btn primary', onclick: capture }, icon('camera', 16), 'Capturer cette page'),
      h('button', { type: 'button', class: 'btn', onclick: sidePanel }, icon('panel', 16), 'Panneau latéral'),
      h('button', { type: 'button', class: 'btn', onclick: archives }, icon('archive', 16), 'Archives de la page'),
      h('button', { type: 'button', class: 'btn', onclick: () => open('#/') }, icon('home', 16), 'Ouvrir Lens')),
    status);
  bar.focus();

  async function capture() {
    status.textContent = 'Capture en cours…';
    const r = await api.runtime.sendMessage({ type: 'capture' });
    status.textContent = r?.ok ? `Preuve enregistrée ${r.evidence.collectedAt} · SHA-256 ${r.evidence.sha256.slice(0, 16)}…${r.spaceId ? '' : ' (aucun Space : non classée)'}` : `Capture impossible : ${r?.error || 'erreur'}`;
  }
  async function sidePanel() {
    const win = await api.windows.getCurrent();
    try { await api.sidePanel.open({ windowId: win.id }); window.close(); } catch (e) { toast(`Panneau indisponible : ${e.message}`, { kind: 'error' }); }
  }
  async function archives() {
    const [t] = await api.tabs.query({ active: true, currentWindow: true });
    if (t && /^https?:/.test(t.url || '')) open(`#/archive?u=${encodeURIComponent(t.url)}`); else status.textContent = 'Onglet courant non archivable.';
  }
})();
