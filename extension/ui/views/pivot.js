// Pivots publics : domaine, pseudo, e-mail ; recherche inversée d'image (ouverture en onglets).
import { h } from '../dom.js';
import { icon } from '../icons.js';
import { domainPivots, pseudoPivots, emailPivots, PSEUDO_WARNING, EMAIL_WARNING } from '../../core/pivots.js';
import { REVERSE_IMAGE } from '../../engines/tab-engines.js';

const linkCard = (p) => (p.url
  ? h('a', { class: 'pivot', href: p.url, target: '_blank', rel: 'noreferrer' }, h('span', {}, p.label), h('span', { class: 'badge' }, 'onglet'), icon('external', 14))
  : h('a', { class: 'pivot', href: p.route }, h('span', {}, p.label), h('span', { class: 'badge ok' }, 'API'), icon('chevron', 14)));

export function renderPivot(root, params, ctx) {
  const type = params.type || 'domain';
  const v = (params.v || '').trim();
  const isEmail = /@.+\./.test(v) && !v.startsWith('@');
  const input = h('input', { class: 'input', id: 'pv', value: v, placeholder: type === 'pseudo' ? 'pseudo' : 'example.com', 'aria-label': 'Valeur à pivoter' });
  const typeSel = h('select', { class: 'input', style: { width: 'auto' }, 'aria-label': 'Type de pivot' }, [['domain', 'Domaine'], ['pseudo', 'Pseudo'], ['email', 'E-mail']].map(([k, l]) => h('option', { value: k, selected: k === (isEmail ? 'email' : type) }, l)));
  const list = type === 'pseudo' && !isEmail ? pseudoPivots(v) : isEmail || type === 'email' ? emailPivots(v) : domainPivots(v.replace(/^https?:\/\//, '').split('/')[0]);
  const warning = type === 'pseudo' ? PSEUDO_WARNING : isEmail || type === 'email' ? EMAIL_WARNING : 'Pivots strictement passifs : enregistrements publics, certificats, archives. Aucun scan.';
  root.append(h('div', { class: 'page' },
    h('div', { class: 'page-head' }, h('div', {}, h('h1', {}, 'Pivots publics'), h('p', {}, 'Chaque pivot ouvre une source publique. Rien n’est agrégé automatiquement en profil.'))),
    h('form', { class: 'card row', style: { flexWrap: 'nowrap' }, onsubmit: (e) => { e.preventDefault(); ctx.navigate(`#/pivot?type=${typeSel.value}&v=${encodeURIComponent(input.value.trim())}`); } }, typeSel, input, h('button', { class: 'btn primary', type: 'submit' }, 'Pivoter')),
    h('p', { class: 'rule' }, icon('alert', 16), warning),
    v ? h('div', { class: 'pivot-grid' }, list.map(linkCard)) : null));
}

export function renderImage(root, params) {
  const u = (params.u || '').trim();
  const input = h('input', { class: 'input', id: 'img-u', value: u, placeholder: 'https://…/image.jpg', 'aria-label': 'URL de l’image' });
  root.append(h('div', { class: 'page' },
    h('div', { class: 'page-head' }, h('div', {}, h('h1', {}, 'Recherche inversée d’image'), h('p', {}, 'L’URL de l’image est transmise au service choisi, dans un nouvel onglet. N’utilisez pas d’image confidentielle.'))),
    h('form', { class: 'card row', style: { flexWrap: 'nowrap' }, onsubmit: (e) => { e.preventDefault(); location.hash = `#/image?u=${encodeURIComponent(input.value.trim())}`; } }, input, h('button', { class: 'btn primary', type: 'submit' }, 'Valider')),
    u ? h('div', { class: 'stack' }, h('img', { src: u, alt: 'Image à rechercher (aperçu chargé depuis son site)', class: 'img-prev', referrerpolicy: 'no-referrer' }),
      h('div', { class: 'pivot-grid' }, REVERSE_IMAGE.map((r) => linkCard({ label: r.name, url: r.url(u) })))) : null));
}
