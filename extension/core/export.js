// Export JSON (ré-importable), CSV (UTF-8 BOM, séparateur ;), Markdown (modèle ARGUS).
import { parisIso, formatParis } from './time.js';

export const EXPORT_VERSION = 1;

export function toJSON(bundle) {
  return JSON.stringify({ format: 'argus-lens', version: EXPORT_VERSION, exportedAt: parisIso(), ...bundle }, null, 2);
}

export function fromJSON(text) {
  const data = JSON.parse(text);
  if (data.format !== 'argus-lens') throw new Error('Fichier non reconnu (format argus-lens attendu)');
  const { format, version, exportedAt, ...bundle } = data;
  return bundle;
}

function cell(v, sep) {
  const s = v == null ? '' : Array.isArray(v) ? v.join(', ') : String(v);
  return /["\n\r]/.test(s) || s.includes(sep) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCSV(rows, columns, { sep = ';', bom = true } = {}) {
  const cols = columns || [...new Set(rows.flatMap((r) => Object.keys(r)))];
  const lines = [cols.map((c) => cell(c, sep)).join(sep), ...rows.map((r) => cols.map((c) => cell(r[c], sep)).join(sep))];
  return (bom ? '\uFEFF' : '') + lines.join('\r\n');
}

const md = (s) => String(s ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ');

export function toMarkdown({ space, entries = [], log = [] }) {
  const c = space?.cadrage || {};
  const notes = entries.filter((e) => e.type === 'note');
  const ev = entries.filter((e) => e.type === 'evidence');
  const res = entries.filter((e) => e.type === 'result');
  const hyp = space?.hypotheses || [];
  const L = [];
  L.push(`# Enquête — ${space?.name || 'Sans titre'}`);
  L.push(`Export ARGUS Lens du ${formatParis(new Date())} (heure de Paris)`);
  L.push('');
  L.push(`ID : ${space?.id || ''}`);
  L.push(`Question décisionnelle : ${c.question || ''}`);
  L.push(`Objectif et critère de réussite : ${c.objectif || ''}`);
  L.push(`Périmètre autorisé / exclusions : ${[c.perimetre, c.exclusions].filter(Boolean).join(' / ')}`);
  L.push(`Période étudiée / fuseau Europe/Paris : ${c.periode || ''}`);
  L.push(`Budget temps, requêtes, lectures, coût : ${space?.budget ? `${space.budget} requêtes` : ''}`);
  L.push(`Statut : ${space?.status || 'ouvert'}`);
  L.push('');
  L.push('## Hypothèses');
  L.push('| ID | Hypothèse réfutable | Preuve attendue | Test contraire | État |');
  L.push('|---|---|---|---|---|');
  hyp.forEach((h, i) => L.push(`| H${i + 1} | ${md(h.text)} | ${md(h.expected)} | ${md(h.counter)} | ${md(h.state)} |`));
  L.push('');
  L.push('## Journal de requêtes');
  L.push('| Date Europe/Paris | Outil et état | Requête exacte expurgée | Filtres | Résultats | Décision/pivot | Coût/quota |');
  L.push('|---|---|---|---|---|---|---|');
  for (const l of log) L.push(`| ${md(l.at)} | ${md(l.engines)} | ${md(l.query)} | ${md(l.mode)} | ${md(l.count)} | ${md(l.decision)} | ${md(l.errors)} |`);
  L.push('');
  L.push('## Provenance');
  L.push('| ID | URL originale | URL finale | Auteur/éditeur | Date publication | Collecte Europe/Paris | Méthode | Chemin pièce | SHA256 | Type (brut/transformé) | Limites |');
  L.push('|---|---|---|---|---|---|---|---|---|---|---|');
  ev.forEach((e, i) => L.push(`| P${i + 1} | ${md(e.originalUrl)} | ${md(e.finalUrl)} |  |  | ${md(e.collectedAt)} | ${md(e.method)} | stockage local de l'extension | ${md(e.sha256)} | ${md(e.kind)} | partie visible seulement |`));
  L.push('');
  L.push('## Faits et évaluation');
  L.push('| Affirmation | Pièces | Primaire/secondaire | Indépendance | Confiance motivée | Contradictions | État (fait/inférence/non vérifié) |');
  L.push('|---|---|---|---|---|---|---|');
  for (const n of notes) L.push(`| ${md(n.text)} | ${md(n.url)} |  |  | ${md(n.confidence)} |  | ${md(n.label)} |`);
  L.push('');
  L.push('## Résultats sauvegardés');
  for (const r of res) L.push(`- [${md(r.title)}](${r.url}) — ${r.domain || ''} (${(r.engines || []).join(', ')})`);
  L.push('');
  L.push('## Chronologie');
  L.push("Date de l'événement distincte de publication et collecte.");
  const chrono = [...ev.map((e) => ({ at: e.collectedAt, what: `Collecte : ${e.title || e.originalUrl}` })), ...notes.filter((n) => n.eventDate).map((n) => ({ at: n.eventDate, what: `Événement : ${n.text}` }))].sort((a, b) => String(a.at).localeCompare(String(b.at)));
  for (const x of chrono) L.push(`- ${x.at} — ${x.what}`);
  L.push('');
  L.push('## Conclusion');
  L.push(c.conclusion || '');
  L.push('');
  L.push("> Une absence de résultat n'est pas une preuve d'absence. Un pseudo identique n'est pas une preuve d'identité.");
  return L.join('\n');
}

export function download(filename, text, mime = 'text/plain') {
  const blob = new Blob([text], { type: `${mime};charset=utf-8` });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.textContent = filename;
  a.hidden = true;
  document.body.append(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}
