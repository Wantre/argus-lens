// Historique local : filtre, épinglage, relance, purge.
import { h, clear, iconButton, toast } from '../dom.js';
import { icon } from '../icons.js';
import { listHistory, purgeHistory } from '../../core/store.js';
import { idb } from '../../core/idb.js';
import { formatParis } from '../../core/time.js';
import { MODES } from '../searchbar.js';

export async function renderHistory(root, params, ctx) {
  const filter = h('input', { class: 'input', type: 'search', placeholder: 'Filtrer l’historique…', 'aria-label': 'Filtrer l’historique', oninput: draw });
  const list = h('ul', { class: 'entry-list hist' });
  root.append(h('div', { class: 'page' },
    h('div', { class: 'page-head' }, h('div', {}, h('h1', {}, 'Historique'), h('p', {}, `Stocké uniquement sur cet appareil. Rétention : ${ctx.settings.retentionDays} jours (épinglés conservés).${ctx.settings.ephemeral ? ' Mode éphémère actif : rien n’est enregistré.' : ''}`)),
      h('div', { class: 'row' }, h('button', { type: 'button', class: 'btn danger', onclick: async () => { if (!confirm('Purger tout l’historique non épinglé ?')) return; await purgeHistory(); toast('Historique purgé', { kind: 'success' }); draw(); } }, icon('trash', 15), 'Purger'))),
    h('div', { class: 'card stack' }, filter, list)));
  async function draw() {
    const q = filter.value.toLowerCase();
    const items = (await listHistory()).filter((x) => !q || x.q.toLowerCase().includes(q)).sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.at - a.at);
    clear(list).append(...(items.length ? items.map((x) => h('li', { class: 'entry row hist-row' },
      iconButton('pin', x.pinned ? 'Désépingler' : 'Épingler', { class: 'sm', 'aria-pressed': String(!!x.pinned), onclick: async () => { await idb.put('history', { ...x, pinned: !x.pinned }); draw(); } }),
      h('button', { type: 'button', class: 'hist-q', onclick: () => ctx.runSearch(x.q, x.mode) }, h('code', {}, x.q)),
      h('span', { class: 'badge' }, MODES.find((m) => m.id === x.mode)?.label || x.mode),
      h('span', { class: 'badge tnum' }, `${x.count ?? 0} rés.`),
      h('span', { class: 'muted tnum hist-at' }, formatParis(x.at)),
      iconButton('trash', 'Supprimer', { class: 'sm', onclick: async () => { await idb.del('history', x.id); draw(); } }))) : [h('li', { class: 'muted' }, 'Aucune recherche.')]));
  }
  draw();
}
