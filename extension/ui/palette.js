// É12 — Palette de commandes Ctrl+K : recherche floue sur commandes, Spaces, historique.
import { h, clear, trapFocus, prefersReducedMotion, toast } from './dom.js';
import { icon } from './icons.js';
import { openModal } from './dialog.js';
import { listSpaces, listHistory } from '../core/store.js';
import { api } from '../core/api.js';

export function fuzzy(query, text) {
  const q = query.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const t = text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  if (!q) return 1;
  if (t.includes(q)) return 100 - t.indexOf(q);
  let ti = 0; let score = 0;
  for (const c of q) { const i = t.indexOf(c, ti); if (i < 0) return 0; score += i === ti ? 3 : 1; ti = i + 1; }
  return score;
}

let openInstance = null;
export async function openPalette(ctx) {
  if (openInstance) { openInstance.focus(); return; }
  const commands = [
    { g: 'Actions', label: 'Nouvelle recherche', icon: 'search', keys: ['/'], run: () => { ctx.navigate('#/'); setTimeout(() => document.querySelector('.search-input')?.focus(), 50); } },
    { g: 'Actions', label: 'Nouveau Space d’enquête', icon: 'folder', run: () => ctx.openSpaceDialog() },
    { g: 'Actions', label: 'Constructeur de requête', icon: 'sliders', run: () => ctx.openBuilder(document.querySelector('.search-input')?.value || '') },
    { g: 'Actions', label: 'Changer de thème', icon: 'sun', run: () => ctx.cycleTheme() },
    { g: 'Actions', label: 'Mode Focus', icon: 'focus', keys: ['F'], run: () => ctx.toggleFocus() },
    { g: 'Actions', label: 'Archives de l’onglet courant', icon: 'archive', run: async () => { const tabs = await api.tabs.query({ active: true, lastFocusedWindow: true }); const t = tabs.find((x) => /^https?:/.test(x.url || '')); if (t) ctx.navigate(`#/archive?u=${encodeURIComponent(t.url)}`); else toast('Aucun onglet web actif', { kind: 'error' }); } },
    { g: 'Actions', label: 'Capturer l’onglet courant comme preuve', icon: 'camera', run: async () => { const r = await api.runtime.sendMessage({ type: 'capture' }); toast(r?.ok ? `Preuve enregistrée · SHA-256 ${r.evidence.sha256.slice(0, 12)}…` : `Capture impossible : ${r?.error || ''}`, { kind: r?.ok ? 'success' : 'error' }); } },
    { g: 'Aller à', label: 'Accueil', icon: 'home', run: () => ctx.navigate('#/') },
    { g: 'Aller à', label: 'Historique', icon: 'clock', run: () => ctx.navigate('#/history') },
    { g: 'Aller à', label: 'Spaces', icon: 'layers', run: () => ctx.navigate('#/spaces') },
    { g: 'Aller à', label: 'Archives / chronologie', icon: 'timeline', run: () => ctx.navigate('#/archive') },
    { g: 'Aller à', label: 'Graphe des pivots', icon: 'graph', keys: ['G'], run: () => ctx.navigate('#/graph') },
    { g: 'Aller à', label: 'Boîte à outils', icon: 'tool', run: () => ctx.navigate('#/toolbox') },
    { g: 'Aller à', label: 'Exporter', icon: 'download', keys: ['E'], run: () => ctx.navigate('#/export') },
    { g: 'Aller à', label: 'Paramètres', icon: 'settings', run: () => api.runtime.openOptionsPage() },
    { g: 'Aller à', label: 'Raccourcis clavier', icon: 'keyboard', keys: ['?'], run: () => openHelp() },
  ];
  const [spaces, hist] = await Promise.all([listSpaces().catch(() => []), listHistory().catch(() => [])]);
  const items = [
    ...commands,
    ...spaces.map((s) => ({ g: 'Spaces', label: s.name, icon: 'folder', run: () => ctx.navigate(`#/space/${encodeURIComponent(s.id)}`) })),
    ...hist.slice(0, 40).map((x) => ({ g: 'Historique', label: x.q, icon: 'clock', run: () => ctx.runSearch(x.q, x.mode) })),
  ];

  const input = h('input', { type: 'text', role: 'combobox', 'aria-expanded': 'true', 'aria-controls': 'pal-list', 'aria-autocomplete': 'list', 'aria-label': 'Rechercher une commande, un Space ou une recherche', placeholder: 'Tapez une commande, un Space, une recherche…', autocomplete: 'off' });
  const list = h('div', { class: 'palette-list', id: 'pal-list', role: 'listbox', 'aria-label': 'Résultats' });
  const overlay = h('div', { class: 'overlay', 'aria-hidden': 'true' });
  const pal = h('div', { class: 'palette', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Palette de commandes' },
    h('div', { class: 'palette-input' }, icon('command', 18), input, h('kbd', {}, 'Échap')), list,
    h('div', { class: 'palette-foot', 'aria-hidden': 'true' }, h('span', {}, h('kbd', {}, '↑'), h('kbd', {}, '↓'), ' naviguer'), h('span', {}, h('kbd', {}, 'Entrée'), ' exécuter'), h('span', {}, 'Saisissez du texte puis Entrée pour lancer une recherche')));
  let shown = [];
  let active = 0;
  function draw() {
    const q = input.value.trim();
    shown = items.map((it) => ({ it, s: fuzzy(q, it.label) })).filter((x) => x.s > 0).sort((a, b) => (q ? b.s - a.s : 0)).slice(0, 30).map((x) => x.it);
    if (q && !q.startsWith('/')) shown.push({ g: 'Recherche', label: `Rechercher « ${q} »`, icon: 'search', run: () => ctx.runSearch(q, 'web') });
    active = Math.min(active, shown.length - 1);
    clear(list);
    let g = '';
    shown.forEach((it, i) => {
      if (it.g !== g) { g = it.g; list.append(h('div', { class: 'grp', role: 'presentation' }, g)); }
      const el = h('div', { role: 'option', id: `pal-o${i}`, 'aria-selected': String(i === active) }, icon(it.icon, 16), h('span', {}, it.label), it.keys ? h('span', { class: 'kbds' }, it.keys.map((k) => h('kbd', {}, k))) : null);
      el.addEventListener('mousedown', (e) => { e.preventDefault(); exec(it); });
      el.addEventListener('mousemove', () => { if (active !== i) { active = i; mark(); } });
      list.append(el);
    });
    mark();
  }
  function mark() {
    list.querySelectorAll('[role="option"]').forEach((el, i) => el.setAttribute('aria-selected', String(i === active)));
    const el = list.querySelector(`#pal-o${active}`);
    if (el) { input.setAttribute('aria-activedescendant', el.id); el.scrollIntoView({ block: 'nearest' }); }
  }
  function exec(it) { close(); setTimeout(() => it.run(), 10); }
  let release;
  function close() {
    release?.();
    pal.classList.add('out');
    overlay.remove();
    setTimeout(() => pal.remove(), prefersReducedMotion() ? 0 : 120);
    openInstance = null;
  }
  input.addEventListener('input', () => { active = 0; draw(); });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); active = Math.min(active + 1, shown.length - 1); mark(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); active = Math.max(active - 1, 0); mark(); }
    else if (e.key === 'Enter') { e.preventDefault(); if (shown[active]) exec(shown[active]); }
  });
  overlay.addEventListener('click', close);
  document.body.append(overlay, pal);
  release = trapFocus(pal, close);
  draw();
  input.focus();
  openInstance = input;
}

export function openHelp() {
  const rows = [
    ['/', 'Placer le curseur dans la barre de recherche'], ['Ctrl + K', 'Palette de commandes'], ['Alt + 1…6', 'Modes : Web, Petit web, Archives, Code, Infra, Tout voir'], ['Alt + 7', 'Constructeur de requête (accueil)'],
    ['j / k', 'Résultat suivant / précédent'], ['o', 'Ouvrir le résultat'], ['Maj + O', 'Ouvrir en arrière-plan'], ['p', 'Aperçu'], ['s', 'Ajouter au Space actif'], ['a', 'Archives du résultat'], ['e', 'Exporter les résultats (CSV)'],
    ['g', 'Graphe des pivots'], ['F', 'Mode Focus'], ['?', 'Cette aide'], ['Échap', 'Fermer'],
    ['a + espace (barre d’adresse)', 'Rechercher avec ARGUS Lens depuis l’omnibox'], ['Alt + Maj + A', 'Ouvrir la popup'], ['Alt + Maj + S', 'Ouvrir le panneau latéral'],
  ];
  openModal({ title: 'Raccourcis clavier', body: h('table', { class: 'table' }, h('tbody', {}, rows.map(([k, d]) => h('tr', {}, h('th', { scope: 'row' }, k.split(' + ').map((x, i) => [i ? ' + ' : '', h('kbd', {}, x)])), h('td', {}, d))))) });
}
