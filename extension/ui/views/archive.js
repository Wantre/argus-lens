// É9 — Archives : captures Wayback (CDX), frise mensuelle par code HTTP, Common Crawl, comparaison de deux captures.
import { h, clear, toast } from '../dom.js';
import { icon } from '../icons.js';
import { api } from '../../core/api.js';

const ymd = (ts) => `${ts.slice(0, 4)}-${ts.slice(4, 6)}-${ts.slice(6, 8)}`;
const codeClass = (c) => (c?.startsWith('2') ? 's2' : c?.startsWith('3') ? 's3' : c?.startsWith('4') || c?.startsWith('5') ? 's4' : 'sx');

export function renderArchive(root, params, ctx) {
  const input = h('input', { class: 'input', id: 'arch-u', value: params.u || '', placeholder: 'example.com ou https://example.com/page', 'aria-label': 'URL ou domaine' });
  const out = h('div', { class: 'stack' });
  const cc = h('div', { class: 'stack' });
  const form = h('form', { class: 'row', style: { flexWrap: 'nowrap' }, onsubmit: (e) => { e.preventDefault(); ctx.navigate(`#/archive?u=${encodeURIComponent(input.value.trim())}`); } }, input, h('button', { class: 'btn primary', type: 'submit' }, icon('archive', 16), 'Remonter le temps'));
  root.append(h('div', { class: 'page' },
    h('div', { class: 'page-head' }, h('div', {}, h('h1', {}, 'Archives et chronologie'), h('p', {}, 'Wayback Machine (CDX, captures dédoublonnées par contenu) et index Common Crawl. Requêtes ponctuelles, polies, jamais en rafale.'))),
    h('div', { class: 'card stack' }, form), out, cc));
  if (!params.u) { out.append(h('div', { class: 'empty' }, icon('timeline', 28), h('h2', {}, 'Saisissez une URL ou un domaine'), h('p', {}, 'Ex. example.com : les captures de l’hôte et de ses pages. Une URL complète : les captures de cette page.'))); return; }
  load(params.u.trim());

  async function load(u) {
    const target = u.replace(/^https?:\/\//, '');
    out.append(h('div', { class: 'archive-wait', role: 'status' }, h('div', { class: 'skeleton' }), h('p', { class: 'hint' }, 'Interrogation de la Wayback Machine… Le service est souvent lent : comptez jusqu’à 25 s.')));
    const res = await api.runtime.sendMessage({ type: 'cdx', target, limit: 400 });
    clear(out);
    if (!res?.ok) { out.append(h('div', { class: 'empty' }, h('h2', {}, 'Wayback indisponible'), h('p', {}, `${res?.error || 'Erreur'} — réessayez plus tard. Aucune relance automatique agressive.`), h('a', { class: 'btn', href: `https://web.archive.org/web/*/${target}*`, target: '_blank', rel: 'noreferrer', style: { marginTop: '12px' } }, 'Ouvrir le calendrier Wayback'))); }
    else if (!res.rows.length) { out.append(h('div', { class: 'empty' }, h('h2', {}, 'Aucune capture trouvée'), h('p', {}, 'Une absence de capture n’est pas une preuve d’absence de la page.'))); }
    else drawTimeline(res.rows, target);
    if (params.cc) loadCc(target);
    else cc.append(h('section', { class: 'card row', style: { justifyContent: 'space-between' } }, h('p', { class: 'muted' }, 'Common Crawl : serveur strictement limité, interrogé seulement à la demande.'), h('button', { type: 'button', class: 'btn', onclick: () => loadCc(target) }, icon('layers', 15), 'Vérifier Common Crawl')));
  }

  function drawTimeline(rows, target) {
    rows.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
    const months = new Map();
    for (const r of rows) { const m = r.timestamp.slice(0, 6); if (!months.has(m)) months.set(m, []); months.get(m).push(r); }
    const first = rows[0].timestamp; const last = rows[rows.length - 1].timestamp;
    const all = [];
    for (let y = +first.slice(0, 4), m = +first.slice(4, 6); y < +last.slice(0, 4) || (y === +last.slice(0, 4) && m <= +last.slice(4, 6)); m === 12 ? (y++, m = 1) : m++) all.push(`${y}${String(m).padStart(2, '0')}`);
    const max = Math.max(...[...months.values()].map((a) => a.length));
    const selected = [];
    const cmpBtn = h('button', { type: 'button', class: 'btn primary', disabled: true, onclick: () => { selected.forEach((r) => api.tabs.create({ url: `https://web.archive.org/web/${r.timestamp}/${r.original}`, active: false })); toast('Deux captures ouvertes en onglets'); } }, icon('upset', 15), 'Comparer (2 onglets)');
    const cmpInfo = h('span', { class: 'muted' }, 'Cochez deux captures pour les comparer.');
    const table = h('tbody');
    const statusLabel = { s2: '2xx', s3: '3xx', s4: '4xx/5xx', sx: 'autre' };
    const frise = h('div', { class: 'frise', role: 'img', 'aria-label': `Frise de ${rows.length} captures de ${ymd(first)} à ${ymd(last)}` },
      all.map((m) => { const arr = months.get(m) || []; const dom = arr.length ? codeClass(arr[0].statuscode) : ''; return h('span', { class: `fr-bar ${dom}`, style: { height: `${arr.length ? 8 + (arr.length / max) * 92 : 2}%` }, title: `${m.slice(0, 4)}-${m.slice(4)} : ${arr.length} capture(s)` }); }));
    const years = [...new Set(all.map((m) => m.slice(0, 4)))];
    const yearAxis = h('div', { class: 'fr-years', 'aria-hidden': 'true' }, years.filter((y, i) => years.length < 14 || i % Math.ceil(years.length / 12) === 0).map((y) => h('span', {}, y)));
    const draw = (filter = '') => clear(table).append(...rows.slice().reverse().filter((r) => !filter || r.timestamp.startsWith(filter)).slice(0, 300).map((r) => {
      const cb = h('input', { type: 'checkbox', 'aria-label': `Sélectionner la capture du ${ymd(r.timestamp)}`, onchange: (e) => { if (e.target.checked) { selected.push(r); if (selected.length > 2) { const old = selected.shift(); table.querySelector(`[data-ts="${old.timestamp}"] input`)?.click(); } } else selected.splice(selected.indexOf(r), 1); cmpBtn.disabled = selected.length !== 2; cmpInfo.textContent = selected.length === 2 ? `${ymd(selected[0].timestamp)} ↔ ${ymd(selected[1].timestamp)}` : 'Cochez deux captures pour les comparer.'; } });
      return h('tr', { dataset: { ts: r.timestamp } }, h('td', {}, cb), h('td', { class: 'tnum nowrap' }, `${ymd(r.timestamp)} ${r.timestamp.slice(8, 10)}:${r.timestamp.slice(10, 12)}`), h('td', {}, h('span', { class: `badge st-${codeClass(r.statuscode)}` }, r.statuscode)), h('td', { class: 'r-url' }, r.original), h('td', {}, r.mimetype), h('td', {}, h('a', { href: `https://web.archive.org/web/${r.timestamp}/${r.original}`, target: '_blank', rel: 'noreferrer', class: 'btn sm' }, 'Ouvrir', icon('external', 13))));
    }));
    const yearSel = h('select', { class: 'input', style: { width: 'auto' }, 'aria-label': 'Filtrer par année', onchange: (e) => draw(e.target.value) }, h('option', { value: '' }, 'Toutes les années'), years.reverse().map((y) => h('option', { value: y }, y)));
    out.append(
      h('section', { class: 'card' }, h('h2', {}, icon('timeline'), `Wayback · ${target}`),
        h('p', { class: 'muted tnum' }, `${rows.length} capture(s) distinctes du ${ymd(first)} au ${ymd(last)} (dédoublonnées par empreinte de contenu)${rows.length > 300 ? ' · tableau limité aux 300 plus récentes, filtrez par année' : ''}.`),
        frise, yearAxis,
        h('div', { class: 'legend' }, Object.entries(statusLabel).map(([k, l]) => h('span', {}, h('i', { class: `fr-key ${k}` }), l)))),
      h('section', { class: 'card stack' }, h('div', { class: 'row', style: { justifyContent: 'space-between' } }, h('h2', { style: { margin: 0 } }, 'Captures'), h('div', { class: 'row' }, yearSel, cmpInfo, cmpBtn)),
        h('div', { class: 'table-wrap' }, h('table', { class: 'table' }, h('thead', {}, h('tr', {}, h('th', { scope: 'col' }, h('span', { class: 'sr-only' }, 'Sélection')), h('th', { scope: 'col' }, 'Date (UTC Wayback)'), h('th', { scope: 'col' }, 'HTTP'), h('th', { scope: 'col' }, 'URL'), h('th', { scope: 'col' }, 'Type'), h('th', { scope: 'col' }, h('span', { class: 'sr-only' }, 'Action')))), table))));
    draw();
  }

  async function loadCc(target) {
    const domain = target.split('/')[0];
    clear(cc).append(h('section', { class: 'card' }, h('h2', {}, icon('layers'), 'Common Crawl'), h('p', { class: 'muted' }, 'Interrogation du dernier index (1 requête, file d’attente polie)…')));
    const res = await api.runtime.sendMessage({ type: 'cc', domain });
    clear(cc).append(h('section', { class: 'card' }, h('h2', {}, icon('layers'), `Common Crawl${res?.index ? ` · ${res.index}` : ''}`),
      !res?.ok ? h('p', {}, `Indisponible : ${res?.error || 'erreur'} (le serveur est strictement limité ; réessayez plus tard).`)
        : res.rows.length ? h('ul', { class: 'entry-list' }, res.rows.map((r) => h('li', { class: 'entry' }, h('span', { class: 'r-url' }, r.url), h('span', { class: 'muted' }, ` · ${r.date || ''} · HTTP ${r.status || '?'}`))))
          : h('p', { class: 'muted' }, 'Aucune URL de ce domaine dans le dernier index (absence ≠ preuve d’absence).')));
  }
}
