import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DORKS, fillDork, dorkVariables } from '../core/dorks.js';

test('CA20 : aucun dork de secrets ou de vulnérabilités', () => {
  const src = readFileSync(new URL('../core/dorks.js', import.meta.url), 'utf8');
  for (const bad of [/password/i, /\.env\b/i, /index of/i, /filetype:sql/i, /inurl:admin/i, /api[_-]?key/i, /backup/i]) assert.equal(bad.test(src), false, String(bad));
});
test('variables et remplissage', () => {
  assert.deepEqual(dorkVariables('site:{domaine} "{nom}"'), ['domaine', 'nom']);
  assert.equal(fillDork('site:{domaine} "{nom}"', { domaine: 'ex.fr' }), 'site:ex.fr "{nom}"');
  assert.ok(DORKS.length >= 15);
});
