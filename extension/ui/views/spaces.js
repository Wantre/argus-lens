// É7 — Spaces : liste, fiche cadrage, journal de requêtes, résultats, notes étiquetées, preuves, hypothèses, sceau.
import { h, clear, iconButton, toast, favicon } from '../dom.js';
import { icon } from '../icons.js';
import { listSpaces, saveSpace, deleteSpace, listEntries, addEntry, deleteEntry } from '../../core/store.js';
import { idb } from '../../core/idb.js';
import { spaceSeal } from '../../core/evidence.js';
import { formatParis, relativeFr } from '../../core/time.js';
import { openModal } from '../dialog.js';

export async function renderSpaces(root, params, ctx) {
  const spaces = await listSpaces();
  const page = h('div', { class: 'page' },
    h('div', { class: 'page-head' }, h('div', {}, h('h1', {}, 'Spaces d’enquête'), h('p', {}, 'Un Space réunit la fiche cadrage, le journal des requêtes, les résultats sauvegardés, les notes et les preuves.')),
      h('button', { type: 'button', class: 'btn primary', onclick: () => ctx.openSpaceDialog() }, icon('plus', 16), 'Nouveau Space')),
    spaces.length ? h('div', { class: 'space-grid' }, spaces.map((s, i) => h('a', { class: 'space-card enter', href: `#/space/${encodeURIComponent(s.id)}`, style: { '--i': i, '--c': s.color } },
      h('span', { class: 'space-dot lg', style: { '--c': s.color } }, icon(s.glyph || 'folder', 18)),
      h('h2', {}, s.name), h('p', { class: 'muted' }, s.cadrage?.question || 'Question à définir'),
      h('p', { class: 'space-foot' }, h('span', { class: 'badge' }, s.status || 'ouvert'), h('span', { class: 'badge tnum' }, `${(s.log || []).length}/${s.budget || 20} requêtes`), ctx.settings.activeSpace === s.id ? h('span', { class: 'badge ok' }, 'actif') : null, h('span', { class: 'muted', style: { marginLeft: 'auto' } }, relativeFr(s.updatedAt))))))
      : h('div', { class: 'empty' }, icon('folder', 28), h('h2', {}, 'Aucun Space pour l’instant'), h('p', {}, 'Créez un Space pour journaliser automatiquement vos recherches et garder vos preuves.'), h('button', { type: 'button', class: 'btn primary', style: { marginTop: '16px' }, onclick: () => ctx.openSpaceDialog() }, 'Créer un Space')));
  root.append(page);
}

const LABELS = { observation: 'Observation', declaration: 'Déclaration', inference: 'Inférence' };

export async function renderSpace(root, params, ctx) {
  let space = await idb.get('spaces', params.id);
  if (!space) { root.append(h('div', { class: 'page' }, h('div', { class: 'empty' }, h('h2', {}, 'Space introuvable'), h('a', { class: 'btn', href: '#/spaces' }, 'Retour aux Spaces')))); return; }
  const page = h('div', { class: 'page' });
  root.append(page);
  const save = async (patch) => { space = await saveSpace({ ...space, ...patch }); };

  async function draw() {
    const entries = (await listEntries(space.id)).sort((a, b) => b.createdAt - a.createdAt);
    const notes = entries.filter((e) => e.type === 'note');
    const ev = entries.filter((e) => e.type === 'evidence');
    const res = entries.filter((e) => e.type === 'result');
    const seal = await spaceSeal(ev.map((e) => e.sha256).filter(Boolean).reverse());
    const used = (space.log || []).length;
    const budget = space.budget || 20;
    const isActive = ctx.settings.activeSpace === space.id;
    const c = space.cadrage || {};
    const field = (k, label, ph, area) => { const id = `cad-${k}`; const el = h(area ? 'textarea' : 'input', { class: 'input', id, placeholder: ph, value: area ? undefined : c[k] || '', onchange: (e) => save({ cadrage: { ...space.cadrage, [k]: e.target.value } }) }, area ? c[k] || '' : null); return h('div', { class: 'field' }, h('label', { for: id }, label), el); };

    const noteText = h('textarea', { class: 'input', id: 'note-text', placeholder: 'Ce que vous avez constaté, lu ou déduit…' });
    const noteUrl = h('input', { class: 'input', id: 'note-url', placeholder: 'https://… (source, facultatif)' });
    const noteLabel = h('select', { class: 'input', id: 'note-label', required: true }, h('option', { value: '' }, 'Choisir (obligatoire)'), Object.entries(LABELS).map(([v, l]) => h('option', { value: v }, l)));
    const noteConf = h('select', { class: 'input', id: 'note-conf' }, ['forte', 'moyenne', 'faible'].map((v) => h('option', { value: v, selected: v === 'moyenne' }, v)));
    const noteDate = h('input', { type: 'date', class: 'input', id: 'note-date' });

    clear(page).append(
      h('div', { class: 'page-head' },
        h('div', { class: 'row', style: { alignItems: 'center', gap: '14px' } }, h('span', { class: 'space-dot lg', style: { '--c': space.color } }, icon(space.glyph || 'folder', 20)),
          h('div', {}, h('h1', {}, space.name), h('p', {}, `Créé le ${formatParis(space.createdAt)} · ${entries.length} élément(s)`))),
        h('div', { class: 'row' },
          isActive ? h('span', { class: 'badge ok' }, 'Space actif') : h('button', { type: 'button', class: 'btn', onclick: async () => { await ctx.update({ activeSpace: space.id }); toast('Space activé : les recherches y sont journalisées', { kind: 'success' }); draw(); } }, icon('check', 15), 'Activer'),
          h('select', { class: 'input', style: { width: 'auto' }, 'aria-label': 'Statut', onchange: (e) => save({ status: e.target.value }) }, ['ouvert', 'en pause', 'clos'].map((s) => h('option', { value: s, selected: s === (space.status || 'ouvert') }, s))),
          h('a', { class: 'btn', href: `#/export?space=${encodeURIComponent(space.id)}` }, icon('download', 15), 'Exporter'),
          h('a', { class: 'btn', href: `#/graph?space=${encodeURIComponent(space.id)}` }, icon('graph', 15), 'Graphe'),
          iconButton('trash', 'Supprimer le Space', { onclick: async () => { if (!confirm(`Supprimer « ${space.name} » et tout son contenu ?`)) return; await deleteSpace(space.id); if (isActive) await ctx.update({ activeSpace: null }); ctx.navigate('#/spaces'); } }))),

      h('div', { class: 'space-layout' },
        h('div', { class: 'stack' },
          h('section', { class: 'card' }, h('h2', {}, icon('file'), 'Fiche cadrage (méthode ARGUS)'),
            h('div', { class: 'grid-2' }, field('question', 'Question décisionnelle', 'Quelle décision éclairer ?', true), field('objectif', 'Objectif et critère de réussite', 'Quand s’arrêter ?', true),
              field('perimetre', 'Périmètre autorisé', 'Sources, période, sujets'), field('exclusions', 'Exclusions', 'Ce qui est hors périmètre'),
              field('periode', 'Période étudiée', 'ex. 2019–2026, fuseau Europe/Paris'), h('div', { class: 'field' }, h('label', { for: 'cad-budget' }, 'Budget (requêtes)'), h('input', { class: 'input', id: 'cad-budget', type: 'number', min: '1', value: budget, onchange: (e) => save({ budget: +e.target.value || 20 }).then(draw) }))),
            field('conclusion', 'Conclusion (à rédiger en fin d’enquête)', 'Réponse, hypothèses confirmées/réfutées, couverture réelle, biais, motif d’arrêt', true)),

          h('section', { class: 'card' }, h('h2', {}, icon('note'), 'Notes'),
            h('div', { class: 'field' }, h('label', { for: 'note-text' }, 'Note (Markdown accepté)'), noteText),
            h('div', { class: 'grid-3' }, h('div', { class: 'field' }, h('label', { for: 'note-label' }, 'Étiquette'), noteLabel), h('div', { class: 'field' }, h('label', { for: 'note-conf' }, 'Confiance'), noteConf), h('div', { class: 'field' }, h('label', { for: 'note-date' }, 'Date de l’événement'), noteDate)),
            h('div', { class: 'row' }, h('div', { class: 'field', style: { flex: 1 } }, h('label', { for: 'note-url' }, 'Source'), noteUrl),
              h('button', { type: 'button', class: 'btn primary', style: { alignSelf: 'flex-end' }, onclick: async () => {
                if (!noteText.value.trim()) { noteText.focus(); return toast('La note est vide', { kind: 'error' }); }
                if (!noteLabel.value) { noteLabel.focus(); noteLabel.setAttribute('aria-invalid', 'true'); return toast('Étiquette obligatoire : Observation, Déclaration ou Inférence', { kind: 'error' }); }
                await addEntry({ spaceId: space.id, type: 'note', text: noteText.value.trim(), url: noteUrl.value.trim(), label: noteLabel.value, confidence: noteConf.value, eventDate: noteDate.value || null });
                toast('Note ajoutée', { kind: 'success' }); draw();
              } }, icon('plus', 15), 'Ajouter')),
            notes.length ? h('ul', { class: 'entry-list' }, notes.map((n) => h('li', { class: 'entry' }, h('span', { class: `note-label lbl-${n.label}` }, LABELS[n.label] || n.label), h('span', { class: 'badge' }, `confiance ${n.confidence}`), n.eventDate ? h('span', { class: 'badge tnum' }, `événement ${n.eventDate}`) : null,
              h('p', {}, n.text), n.url ? h('a', { href: n.url, target: '_blank', rel: 'noreferrer', class: 'r-url' }, n.url) : null, h('span', { class: 'muted tnum', style: { fontSize: '12px' } }, `collecté ${n.createdParis}`),
              iconButton('trash', 'Supprimer la note', { class: 'sm del', onclick: async () => { await deleteEntry(n.id); draw(); } })))) : h('p', { class: 'muted' }, 'Aucune note.')),

          h('section', { class: 'card' }, h('h2', {}, icon('bookmark'), `Résultats sauvegardés (${res.length})`),
            res.length ? h('ul', { class: 'entry-list' }, res.map((r) => h('li', { class: 'entry row', style: { flexWrap: 'nowrap' } }, favicon(r.url || r.domain, 16), h('div', { style: { minWidth: 0, flex: 1 } }, h('a', { href: r.url, target: '_blank', rel: 'noreferrer', class: 'r-title', style: { fontSize: '14px' } }, r.title), h('div', { class: 'r-url' }, r.url)),
              iconButton('trash', 'Retirer', { class: 'sm', onclick: async () => { await deleteEntry(r.id); draw(); } })))) : h('p', { class: 'muted' }, 'Depuis les résultats : bouton « Ajouter au Space » ou touche s.'))),

        h('div', { class: 'stack' },
          h('section', { class: 'card' }, h('h2', {}, icon('zap'), 'Budget de sobriété'),
            h('div', { class: 'budget' }, h('div', { class: 'budget-bar', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': String(budget), 'aria-valuenow': String(used), 'aria-label': 'Requêtes utilisées' }, h('span', { style: { width: `${Math.min(100, (used / budget) * 100)}%`, background: used > budget ? 'var(--danger)' : used > budget * 0.8 ? 'var(--warning)' : 'var(--primary)' } })),
              h('p', { class: 'tnum' }, `${used} / ${budget} requêtes`, used > budget ? h('span', { class: 'ignored' }, ' · budget dépassé : faites le point') : null))),
          h('section', { class: 'card' }, h('h2', {}, icon('shield'), `Preuves (${ev.length})`),
            seal ? h('div', { class: 'seal' }, identicon(seal), h('div', {}, h('strong', {}, 'Sceau du Space'), h('p', { class: 'mono-text', style: { fontSize: '11px', overflowWrap: 'anywhere' } }, seal), h('p', { class: 'muted', style: { fontSize: '12px' } }, 'SHA-256 de la liste ordonnée des empreintes.'))) : null,
            ev.length ? h('ul', { class: 'entry-list' }, ev.map((e) => h('li', { class: 'entry' }, h('strong', {}, e.title || e.originalUrl), h('a', { class: 'r-url', href: e.originalUrl, target: '_blank', rel: 'noreferrer' }, e.originalUrl),
              h('p', { class: 'muted', style: { fontSize: '12px' } }, `${e.collectedAt} · ${e.kind} · ${e.method}`), h('code', { class: 'hash' }, e.sha256),
              e.blobId ? h('button', { type: 'button', class: 'btn sm', onclick: () => showCapture(e) }, icon('image', 14), 'Voir la capture') : null))) : h('p', { class: 'muted' }, 'Capturez une page depuis la popup, le panneau latéral ou le menu contextuel.')),
          h('section', { class: 'card' }, h('h2', {}, icon('list'), 'Hypothèses'), hypotheses()),
          h('section', { class: 'card' }, h('h2', {}, icon('clock'), 'Journal de requêtes'),
            (space.log || []).length ? h('ol', { class: 'log' }, [...space.log].reverse().map((l) => h('li', {}, h('span', { class: 'muted tnum' }, l.at.replace('T', ' ').slice(0, 16)), h('code', {}, l.query), h('span', { class: 'muted' }, `${l.mode} · ${l.count} résultat(s)`), l.engines ? h('span', { class: 'log-eng' }, l.engines) : null, l.decision ? h('em', {}, l.decision) : null)))
              : h('p', { class: 'muted' }, 'Activez ce Space : chaque recherche y sera journalisée (date Paris, moteurs, résultats, erreurs).')))));
  }

  function hypotheses() {
    const list = space.hypotheses || [];
    const wrap = h('div', { class: 'stack' });
    const t = h('input', { class: 'input', placeholder: 'Hypothèse réfutable…', 'aria-label': 'Nouvelle hypothèse' });
    wrap.append(...list.map((hy, i) => h('div', { class: 'hyp' }, h('span', { class: 'badge' }, `H${i + 1}`), h('span', { style: { flex: 1 } }, hy.text),
      h('select', { class: 'input', style: { width: 'auto' }, 'aria-label': `État de H${i + 1}`, onchange: (e) => { const arr = [...list]; arr[i] = { ...hy, state: e.target.value }; save({ hypotheses: arr }); } }, ['ouverte', 'confirmée', 'réfutée'].map((s) => h('option', { value: s, selected: s === hy.state }, s))))),
      h('div', { class: 'row', style: { flexWrap: 'nowrap' } }, t, h('button', { type: 'button', class: 'btn', onclick: async () => { if (!t.value.trim()) return; await save({ hypotheses: [...list, { text: t.value.trim(), state: 'ouverte' }] }); draw(); } }, 'Ajouter')));
    return wrap;
  }

  await draw();
  return { refresh: draw };
}

// Empreinte visuelle (identicon 5×5 symétrique) dérivée du sceau.
function identicon(hex) {
  const cells = [];
  const hue = parseInt(hex.slice(0, 2), 16) * 1.4;
  for (let y = 0; y < 5; y++) for (let x = 0; x < 3; x++) {
    const on = parseInt(hex[y * 3 + x + 2], 16) % 2 === 0;
    if (on) { cells.push([x, y]); if (x < 2) cells.push([4 - x, y]); }
  }
  const svgNs = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(svgNs, 'svg');
  svg.setAttribute('viewBox', '0 0 5 5'); svg.setAttribute('class', 'identicon'); svg.setAttribute('role', 'img'); svg.setAttribute('aria-label', 'Empreinte visuelle du sceau');
  for (const [x, y] of cells) { const r = document.createElementNS(svgNs, 'rect'); r.setAttribute('x', x); r.setAttribute('y', y); r.setAttribute('width', 1); r.setAttribute('height', 1); r.setAttribute('fill', `hsl(${hue} 60% 55%)`); svg.append(r); }
  return svg;
}

async function showCapture(e) {
  const b = await idb.get('blobs', e.blobId);
  if (!b) { toast('Capture introuvable', { kind: 'error' }); return; }
  openModal({ title: e.title || 'Capture', wide: true, body: [h('img', { src: b.dataUrl, alt: `Capture de ${e.originalUrl}`, class: 'capture-img' }), h('p', { class: 'muted mono-text', style: { fontSize: '12px' } }, `SHA-256 ${e.sha256} · ${e.collectedAt}`)] });
}
