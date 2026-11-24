// Barre latérale : navigation, Spaces (dossiers), favoris en icônes, onglets ouverts.
import { h, iconButton, favicon, clear } from './dom.js';
import { icon, logo } from './icons.js';
import { listSpaces } from '../core/store.js';
import { api } from '../core/api.js';

const ul = (attrs, ...items) => h('ul', attrs, items.flat().map((c) => h('li', {}, c)));

const NAV = [
  { hash: '#/', label: 'Accueil', icon: 'home', match: '' },
  { hash: '#/history', label: 'Historique', icon: 'clock', match: 'history' },
  { hash: '#/spaces', label: 'Spaces', icon: 'layers', match: 'spaces' },
  { hash: '#/archive', label: 'Archives', icon: 'timeline', match: 'archive' },
  { hash: '#/graph', label: 'Graphe des pivots', icon: 'graph', match: 'graph' },
  { hash: '#/toolbox', label: 'Boîte à outils', icon: 'tool', match: 'toolbox' },
  { hash: '#/export', label: 'Export', icon: 'download', match: 'export' },
];

export async function renderSidebar(root, ctx) {
  const shell = document.getElementById('shell');
  const routeName = location.hash.replace(/^#\/?/, '').split(/[/?]/)[0];
  const spaceId = routeName === 'space' ? decodeURIComponent(location.hash.split('/')[2] || '').split('?')[0] : null;
  const spaces = await listSpaces().catch(() => []);
  const collapse = iconButton('panel', shell.classList.contains('collapsed') ? 'Déplier la barre latérale' : 'Replier la barre latérale', {
    class: 'sm', 'aria-expanded': String(!shell.classList.contains('collapsed')), 'aria-controls': 'sidebar',
    onclick: () => { shell.classList.toggle('collapsed'); ctx.update({ sidebar: !shell.classList.contains('collapsed') }); renderSidebar(root, ctx); },
  });

  const tabsBox = h('div', { class: 'sb-section sb-tabs' });
  const frag = [
    h('div', { class: 'sb-head' }, h('a', { href: '#/', class: 'sb-brand', 'aria-label': 'ARGUS Lens, accueil' }, logo(), h('span', { class: 'sb-brand-text' }, 'ARGUS Lens', h('br'), h('small', {}, 'Recherche & enquête'))), collapse),
    ul({ class: 'sb-section' }, NAV.map((n) => h('a', { href: n.hash, class: 'sb-link', title: n.label, 'aria-current': routeName === n.match ? 'page' : null }, icon(n.icon), h('span', { class: 'lbl' }, n.label))),
      h('a', { href: api?.runtime?.getURL ? api.runtime.getURL('pages/options.html') : 'options.html', class: 'sb-link', title: 'Paramètres', target: '_blank' }, icon('settings'), h('span', { class: 'lbl' }, 'Paramètres'))),
    h('div', { class: 'sb-section' },
      h('div', { class: 'sb-title' }, h('span', {}, 'Spaces'), iconButton('plus', 'Nouveau Space', { class: 'sm', onclick: () => ctx.openSpaceDialog() })),
      spaces.length ? ul({}, spaces.slice(0, 8).map((s) => h('a', { href: `#/space/${encodeURIComponent(s.id)}`, class: 'sb-link', title: s.name, 'aria-current': spaceId === s.id ? 'page' : null },
        h('span', { class: 'space-dot', style: { '--c': s.color } }, icon(s.glyph || 'folder', 13)), h('span', { class: 'lbl' }, s.name), ctx.settings.activeSpace === s.id ? h('span', { class: 'count' }, 'actif') : null)))
        : h('button', { type: 'button', class: 'sb-link', onclick: () => ctx.openSpaceDialog() }, icon('plus'), h('span', { class: 'lbl muted' }, 'Créer un premier Space'))),
    h('div', { class: 'sb-section' }, h('div', { class: 'sb-title' }, h('span', {}, 'Favoris')),
      ul({ class: 'fav-grid' }, (ctx.settings.favorites || []).map((f) => h('a', { class: 'fav', href: f.url, title: f.name, 'aria-label': f.name, rel: 'noreferrer' }, favicon(f.url, 20))))),
    tabsBox,
    h('div', { class: 'sb-foot' },
      iconButton('sun', 'Changer de thème', { onclick: (e) => ctx.cycleTheme({ x: e.clientX, y: e.clientY }) }),
      iconButton('focus', 'Mode Focus (F)', { onclick: () => ctx.toggleFocus() }),
      iconButton('command', 'Palette de commandes (Ctrl+K)', { onclick: () => ctx.openPalette() }),
      iconButton('keyboard', 'Raccourcis clavier (?)', { onclick: () => ctx.openHelp() })),
  ];
  clear(root).append(...frag);
  fillTabs(tabsBox);
}

async function fillTabs(box) {
  if (!api?.tabs?.query) return;
  let tabs = [];
  try { tabs = await api.tabs.query({}); } catch { return; }
  const self = api.runtime.getURL('');
  tabs = tabs.filter((t) => t.url && !t.url.startsWith(self) && /^https?:/.test(t.url)).sort((a, b) => (b.lastAccessed || 0) - (a.lastAccessed || 0)).slice(0, 6);
  if (!tabs.length) return;
  box.append(h('div', { class: 'sb-title' }, h('span', {}, 'Onglets ouverts')),
    ul({}, tabs.map((t) => {
      let d = ''; try { d = new URL(t.url).hostname; } catch { /* ignore */ }
      return h('button', { type: 'button', class: 'tab-row', title: t.title, onclick: () => { api.tabs.update(t.id, { active: true }); api.windows?.update(t.windowId, { focused: true }); } }, favicon(t.url, 16), h('span', { class: 't' }, t.title || d));
    })));
}
