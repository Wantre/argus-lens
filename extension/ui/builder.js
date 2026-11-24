// É3 — Constructeur de requête visuel : briques d'opérateurs, aperçu en direct, traduction par moteur, bibliothèque de dorks légaux.
import { h, clear, toast, copyText } from './dom.js';
import { icon } from './icons.js';
import { openDrawer } from './dialog.js';
import { parseQuery, serializeQuery, emptyAst, riskyPattern } from '../core/query-parser.js';
import { translate, OP_LABELS } from '../core/operators-compat.js';
import { buildTabUrl } from '../engines/tab-engines.js';
import { DORKS, dorkVariables, fillDork } from '../core/dorks.js';
import { setSettings, getSettings } from '../core/store.js';

const BRICKS = [
  { key: 'all', label: 'Tous ces mots', ph: 'mots séparés par des espaces', split: /\s+/ },
  { key: 'exact', label: 'Mots exacts', ph: 'phrase exacte ; autre phrase', split: /\s*;\s*/, code: '"…"' },
  { key: 'any', label: 'Au moins un de ces mots', ph: 'mot1 mot2 (OU)', split: /\s+/, code: 'OR' },
  { key: 'none', label: 'Exclure', ph: 'mots à exclure', split: /\s+/, code: '-mot' },
  { key: 'site', label: 'Sur le site', ph: 'gouv.fr, example.com', split: /\s*,\s*|\s+/, code: 'site:' },
  { key: 'notSite', label: 'Pas sur le site', ph: 'pinterest.com', split: /\s*,\s*|\s+/, code: '-site:' },
  { key: 'intitle', label: 'Dans le titre', ph: 'rapport', split: /\s*,\s*/, code: 'intitle:' },
  { key: 'allintitle', label: 'Tout dans le titre', ph: 'rapport annuel', split: /\s*,\s*/, code: 'allintitle:' },
  { key: 'inurl', label: "Dans l'URL", ph: 'blog', split: /\s*,\s*/, code: 'inurl:' },
  { key: 'intext', label: 'Dans le texte', ph: 'mot', split: /\s*,\s*/, code: 'intext:' },
  { key: 'filetype', label: 'Type de fichier', ph: 'pdf, docx', split: /\s*,\s*|\s+/, code: 'filetype:' },
];
const ENGINES = [['google', 'Google'], ['bing', 'Bing'], ['ddg', 'DuckDuckGo'], ['yandex', 'Yandex'], ['brave', 'Brave'], ['mojeek', 'Mojeek'], ['marginalia', 'Marginalia']];
const LANGS = [['', 'Toutes'], ['fr', 'Français'], ['en', 'Anglais'], ['de', 'Allemand'], ['es', 'Espagnol'], ['it', 'Italien']];
const REGIONS = [['', 'Tous'], ['fr', 'France'], ['be', 'Belgique'], ['ch', 'Suisse'], ['ca', 'Canada'], ['us', 'États-Unis'], ['gb', 'Royaume-Uni']];

export function openBuilder(text, onApply, ctx) {
  let ast = parseQuery(text || '');
  const inputs = {};
  const preview = h('output', { class: 'preview', 'aria-live': 'polite', 'aria-label': 'Aperçu de la requête' });
  const warn = h('p', { class: 'ignored', role: 'alert', hidden: true }, 'Motif de recherche de secrets ou de vulnérabilités détecté : hors périmètre ARGUS (aucun modèle fourni).');
  const compat = h('tbody');
  const values = (k) => (Array.isArray(ast[k]) ? ast[k].join(k === 'exact' ? ' ; ' : k === 'all' || k === 'any' || k === 'none' ? ' ' : ', ') : ast[k] || '');

  const bricks = BRICKS.map((b) => {
    const id = `b-${b.key}`;
    const inp = h('input', { class: 'input', id, value: values(b.key), placeholder: b.ph, oninput: update });
    inputs[b.key] = inp;
    return h('div', { class: 'brick' }, h('label', { for: id }, b.label, b.code ? h('br') : null, b.code ? h('code', {}, b.code) : null), inp);
  });
  const date = (k, label) => { const i = h('input', { type: 'date', class: 'input', id: `b-${k}`, value: /^\d{4}-\d{2}-\d{2}$/.test(ast[k] || '') ? ast[k] : '', oninput: update }); inputs[k] = i; return h('div', { class: 'field' }, h('label', { for: `b-${k}` }, label), i); };
  const sel = (k, label, opts) => { const s = h('select', { class: 'input', id: `b-${k}`, onchange: update }, opts.map(([v, l]) => h('option', { value: v, selected: v === (ast[k] || '') }, l))); inputs[k] = s; return h('div', { class: 'field' }, h('label', { for: `b-${k}` }, label), s); };

  function readAst() {
    const a = emptyAst();
    for (const b of BRICKS) a[b.key] = inputs[b.key].value.trim() ? inputs[b.key].value.trim().split(b.split).map((s) => s.trim()).filter(Boolean) : [];
    a.filetype = a.filetype.map((f) => f.replace(/^\./, '').toLowerCase());
    a.site = a.site.map((s) => s.toLowerCase());
    a.any = a.any.map((s) => (/\s/.test(s) ? `"${s}"` : s));
    for (const k of ['after', 'before', 'lang', 'region']) a[k] = inputs[k].value || null;
    return a;
  }

  function update() {
    ast = readAst();
    const qtext = serializeQuery(ast);
    preview.textContent = qtext || '…';
    warn.hidden = !riskyPattern(qtext);
    clear(compat).append(...ENGINES.map(([id, name]) => {
      const t = translate(id, ast);
      return h('tr', {}, h('th', { scope: 'row' }, name), h('td', { class: 'q' }, t.query || '—'), h('td', {}, t.ignored.length ? h('span', { class: 'ignored' }, `ignoré par ${name} : ${t.ignored.map((k) => OP_LABELS[k]).join(', ')}`) : h('span', { class: 'badge ok' }, 'compatible')));
    }));
  }

  const builderPane = h('div', { class: 'stack', id: 'pane-builder', role: 'tabpanel', 'aria-labelledby': 'tab-builder' },
    ...bricks,
    h('div', { class: 'grid-2' }, date('after', 'Après le (after:)'), date('before', 'Avant le (before:)')),
    h('div', { class: 'grid-2' }, sel('lang', 'Langue', LANGS), sel('region', 'Pays / région', REGIONS)),
    h('div', { class: 'stack', style: { gap: '6px' } }, h('strong', {}, 'Aperçu en direct'), preview, warn),
    h('details', { open: true }, h('summary', { style: { cursor: 'pointer', fontWeight: 600 } }, 'Traduction par moteur'),
      h('table', { class: 'compat-table' }, h('thead', {}, h('tr', {}, h('th', { scope: 'col' }, 'Moteur'), h('th', { scope: 'col' }, 'Requête native'), h('th', { scope: 'col' }, 'Opérateurs'))), compat)),
    h('div', { class: 'row' },
      h('button', { type: 'button', class: 'btn sm', onclick: () => { const d = (ast.site[0] || '').replace(/^\*\./, ''); if (!d) return toast('Renseignez d’abord « Sur le site »', { kind: 'error' }); window.open(buildTabUrl('google', parseQuery(`"${d}" -site:${d}`)), '_blank', 'noopener'); } }, icon('link', 15), 'Pages qui citent ce site'),
      h('button', { type: 'button', class: 'btn sm', onclick: () => { const d = ast.site[0] || ast.all.find((w) => w.includes('.')); if (!d) return toast('Renseignez un site ou une URL', { kind: 'error' }); location.hash = `#/archive?u=${encodeURIComponent(d)}`; dlg.close(); } }, icon('archive', 15), 'Version en cache → Wayback')));

  // Bibliothèque de dorks légaux
  const libPane = h('div', { class: 'stack', id: 'pane-lib', role: 'tabpanel', 'aria-labelledby': 'tab-lib', hidden: true });
  const vars = {};
  const allVars = [...new Set(DORKS.flatMap((d) => dorkVariables(d.q)))];
  libPane.append(h('p', { class: 'muted' }, 'Requêtes publiques et légales. Renseignez les variables, puis choisissez un modèle. Aucun modèle de recherche de secrets n’est fourni.'),
    h('div', { class: 'grid-2' }, allVars.map((v) => { const i = h('input', { class: 'input', id: `v-${v}`, placeholder: v, oninput: (e) => { vars[v] = e.target.value; drawLib(); } }); return h('div', { class: 'field' }, h('label', { for: `v-${v}` }, `{${v}}`), i); })));
  const libList = h('div', { class: 'stack', style: { gap: '6px' } });
  libPane.append(libList);
  function drawLib() {
    let cat = '';
    clear(libList);
    for (const d of DORKS) {
      if (d.cat !== cat) { cat = d.cat; libList.append(h('h3', { class: 'lib-cat' }, cat)); }
      const filled = fillDork(d.q, vars);
      libList.append(h('button', { type: 'button', class: 'dork', onclick: () => { if (filled.startsWith('/')) { dlg.close(); onApply(filled); return; } setFrom(filled); switchTab('builder'); } }, h('span', { class: 'dork-l' }, d.label), h('code', {}, filled)));
    }
  }

  // Mes modèles (glisser-déposer + Alt+flèches pour réordonner)
  const minePane = h('div', { class: 'stack', id: 'pane-mine', role: 'tabpanel', 'aria-labelledby': 'tab-mine', hidden: true });
  async function drawMine() {
    const s = await getSettings();
    const items = s.savedDorks || [];
    clear(minePane);
    if (!items.length) { minePane.append(h('p', { class: 'muted' }, 'Aucun modèle personnel. Utilisez le bouton « Modèle » en bas du constructeur.')); return; }
    minePane.append(h('p', { class: 'muted' }, 'Glissez-déposez ou utilisez Alt+↑ / Alt+↓ pour réordonner.'));
    const ul = h('ul', { class: 'stack mine-list', style: { gap: '6px' } });
    const save = async (arr) => { await setSettings({ savedDorks: arr }); drawMine(); };
    items.forEach((d, i) => {
      const li = h('li', { class: 'mine', draggable: 'true', dataset: { i } },
        h('span', { class: 'grip', 'aria-hidden': 'true' }, icon('menu', 15)),
        h('button', { type: 'button', class: 'dork', onclick: () => { setFrom(d.q); switchTab('builder'); }, onkeydown: (e) => {
          if (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) { e.preventDefault(); const j = i + (e.key === 'ArrowUp' ? -1 : 1); if (j < 0 || j >= items.length) return; const arr = [...items]; [arr[i], arr[j]] = [arr[j], arr[i]]; save(arr).then(() => minePane.querySelectorAll('.dork')[j]?.focus()); }
        } }, h('span', { class: 'dork-l' }, d.name), h('code', {}, d.q)),
        h('button', { type: 'button', class: 'icon-btn sm', 'aria-label': `Supprimer ${d.name}`, onclick: () => save(items.filter((_, j) => j !== i)) }, icon('trash', 15)));
      li.addEventListener('dragstart', (e) => { e.dataTransfer.setData('text/plain', String(i)); li.classList.add('dragging'); });
      li.addEventListener('dragend', () => li.classList.remove('dragging'));
      li.addEventListener('dragover', (e) => e.preventDefault());
      li.addEventListener('drop', (e) => { e.preventDefault(); const from = +e.dataTransfer.getData('text/plain'); const arr = [...items]; const [m] = arr.splice(from, 1); arr.splice(i, 0, m); save(arr); });
      ul.append(li);
    });
    minePane.append(ul);
  }

  function setFrom(qtext) {
    ast = parseQuery(qtext);
    for (const b of BRICKS) inputs[b.key].value = values(b.key);
    for (const k of ['after', 'before', 'lang', 'region']) inputs[k].value = ast[k] || '';
    update();
  }

  const tabs = [['builder', 'Constructeur'], ['lib', 'Bibliothèque OSINT'], ['mine', 'Mes modèles']];
  const tablist = h('div', { class: 'seg', role: 'tablist', 'aria-label': 'Sections du constructeur' }, tabs.map(([id, label], i) => h('button', { type: 'button', role: 'tab', id: `tab-${id}`, 'aria-controls': `pane-${id}`, 'aria-selected': String(i === 0), tabindex: i === 0 ? '0' : '-1', onclick: () => switchTab(id) }, label)));
  tablist.addEventListener('keydown', (e) => {
    const ids = tabs.map((t) => t[0]);
    const cur = ids.indexOf(tablist.querySelector('[aria-selected="true"]').id.slice(4));
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { e.preventDefault(); const n = ids[(cur + (e.key === 'ArrowRight' ? 1 : ids.length - 1)) % ids.length]; switchTab(n); tablist.querySelector(`#tab-${n}`).focus(); }
  });
  function switchTab(id) {
    for (const [t] of tabs) {
      const sel = t === id;
      const b = tablist.querySelector(`#tab-${t}`);
      b.setAttribute('aria-selected', String(sel));
      b.tabIndex = sel ? 0 : -1;
      ({ builder: builderPane, lib: libPane, mine: minePane })[t].hidden = !sel;
    }
    if (id === 'lib') drawLib();
    if (id === 'mine') drawMine();
  }

  const dlg = openDrawer({
    title: 'Constructeur de requête',
    body: [tablist, builderPane, libPane, minePane],
    foot: [
      h('button', { type: 'button', class: 'btn ghost', onclick: () => copyText(serializeQuery(ast)) }, icon('copy', 15), 'Copier'),
      h('button', { type: 'button', class: 'btn', title: 'Enregistrer comme modèle personnel', 'aria-label': 'Enregistrer comme modèle personnel', onclick: async () => { const qtext = serializeQuery(ast); if (!qtext) return; const name = prompt('Nom du modèle :', qtext.slice(0, 40)); if (!name) return; const s = await getSettings(); await setSettings({ savedDorks: [...(s.savedDorks || []), { name, q: qtext }] }); toast('Modèle enregistré', { kind: 'success' }); } }, icon('star', 15), 'Modèle'),
      h('a', { class: 'btn', href: '#', onclick: (e) => { e.preventDefault(); window.open(buildTabUrl('google', ast), '_blank', 'noopener'); } }, 'Ouvrir sur Google'),
      h('button', { type: 'button', class: 'btn primary', onclick: () => { const qtext = serializeQuery(ast); if (!qtext) return; dlg.close(); onApply(qtext); } }, icon('search', 15), 'Rechercher'),
    ],
  });
  update();
  setTimeout(() => inputs.all.focus(), 60);
}
