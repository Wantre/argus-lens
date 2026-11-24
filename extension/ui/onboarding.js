// É13 — Onboarding : 3 cartes (Composez, Voyez plus loin, Gardez la preuve), choix du thème, rappel confidentialité.
import { h } from './dom.js';
import { icon } from './icons.js';
import { openModal } from './dialog.js';
import { THEMES } from './theme.js';

const CARDS = [
  { icon: 'sliders', t: 'Composez', d: 'Opérateurs visuels, bibliothèque de requêtes OSINT légales, traduction automatique pour chaque moteur.' },
  { icon: 'eye', t: 'Voyez plus loin', d: 'Petit web, archives, certificats et code public interrogés en parallèle, résultats rares mis en avant.' },
  { icon: 'shield', t: 'Gardez la preuve', d: 'Spaces d’enquête, notes étiquetées, captures horodatées Europe/Paris et hachées SHA-256.' },
];

export function openOnboarding(ctx) {
  const themeSel = h('select', { class: 'input', id: 'ob-theme', onchange: (e) => ctx.update({ theme: e.target.value }) }, THEMES.map((t) => h('option', { value: t.id, selected: t.id === ctx.settings.theme }, t.label)));
  const dlg = openModal({
    title: 'Bienvenue, Monsieur',
    wide: true,
    body: [
      h('div', { class: 'ob-cards' }, CARDS.map((c, i) => h('div', { class: 'ob-card enter', style: { '--i': i } }, h('span', { class: 'ob-ic' }, icon(c.icon, 22)), h('h3', {}, c.t), h('p', {}, c.d)))),
      h('div', { class: 'grid-2' }, h('div', { class: 'field' }, h('label', { for: 'ob-theme' }, 'Thème'), themeSel),
        h('div', { class: 'field' }, h('span', {}, 'Confidentialité'), h('p', { class: 'muted' }, 'Aucune télémétrie, aucun serveur ARGUS. Les seules requêtes sont celles que vous lancez vers les moteurs choisis.'))),
    ],
    foot: [h('button', { type: 'button', class: 'btn primary', onclick: () => dlg.close() }, 'Commencer')],
    onClose: () => ctx.update({ onboarded: true }),
  });
}
