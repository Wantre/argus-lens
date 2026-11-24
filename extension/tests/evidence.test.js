import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sha256Hex, buildEvidence, spaceSeal, dataUrlToBytes } from '../core/evidence.js';
import { parisIso, greeting } from '../core/time.js';

test('SHA-256 de « abc » (vecteur connu)', async () => assert.equal(await sha256Hex('abc'), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'));
test('CA11 : horodatage Europe/Paris hiver +01:00 et été +02:00', () => {
  assert.equal(parisIso(new Date('2026-01-15T12:00:00Z')), '2026-01-15T13:00:00+01:00');
  assert.equal(parisIso(new Date('2026-07-15T12:00:00Z')), '2026-07-15T14:00:00+02:00');
  assert.equal(parisIso(new Date('2026-03-29T00:59:59Z')), '2026-03-29T01:59:59+01:00');
  assert.equal(parisIso(new Date('2026-03-29T01:00:00Z')), '2026-03-29T03:00:00+02:00');
});
test('CA11 : preuve avec SHA-256 hex 64 caractères recalculable', async () => {
  const bytes = dataUrlToBytes(`data:image/png;base64,${Buffer.from('octets-bruts').toString('base64')}`);
  const ev = await buildEvidence({ originalUrl: 'https://a.fr', title: 'A', bytes, date: new Date('2026-11-10T00:30:00Z') });
  assert.match(ev.sha256, /^[0-9a-f]{64}$/);
  assert.equal(ev.sha256, await sha256Hex(new TextEncoder().encode('octets-bruts')));
  assert.equal(ev.collectedAt, '2026-11-10T01:30:00+01:00');
  assert.equal(ev.kind, 'brut');
});
test('sceau du Space', async () => {
  assert.equal(await spaceSeal([]), null);
  assert.equal(await spaceSeal(['a', 'b']), await sha256Hex('a\nb'));
});
test('salutation selon l’heure de Paris', () => {
  assert.equal(greeting(new Date('2026-11-10T08:00:00Z')), 'Bonjour Monsieur');
  assert.equal(greeting(new Date('2026-11-10T19:00:00Z')), 'Bonsoir Monsieur');
});
