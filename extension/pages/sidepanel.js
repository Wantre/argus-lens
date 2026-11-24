// É4 — Panneau latéral : recherche rapide, Space actif, note sur la page courante, capture, pivots de la page.
import { h, clear, toast } from '../ui/dom.js';
import { icon, logo } from '../ui/icons.js';
import { createSearchBar } from '../ui/searchbar.js';
import { getSettings, setSettings, listSpaces, addEntry, listEntries } from '../core/store.js';
import { applySettingsToDom } from '../ui/theme.js';
import { domainPivots } from '../core/pivots.js';
import { api } from '../core/api.js';

const app = document.getElementById('app');
const lens = (hash) => api.tabs.create({ url: api.runtime.getURL(`pages/newtab.html${hash}`) });
let settings;

async function currentTab() {
  const [t] = await api.tabs.query({ active: true, lastFocusedWindow: true });
  return t;
}

async function draw() {
  settings = await getSettings();
  applySettingsToDom(settings);
  const spaces = await listSpaces().catch(() => []);
  const tab = await currentTab();
  const web = tab && /^https?:/.test(tab.url || '');
  let domain = '';
  try { domain = web ? new URL(tab.url).hostname.replace(/^www\./, '') : ''; } catch { /* ignore */ }
  const bar = createSearchBar({ compact: true, placeholder: 'Rechercher…', onSubmit: (q, mode) => lens(`#/r?q=${encodeURIComponent(q)}&mode=${mode}`) });
  const spaceSel = h('select', { class: 'input', id: 'sp-active', onchange: async (e) => { await setSettings({ activeSpace: e.target.value || null }); draw(); } }, h('option', { value: '' }, 'Aucun'), spaces.map((s) => h('option', { value: s.id, selected: s.id === settings.activeSpace }, s.name)));
  const note = h('textarea', { class: 'input', id: 'sp-note', placeholder: 'Note sur cette page…' });
  const label = h('select', { class: 'input', id: 'sp-label' }, h('option', { value: '' }, 'Étiquette (obligatoire)'), h('option', { value: 'observation' }, 'Observation'), h('option', { value: 'declaration' }, 'Déclaration'), h('option', { value: 'inference' }, 'Inférence'));
  const recent = settings.activeSpace ? (await listEntries(settings.activeSpace)).filter((e) => e.url === tab?.url || e.originalUrl === tab?.url) : [];
  const status = h('p', { class: 'muted', role: 'status', 'aria-live': 'polite' });
  clear(app).append(...[
    h('header', { class: 'pop-head' }, logo(), h('h1', { class: 'pop-h1' }, 'ARGUS Lens'), h('span', { class: 'muted', style: { marginLeft: 'auto', fontSize: '12px' } }, 'Panneau')),
    bar.el,
    h('section', { class: 'card stack' }, h('h2', {}, icon('folder', 16), h('label', { for: 'sp-active' }, 'Space actif')), spaceSel, spaces.length ? null : h('button', { type: 'button', class: 'btn sm', onclick: () => lens('#/spaces') }, 'Créer un Space')),
    h('section', { class: 'card stack' }, h('h2', {}, icon('globe', 16), 'Page courante'),
      h('p', { class: 'r-url' }, web ? tab.url : 'Page non web (aucune action possible)'),
      h('div', { class: 'row' }, h('button', { type: 'button', class: 'btn primary sm', disabled: !web, onclick: async () => { status.textContent = 'Capture…'; const r = await api.runtime.sendMessage({ type: 'capture' }); status.textContent = r?.ok ? `Preuve enregistrée · SHA-256 ${r.evidence.sha256.slice(0, 16)}…` : `Capture impossible : ${r?.error}`; } }, icon('camera', 15), 'Capturer comme preuve'),
        h('button', { type: 'button', class: 'btn sm', disabled: !web, onclick: () => lens(`#/archive?u=${encodeURIComponent(tab.url)}`) }, icon('archive', 15), 'Archives')),
      status,
      h('div', { class: 'field' }, h('label', { for: 'sp-note' }, 'Note'), note), h('div', { class: 'field' }, h('label', { for: 'sp-label' }, 'Étiquette'), label),
      h('button', { type: 'button', class: 'btn sm', disabled: !web, onclick: async () => {
        if (!settings.activeSpace) return toast('Choisissez un Space actif', { kind: 'error' });
        if (!note.value.trim()) return toast('Note vide', { kind: 'error' });
        if (!label.value) return toast('Étiquette obligatoire', { kind: 'error' });
        await addEntry({ spaceId: settings.activeSpace, type: 'note', text: note.value.trim(), url: tab.url, label: label.value, confidence: 'moyenne' });
        toast('Note ajoutée', { kind: 'success' }); draw();
      } }, icon('plus', 15), 'Ajouter la note'),
      recent.length ? h('p', { class: 'muted' }, `${recent.length} élément(s) déjà liés à cette page dans le Space.`) : null),
    domain ? h('section', { class: 'card stack' }, h('h2', {}, icon('graph', 16), `Pivots · ${domain}`), h('div', { class: 'stack', style: { gap: '4px' } }, domainPivots(domain).map((p) => h('a', { class: 'elsewhere', href: p.url || api.runtime.getURL(`pages/newtab.html${p.route}`), target: '_blank', rel: 'noreferrer' }, p.label, icon('external', 14))))) : null,
    h('p', { class: 'muted', style: { fontSize: '12px' } }, 'Astuce : sélectionnez du texte sur la page puis clic droit « Ajouter la sélection au Space actif ».')].filter(Boolean));
}

api.tabs.onActivated.addListener(() => draw());
api.tabs.onUpdated.addListener((id, info, tab) => { if (tab.active && info.status === 'complete') draw(); });
api.runtime.onMessage.addListener((m) => { if (m?.type === 'data-changed') draw(); });
draw();
