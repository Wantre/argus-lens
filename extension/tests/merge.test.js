import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeUrl, mergeResults, sortResults, localFilter, RRF_K, domainCounts } from '../core/merge.js';
import { parseQuery } from '../core/query-parser.js';

test('CA6 : normalisation et fusion avec 2 badges', () => {
  assert.equal(normalizeUrl('https://www.ex.com/a/?utm_source=x'), normalizeUrl('http://ex.com/a'));
  const merged = mergeResults({ marginalia: [{ url: 'https://www.ex.com/a/?utm_source=x', title: 'A' }], wiby: [{ url: 'http://ex.com/a', title: 'A' }] });
  assert.equal(merged.length, 1);
  assert.deepEqual(merged[0].engines.sort(), ['marginalia', 'wiby']);
  assert.equal(merged[0].rare, false);
  assert.equal(merged[0].url.startsWith('https:'), true);
});

test('normalisation : fragment, fbclid, slash final, index.html, tri des paramètres', () => {
  assert.equal(normalizeUrl('https://EX.com/p/index.html#top'), 'ex.com/p');
  assert.equal(normalizeUrl('https://ex.com/p?b=2&fbclid=1&a=1'), 'ex.com/p?a=1&b=2');
});

test('RRF k=60 et rareté', () => {
  const merged = mergeResults({ marginalia: [{ url: 'https://a.fr/' }, { url: 'https://b.fr/' }], wiby: [{ url: 'https://b.fr/' }] });
  const b = merged.find((m) => m.domain === 'b.fr');
  const a = merged.find((m) => m.domain === 'a.fr');
  assert.equal(b.score, 1 / (RRF_K + 2) + 1 / (RRF_K + 1));
  assert.equal(a.score, 1 / (RRF_K + 1));
  assert.equal(merged[0].domain, 'b.fr');
  assert.equal(a.rare, true);
  assert.equal(b.rare, false);
});

test('fusion par titre quasi identique sur le même domaine', () => {
  const merged = mergeResults({ marginalia: [{ url: 'https://ex.com/a?x=1', title: 'Rapport annuel 2024 de la société' }], wiby: [{ url: 'https://ex.com/a?x=2', title: 'Rapport annuel 2024 de la société' }] });
  assert.equal(merged.length, 1);
});

test('lentille de rareté : profondeurs avant domaines dominants', () => {
  const merged = mergeResults({ marginalia: [{ url: 'https://fr.wikipedia.org/x' }, { url: 'https://perso.example/x' }], wiby: [{ url: 'https://fr.wikipedia.org/x' }] });
  assert.equal(sortResults(merged, 'relevance', 0)[0].domain, 'fr.wikipedia.org');
  assert.equal(sortResults(merged, 'relevance', 1)[0].domain, 'perso.example');
});

test('filtrage local des opérateurs non supportés', () => {
  const ast = parseQuery('rapport filetype:pdf -brouillon site:gouv.fr');
  const res = [
    { url: 'https://www.interieur.gouv.fr/r.pdf', title: 'Rapport', snippet: '' },
    { url: 'https://www.interieur.gouv.fr/r.html', title: 'Rapport', snippet: '' },
    { url: 'https://ex.com/r.pdf', title: 'Rapport', snippet: '' },
    { url: 'https://gouv.fr/b.pdf', title: 'Rapport brouillon', snippet: '' },
  ];
  const f = localFilter(res, ast, {});
  assert.equal(f.results.length, 1);
  assert.equal(f.removed, 3);
  assert.deepEqual(f.applied.sort(), ['filetype', 'none', 'site']);
  assert.equal(localFilter(res, ast, { site: true, filetype: true, none: true }).results.length, 4);
});

test('comptage des domaines', () => {
  const merged = mergeResults({ wiby: [{ url: 'https://a.fr/1' }, { url: 'https://a.fr/2' }, { url: 'https://b.fr/' }] });
  assert.deepEqual(domainCounts(merged)[0], ['a.fr', 2]);
});
