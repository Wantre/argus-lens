// É10 — Export JSON (ré-importable) / CSV (UTF-8 BOM, ;) / Markdown (modèle ARGUS) + import JSON.
import { h, toast } from '../dom.js';
import { icon } from '../icons.js';
import { listSpaces, listEntries, listHistory, getSettings, setSettings } from '../../core/store.js';
import { idb } from '../../core/idb.js';
import { toJSON, fromJSON, toCSV, toMarkdown, download } from '../../core/export.js';
import { parisIso } from '../../core/time.js';

const stamp = () => parisIso().slice(0, 16).replace(/[:T]/g, '-');

export async function renderExport(root, params, ctx) {
  const spaces = await listSpaces();
  const scope = h('select', { class: 'input', id: 'exp-scope' }, h('option', { value: 'all' }, 'Tout (Spaces + historique)'), h('option', { value: 'history' }, 'Historique seul'), spaces.map((s) => h('option', { value: s.id, selected: s.id === params.space }, `Space : ${s.name}`)));
  const sep = h('select', { class: 'input', id: 'exp-sep' }, h('option', { value: ';' }, 'Point-virgule (Excel FR)'), h('option', { value: ',' }, 'Virgule'));
  const withShots = h('input', { type: 'checkbox', id: 'exp-shots' });
  const file = h('input', { type: 'file', accept: 'application/json,.json', class: 'input', id: 'imp-file' });

  async function gather() {
    const v = scope.value;
    if (v === 'history') return { history: await listHistory() };
    const sel = v === 'all' ? spaces : spaces.filter((s) => s.id === v);
    const out = { spaces: [], history: v === 'all' ? await listHistory() : [] };
    for (const s of sel) {
      const entries = await listEntries(s.id);
      if (withShots.checked) for (const e of entries) if (e.blobId) e.blob = await idb.get('blobs', e.blobId);
      out.spaces.push({ space: s, entries });
    }
    return out;
  }

  root.append(h('div', { class: 'page' },
    h('div', { class: 'page-head' }, h('div', {}, h('h1', {}, 'Export et import'), h('p', {}, 'Fichiers générés localement (aucun envoi). Les clés d’API ne sont jamais incluses.'))),
    h('div', { class: 'grid-2' },
      h('section', { class: 'card stack' }, h('h2', {}, icon('download'), 'Exporter'),
        h('div', { class: 'field' }, h('label', { for: 'exp-scope' }, 'Périmètre'), scope),
        h('div', { class: 'field' }, h('label', { for: 'exp-sep' }, 'Séparateur CSV'), sep),
        h('label', { class: 'check', for: 'exp-shots' }, withShots, 'Inclure les captures d’écran dans le JSON (fichier plus lourd)'),
        h('div', { class: 'row' },
          h('button', { type: 'button', class: 'btn primary', onclick: async () => { download(`argus-lens-${stamp()}.json`, toJSON(await gather()), 'application/json'); toast('JSON exporté', { kind: 'success' }); } }, 'JSON'),
          h('button', { type: 'button', class: 'btn', onclick: async () => {
            const d = await gather();
            const rows = [...(d.spaces || []).flatMap(({ space, entries }) => entries.map((e) => ({ space: space.name, type: e.type, date_paris: e.collectedAt || e.createdParis, titre: e.title || e.text, url: e.url || e.originalUrl, etiquette: e.label, confiance: e.confidence, sha256: e.sha256, moteurs: e.engines }))),
              ...(d.history || []).map((x) => ({ space: '', type: 'recherche', date_paris: x.atParis, titre: x.q, url: '', etiquette: x.mode, confiance: '', sha256: '', moteurs: `${x.count ?? ''} résultats` }))];
            download(`argus-lens-${stamp()}.csv`, toCSV(rows, ['space', 'type', 'date_paris', 'titre', 'url', 'etiquette', 'confiance', 'sha256', 'moteurs'], { sep: sep.value }), 'text/csv'); toast('CSV exporté', { kind: 'success' });
          } }, 'CSV'),
          h('button', { type: 'button', class: 'btn', onclick: async () => {
            const d = await gather();
            if (!d.spaces?.length) { toast('Le rapport Markdown porte sur un ou plusieurs Spaces', { kind: 'error' }); return; }
            download(`argus-rapport-${stamp()}.md`, d.spaces.map(({ space, entries }) => toMarkdown({ space, entries, log: space.log })).join('\n\n---\n\n'), 'text/markdown'); toast('Rapport Markdown exporté', { kind: 'success' });
          } }, 'Markdown (rapport ARGUS)'))),
      h('section', { class: 'card stack' }, h('h2', {}, icon('upload'), 'Importer'),
        h('p', { class: 'muted' }, 'Ré-importe un export JSON d’ARGUS Lens (Spaces, éléments, historique). Les éléments existants de même identifiant sont remplacés.'),
        h('div', { class: 'field' }, h('label', { for: 'imp-file' }, 'Fichier JSON'), file),
        h('button', { type: 'button', class: 'btn primary', onclick: async () => {
          const f = file.files[0]; if (!f) { toast('Choisissez un fichier', { kind: 'error' }); return; }
          try {
            const b = fromJSON(await f.text());
            let n = 0;
            for (const { space, entries } of b.spaces || []) { await idb.put('spaces', space); n++; for (const e of entries || []) { const { blob, ...rest } = e; if (blob) await idb.put('blobs', blob); await idb.put('entries', rest); } }
            for (const x of b.history || []) await idb.put('history', x);
            if (b.config) await setSettings(b.config);
            toast(`Import réussi : ${n} Space(s), ${(b.history || []).length} recherche(s)`, { kind: 'success' }); ctx.refreshSidebar();
          } catch (e) { toast(`Import impossible : ${e.message}`, { kind: 'error' }); }
        } }, 'Importer'),
        h('hr', { class: 'sep' }),
        h('h3', {}, 'Configuration'),
        h('div', { class: 'row' }, h('button', { type: 'button', class: 'btn', onclick: async () => { const s = await getSettings(); const engines = Object.fromEntries(Object.entries(s.engines).map(([k, v]) => [k, { ...v, key: '', url: k === 'searxng' ? v.url : undefined }])); download(`argus-config-${stamp()}.json`, toJSON({ config: { ...s, engines, engineStatus: {} } }), 'application/json'); toast('Configuration exportée (sans clés)', { kind: 'success' }); } }, 'Exporter la configuration'))))));
}
