import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildTabUrl, ignoredFor, TAB_ENGINES } from '../engines/tab-engines.js';
import { translate } from '../core/operators-compat.js';
import { parseQuery } from '../core/query-parser.js';

const ast = parseQuery('"mot exact" site:gouv.fr -pub filetype:pdf');
const q = encodeURIComponent('"mot exact" site:gouv.fr -pub filetype:pdf');

test('CA8 : Google', () => assert.equal(buildTabUrl('google', ast), `https://www.google.com/search?q=${q}`));
test('CA8 : Bing', () => assert.equal(buildTabUrl('bing', ast), `https://www.bing.com/search?q=${q}`));
test('CA8 : DuckDuckGo', () => assert.equal(buildTabUrl('ddg', ast), `https://duckduckgo.com/?q=${q}`));
test('CA8 : Yandex (filetype -> mime)', () => assert.equal(buildTabUrl('yandex', ast), `https://yandex.com/search/?text=${encodeURIComponent('"mot exact" site:gouv.fr -pub mime:pdf')}`));
test('Google : langue et pays en paramètres', () => assert.equal(buildTabUrl('google', parseQuery('x lang:fr region:fr')), 'https://www.google.com/search?q=x&lr=lang_fr&cr=countryFR'));
test('encodage des caractères spéciaux', () => assert.equal(buildTabUrl('google', parseQuery('café & thé')), `https://www.google.com/search?q=${encodeURIComponent('café & thé')}`));
test('opérateurs ignorés signalés', () => {
  assert.deepEqual(ignoredFor('bing', parseQuery('x after:2024-01-01 inurl:a')).sort(), ['dates', 'inurl']);
  assert.deepEqual(ignoredFor('google', parseQuery('x after:2024-01-01 inurl:a')), []);
  assert.deepEqual(translate('wiby', parseQuery('"a b" site:x.fr')).ignored.sort(), ['exact', 'site']);
});
test('Yandex : dates au format date:>AAAAMMJJ', () => assert.match(translate('yandex', parseQuery('x after:2024-03-05')).query, /date:>20240305/));
test('toutes les URL sont en https', () => { for (const e of TAB_ENGINES) assert.match(e.url(ast, 'example.com'), /^https:\/\//, e.id); });
