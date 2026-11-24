// É11 — Boîte à outils : catalogue ARGUS avec statut honnête + moteurs intégrés à l'extension.
import { h, favicon } from '../dom.js';
import { icon } from '../icons.js';
import { CATALOGUE, CATALOGUE_CHECKED_AT } from '../../core/catalogue.js';
import { FETCH_ENGINES } from '../../engines/fetch-engines.js';
import { formatParis } from '../../core/time.js';

const STATUS = { DOCUMENTED_ONLY: ['Documenté, non testé', 'warn'], NEEDS_SETUP: ['Configuration requise', 'warn'], VERIFIED_AVAILABLE: ['Vérifié disponible', 'ok'] };

export function renderToolbox(root, params, ctx) {
  const st = ctx.settings.engineStatus || {};
  const cats = [...new Set(CATALOGUE.map((c) => c.cat))];
  root.append(h('div', { class: 'page' },
    h('div', { class: 'page-head' }, h('div', {}, h('h1', {}, 'Boîte à outils'), h('p', {}, `Catalogue ARGUS vérifié le ${formatParis(CATALOGUE_CHECKED_AT)} (heure de Paris). Lien accessible ne veut pas dire outil testé : le statut l’indique honnêtement.`))),
    h('section', { class: 'stack' }, h('h2', { class: 'sec-title' }, 'Moteurs intégrés à ARGUS Lens'),
      h('div', { class: 'tool-grid' }, FETCH_ENGINES.map((e) => {
        const s = st[e.meta.id];
        const label = s ? { ok: ['Testé : OK', 'ok'], limited: ['Testé : limité', 'warn'], no_key: ['Clé manquante', 'warn'], down: ['Testé : hors service', 'err'] }[s.status] || ['Non testé', ''] : e.meta.needsKey ? ['Clé requise (NEEDS_SETUP)', 'warn'] : ['Disponible, non testé ici', ''];
        return h('article', { class: 'tool' }, h('div', { class: 'row', style: { flexWrap: 'nowrap' } }, favicon(e.meta.termsUrl, 20), h('h3', {}, e.meta.name)),
          h('p', { class: 'muted' }, e.meta.kind === 'key' ? 'API officielle : clé ou URL saisie par vous dans les Paramètres.' : 'API publique documentée, interrogée depuis le service worker.'),
          h('div', { class: 'row' }, h('span', { class: `badge ${label[1]}` }, label[0]), s?.at ? h('span', { class: 'muted', style: { fontSize: '12px' } }, s.at) : null, e.meta.license ? h('span', { class: 'badge' }, e.meta.license) : null),
          h('a', { class: 'btn sm', href: e.meta.termsUrl, target: '_blank', rel: 'noreferrer' }, 'Conditions', icon('external', 13)));
      }))),
    cats.map((cat) => h('section', { class: 'stack', style: { marginTop: '28px' } }, h('h2', { class: 'sec-title' }, cat),
      h('div', { class: 'tool-grid' }, CATALOGUE.filter((c) => c.cat === cat).map((c) => {
        const [l, k] = STATUS[c.status] || [c.status, ''];
        return h('article', { class: 'tool' }, h('div', { class: 'row', style: { flexWrap: 'nowrap' } }, favicon(c.url, 20), h('h3', {}, c.name)), h('p', { class: 'muted' }, c.notes),
          h('div', { class: 'row' }, h('span', { class: `badge ${k}` }, l), c.doc === 'HTTP_VERIFIED' ? h('span', { class: 'badge' }, 'Lien vérifié (HTTP)') : null),
          h('a', { class: 'btn sm', href: c.url, target: '_blank', rel: 'noreferrer' }, 'Ouvrir', icon('external', 13)));
      }))))));
}
