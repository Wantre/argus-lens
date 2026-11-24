// Création / édition d'un Space (dossier d'enquête) : nom, couleur, pictogramme, question.
import { h, toast } from './dom.js';
import { icon } from './icons.js';
import { openModal } from './dialog.js';
import { saveSpace, SPACE_COLORS, SPACE_GLYPHS } from '../core/store.js';

export function openSpaceDialog(ctx, preset = {}) {
  if (ctx.settings.ephemeral) { toast('Mode éphémère : création de Space désactivée', { kind: 'error' }); return; }
  let color = preset.color || SPACE_COLORS[0];
  let glyph = preset.glyph || 'folder';
  const name = h('input', { class: 'input', id: 'sp-name', required: true, value: preset.name || '', placeholder: 'Ex. Fournisseur X — vérification publique', autofocus: true });
  const question = h('textarea', { class: 'input', id: 'sp-q', placeholder: 'Quelle décision cette enquête doit-elle éclairer ?' }, preset.question || '');
  const swatches = h('div', { class: 'row', role: 'radiogroup', 'aria-label': 'Couleur' }, SPACE_COLORS.map((c, i) => h('button', { type: 'button', role: 'radio', class: 'swatch', 'aria-checked': String(c === color), 'aria-label': `Couleur ${i + 1}`, style: { '--c': c }, onclick: (e) => { color = c; [...swatches.children].forEach((b) => b.setAttribute('aria-checked', String(b === e.currentTarget))); } })));
  const glyphs = h('div', { class: 'row', role: 'radiogroup', 'aria-label': 'Pictogramme' }, SPACE_GLYPHS.map((g) => h('button', { type: 'button', role: 'radio', class: 'glyph', 'aria-checked': String(g === glyph), 'aria-label': g, onclick: (e) => { glyph = g; [...glyphs.children].forEach((b) => b.setAttribute('aria-checked', String(b === e.currentTarget))); } }, icon(g, 16))));
  const dlg = openModal({
    title: 'Nouveau Space d’enquête',
    body: [
      h('div', { class: 'field' }, h('label', { for: 'sp-name' }, 'Nom'), name),
      h('div', { class: 'field' }, h('label', { for: 'sp-q' }, 'Question décisionnelle ', h('span', { class: 'hint' }, '(fiche cadrage ARGUS, modifiable ensuite)')), question),
      h('div', { class: 'field' }, h('span', {}, 'Couleur'), swatches),
      h('div', { class: 'field' }, h('span', {}, 'Pictogramme'), glyphs),
      h('p', { class: 'muted', style: { fontSize: '12px' } }, 'Budget par défaut : 20 requêtes, 3 pivots par hypothèse (méthode ARGUS). Tout reste stocké localement.'),
    ],
    foot: [h('button', { type: 'button', class: 'btn ghost', onclick: () => dlg.close() }, 'Annuler'), h('button', { type: 'button', class: 'btn primary', onclick: create }, icon('plus', 15), 'Créer et activer')],
  });
  name.addEventListener('keydown', (e) => { if (e.key === 'Enter') create(); });
  async function create() {
    if (!name.value.trim()) { name.focus(); name.setAttribute('aria-invalid', 'true'); toast('Donnez un nom au Space', { kind: 'error' }); return; }
    const s = await saveSpace({ name: name.value.trim(), color, glyph, cadrage: { question: question.value.trim() } });
    await ctx.update({ activeSpace: s.id });
    dlg.close();
    toast(`Space « ${s.name} » créé et activé`, { kind: 'success' });
    ctx.navigate(`#/space/${encodeURIComponent(s.id)}`);
  }
}
