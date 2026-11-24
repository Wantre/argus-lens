import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseQuery, serializeQuery, astToChips, removeChip, targetDomain, riskyPattern, plainTerms } from '../core/query-parser.js';

const CASES = [
  ['mot', { all: ['mot'] }],
  ['deux mots', { all: ['deux', 'mots'] }],
  ['"mot exact"', { exact: ['mot exact'] }],
  ['-pub', { none: ['pub'] }],
  ['-"phrase exclue"', { none: ['phrase exclue'] }],
  ['site:gouv.fr', { site: ['gouv.fr'] }],
  ['site:GOUV.FR', { site: ['gouv.fr'] }],
  ['-site:pinterest.com', { notSite: ['pinterest.com'] }],
  ['filetype:pdf', { filetype: ['pdf'] }],
  ['ext:PDF', { filetype: ['pdf'] }],
  ['filetype:.docx', { filetype: ['docx'] }],
  ['(filetype:docx OR filetype:xlsx)', { filetype: ['docx', 'xlsx'] }],
  ['inurl:blog', { inurl: ['blog'] }],
  ['intitle:"rapport annuel"', { intitle: ['rapport annuel'] }],
  ['allintitle:budget', { allintitle: ['budget'] }],
  ['intext:contrat', { intext: ['contrat'] }],
  ['after:2024-01-01', { after: '2024-01-01' }],
  ['before:2025', { before: '2025' }],
  ['after:hier', { all: ['after:hier'] }],
  ['lang:FR', { lang: 'fr' }],
  ['langue:fr pays:be', { lang: 'fr', region: 'be' }],
  ['a OR b', { any: ['a', 'b'] }],
  ['a | b', { any: ['a', 'b'] }],
  ['"x y" OR z', { any: ['"x y"', 'z'] }],
  ['linux * noyau', { all: ['linux', '*', 'noyau'] }],
  ['site:edu OR site:ac.uk', { site: ['edu', 'ac.uk'] }],
  ['inanchor:test', { all: ['inanchor:test'] }],
  ['"guillemet non fermé', { exact: ['guillemet non fermé'] }],
  ['', {}],
];

for (const [input, expected] of CASES) {
  test(`parse: ${input || '(vide)'}`, () => {
    const ast = parseQuery(input);
    for (const [k, v] of Object.entries(expected)) assert.deepEqual(ast[k], v, `${k} pour « ${input} »`);
    // Aller-retour : parse(serialize(parse(x))) == parse(x)
    assert.deepEqual(parseQuery(serializeQuery(ast)), ast);
  });
}

test('CA5 : requête complète, AST correct et texte identique', () => {
  const s = '"mot exact" site:gouv.fr -pub filetype:pdf after:2024-01-01 a OR b';
  const ast = parseQuery(s);
  assert.deepEqual(ast.exact, ['mot exact']);
  assert.deepEqual(ast.site, ['gouv.fr']);
  assert.deepEqual(ast.none, ['pub']);
  assert.deepEqual(ast.filetype, ['pdf']);
  assert.equal(ast.after, '2024-01-01');
  assert.deepEqual(ast.any, ['a', 'b']);
  assert.deepEqual(ast.all, []);
  assert.equal(serializeQuery(ast), s);
});

test('forme canonique stable sur 10 requêtes', () => {
  const canon = ['linux', '"a b" site:x.fr', 'osint -site:pinterest.com', 'rapport intitle:annuel filetype:pdf', 'x (filetype:docx OR filetype:xlsx)', 'site:edu OR site:ac.uk', 'a after:2020 before:2021 lang:fr region:fr', 'test -spam -"pub cachée"', 'mot inurl:blog intext:prix', 'x OR y OR z'];
  for (const c of canon) assert.equal(serializeQuery(parseQuery(c)), c.replace('site:edu OR site:ac.uk', '(site:edu OR site:ac.uk)'));
});

test('puces : suppression d’un opérateur', () => {
  const ast = parseQuery('osint site:gouv.fr filetype:pdf');
  const chips = astToChips(ast);
  assert.deepEqual(chips.map((c) => c.label), ['site:gouv.fr', 'filetype:pdf']);
  assert.equal(serializeQuery(removeChip(ast, 'site', 'gouv.fr')), 'osint filetype:pdf');
});

test('domaine cible', () => {
  assert.equal(targetDomain(parseQuery('example.com')), 'example.com');
  assert.equal(targetDomain(parseQuery('https://www.example.org/page')), 'www.example.org');
  assert.equal(targetDomain(parseQuery('rapport site:*.gouv.fr')), 'gouv.fr');
  assert.equal(targetDomain(parseQuery('bonjour monde')), null);
});

test('termes en clair et motifs à risque', () => {
  assert.deepEqual(plainTerms(parseQuery('"a b" c OR d intitle:e')), ['a b', 'c', 'd', 'e']);
  assert.equal(riskyPattern('intext:password site:x.com'), true);
  assert.equal(riskyPattern('filetype:env'), true);
  assert.equal(riskyPattern('site:gouv.fr filetype:pdf'), false);
});
