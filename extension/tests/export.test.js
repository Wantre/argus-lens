import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toJSON, fromJSON, toCSV, toMarkdown } from '../core/export.js';

const bundle = { spaces: [{ space: { id: 's1', name: 'Test ; "guillemets"', log: [{ at: '2026-11-10T01:00:00+01:00', query: 'x', count: 0 }] }, entries: [{ id: 'e1', type: 'note', text: 'Ligne 1\nLigne 2', label: 'observation', confidence: 'forte' }] }], history: [{ id: 'h1', q: 'é à ç', mode: 'web' }] };

test('CA12 : JSON ré-importable sans perte', () => assert.deepEqual(fromJSON(toJSON(bundle)), bundle));
test('JSON : format inconnu refusé', () => assert.throws(() => fromJSON('{"a":1}')));
test('CA12 : CSV UTF-8 BOM, séparateur ;, échappement', () => {
  const csv = toCSV([{ a: 'x;y', b: 'dit "non"', c: ['m', 'n'] }, { a: 'é', b: 'l1\nl2', c: '' }], ['a', 'b', 'c']);
  assert.equal(csv.charCodeAt(0), 0xfeff);
  const lines = csv.slice(1).split('\r\n');
  assert.equal(lines[0], 'a;b;c');
  assert.equal(lines[1], '"x;y";"dit ""non""";m, n');
  assert.equal(csv.slice(1).split('\r\n').length, 3);
});
test('CSV séparateur virgule sans BOM', () => assert.equal(toCSV([{ a: 1, b: 2 }], null, { sep: ',', bom: false }), 'a,b\r\n1,2'));
test('CA12 : Markdown conforme au modèle ARGUS', () => {
  const md = toMarkdown({ space: bundle.spaces[0].space, entries: [...bundle.spaces[0].entries, { type: 'evidence', originalUrl: 'https://a.fr', finalUrl: 'https://a.fr', collectedAt: '2026-11-10T01:00:00+01:00', sha256: 'ab'.repeat(32), kind: 'brut', method: 'capture' }], log: bundle.spaces[0].space.log });
  for (const sec of ['## Hypothèses', '## Journal de requêtes', '## Provenance', '## Faits et évaluation', '## Chronologie', '## Conclusion', 'Question décisionnelle']) assert.ok(md.includes(sec), sec);
  assert.ok(md.includes('ab'.repeat(32)));
  assert.ok(md.includes('Ligne 1 Ligne 2'));
});
