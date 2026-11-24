// É1 — Lens Home : logo œil-prisme, salutation, barre « Que cherchez-vous, Monsieur ? », puces de tâches.
import { h } from '../dom.js';
import { icon, logo } from '../icons.js';
import { createSearchBar, MODES } from '../searchbar.js';
import { greeting, formatParis } from '../../core/time.js';

const TASKS = [
  { id: 'recherche', label: 'Recherche', icon: 'search', mode: 'web', ph: 'Que cherchez-vous, Monsieur ?' },
  { id: 'enquete', label: 'Enquête', icon: 'folder', action: 'space' },
  { id: 'archive', label: 'Archive', icon: 'archive', mode: 'archives', ph: 'URL ou domaine à remonter dans le temps', prefix: '/wayback ' },
  { id: 'domaine', label: 'Domaine', icon: 'globe', mode: 'infra', ph: 'Domaine : RDAP, certificats, archives (passif)' },
  { id: 'pseudo', label: 'Pseudo', icon: 'user', ph: 'Pseudo à rechercher publiquement', prefix: '/pseudo ' },
  { id: 'image', label: 'Image', icon: 'image', ph: "URL d'une image pour une recherche inversée", prefix: '/image ' },
  { id: 'code', label: 'Code', icon: 'code', mode: 'code', ph: 'Projet ou organisation (dépôts publics GitHub)' },
];

export function renderHome(root, params, ctx) {
  let task = TASKS[0];
  const bar = createSearchBar({
    mode: 'web', sources: ctx.sources,
    onSubmit: (text, mode) => {
      if (task.prefix && !text.startsWith('/')) return ctx.runSearch(task.prefix + text, mode);
      ctx.runSearch(text, mode);
    },
    onBuilder: (text) => ctx.openBuilder(text),
  });
  const chips = TASKS.map((t) => h('button', { type: 'button', class: 'task-chip', 'aria-pressed': String(t === task), dataset: { task: t.id }, onclick: () => selectTask(t) }, icon(t.icon, 16), t.label));
  function selectTask(t) {
    if (t.action === 'space') { ctx.openSpaceDialog(); return; }
    task = t;
    chips.forEach((c) => c.setAttribute('aria-pressed', String(c.dataset.task === t.id)));
    if (t.mode) bar.setMode(t.mode);
    bar.setPlaceholder(t.ph);
    bar.focus();
  }

  const clock = ctx.settings.widgets?.clock ? h('p', { class: 'home-clock tnum' }, `Paris · ${formatParis(new Date(), { weekday: 'long', hour: '2-digit', minute: '2-digit' })}`) : null;
  const hero = h('section', { class: 'home', 'aria-labelledby': 'home-title' },
    h('div', { class: 'logo-hero enter', style: { '--i': 0 } }, logo()),
    h('h1', { id: 'home-title', class: 'home-title enter', style: { '--i': 1 } }, greeting()),
    h('p', { class: 'home-sub enter', style: { '--i': 2 } }, 'Plus d’index, moins de filtres. Tout reste sur cet appareil.'),
    h('div', { class: 'home-search enter', style: { '--i': 3 } }, bar.el),
    h('div', { class: 'chips home-chips enter', style: { '--i': 4 }, role: 'group', 'aria-label': 'Tâches' }, chips),
    h('p', { class: 'home-hints enter', style: { '--i': 5 } }, h('kbd', {}, '/'), ' rechercher ', h('kbd', {}, 'Ctrl'), h('kbd', {}, 'K'), ' palette ', h('kbd', {}, 'Alt'), h('kbd', {}, '1–6'), ' modes ', h('kbd', {}, 'F'), ' focus ', h('kbd', {}, '?'), ' aide'),
    clock);
  root.append(hero);
  bar.focus();
  return {
    setMode(n) { const m = +n === 7 ? null : MODES[+n > 7 ? +n - 2 : +n - 1]; if (m) { bar.setMode(m.id); } else ctx.openBuilder(bar.input.value); },
  };
}
