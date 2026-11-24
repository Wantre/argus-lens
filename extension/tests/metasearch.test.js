import { test } from 'node:test';
import assert from 'node:assert/strict';
import { metasearch, enginesForMode } from '../core/metasearch.js';
import { FETCH_ENGINES, engineById } from '../engines/fetch-engines.js';
import { parseQuery } from '../core/query-parser.js';
import { clearCooldowns } from '../engines/http.js';
import { beforeEach } from 'node:test';
beforeEach(() => clearCooldowns());

const json = (status, body) => new Response(typeof body === 'string' ? body : JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

test('CA7 : un moteur en 429 simulé, l’autre s’affiche ; pastille « limité »', async () => {
  let marginaliaCalls = 0;
  const fetchImpl = async (url) => {
    if (url.includes('algolia')) { marginaliaCalls++; return json(429, 'QPM Limit Exceeded'); }
    if (url.includes('wiby')) return json(200, [{ URL: 'https://petit.example/', Title: 'Petit &#39;web&#39;', Snippet: 'Un site' }]);
    throw new Error('inattendu');
  };
  const events = [];
  const { summary, raw } = await metasearch({ ast: parseQuery('petit web'), engines: [engineById('hn'), engineById('wiby')], settings: { engines: {}, depth: 1 }, fetchImpl, onEvent: (e) => events.push(e) });
  assert.equal(summary.hn.status, 'limited');
  assert.equal(summary.wiby.status, 'ok');
  assert.equal(raw.wiby[0].title, "Petit 'web'");
  assert.equal(marginaliaCalls, 3, '1 essai + 2 relances avec backoff');
  assert.ok(events.some((e) => e.type === 'results' && e.ms != null), 'latence mesurée par source');
  const firstResult = events.findIndex((e) => e.type === 'results');
  const limited = events.findIndex((e) => e.type === 'engine' && e.status === 'limited');
  assert.ok(firstResult < limited, 'rendu progressif : Wiby arrive avant la fin du backoff HN');
  assert.equal(events.at(-1).type, 'done');
});

test('clé manquante signalée sans requête réseau', async () => {
  let calls = 0;
  const { summary } = await metasearch({ ast: parseQuery('x'), engines: [engineById('brave')], settings: { engines: { brave: { enabled: true, key: '' } } }, fetchImpl: async () => { calls++; return json(200, {}); } });
  assert.equal(summary.brave.status, 'no_key');
  assert.equal(calls, 0);
});

test('erreur HTTP 502 → hors service', async () => {
  const { summary } = await metasearch({ ast: parseQuery('example.com'), engines: [engineById('crtsh')], settings: { engines: {} }, fetchImpl: async () => json(502, 'Bad gateway') });
  assert.equal(summary.crtsh.status, 'down');
  assert.equal(summary.crtsh.http, 502);
});

test('filtrage local appliqué et signalé', async () => {
  const fetchImpl = async () => json(200, [{ URL: 'https://a.fr/doc.pdf', Title: 'A', Snippet: '' }, { URL: 'https://a.fr/page', Title: 'B', Snippet: '' }]);
  const { summary, raw } = await metasearch({ ast: parseQuery('doc filetype:pdf'), engines: [engineById('wiby')], settings: { engines: {}, depth: 1 }, fetchImpl });
  assert.equal(raw.wiby.length, 1);
  assert.equal(summary.wiby.removed, 1);
});

test('sélection des moteurs par mode', () => {
  const s = { engines: { brave: { enabled: false }, mojeek: { enabled: false }, searxng: { enabled: false } } };
  assert.deepEqual(enginesForMode('web', FETCH_ENGINES, s, false).map((e) => e.meta.id), ['ddg', 'bing', 'brave-web', 'mojeek-web', 'yahoo', 'startpage-web', 'qwant', 'searx-public', '4get', 'mwmbl', 'marginalia', 'wiby', 'wikipedia']);
  assert.deepEqual(enginesForMode('infra', FETCH_ENGINES, s, true).map((e) => e.meta.id), ['doh', 'wayback', 'crtsh', 'rdap']);
  assert.deepEqual(enginesForMode('infra', FETCH_ENGINES, s, false), []);
  assert.ok(enginesForMode('tout', FETCH_ENGINES, s, true).length >= 25);
});

test('v2 : pagination multi-pages, déduplication inter-pages et arrêt quand la source ne renvoie plus rien de neuf', async () => {
  const pages = [];
  const fetchImpl = async (url) => { const p = +(new URL(url).searchParams.get('p') || 1); pages.push(p); return json(200, p <= 2 ? Array.from({ length: 6 }, (_, i) => ({ URL: `https://s${p}-${i}.example/`, Title: `T${p}${i}`, Snippet: '' })) : []); };
  const events = [];
  const { raw, summary } = await metasearch({ ast: parseQuery('petit'), engines: [engineById('wiby')], settings: { engines: {}, depth: 3 }, fetchImpl, onEvent: (e) => events.push(e) });
  assert.equal(raw.wiby.length, 12);
  assert.deepEqual(pages, [1, 2, 3]);
  assert.equal(summary.wiby.pages, 2);
  assert.deepEqual(raw.wiby.map((r) => r.rank).slice(0, 7), [1, 2, 3, 4, 5, 6, 7]);
});

test('v2 : page anti-robot → « bloqué », mise en pause, aucune relance', async () => {
  let calls = 0;
  const fetchImpl = async () => { calls++; return new Response('<html><title>Captcha</title><div class="g-recaptcha"></div></html>', { status: 200 }); };
  const r1 = await metasearch({ ast: parseQuery('x'), engines: [engineById('mojeek-web')], settings: { engines: {}, depth: 2 }, fetchImpl });
  assert.equal(r1.summary['mojeek-web'].status, 'blocked');
  const r2 = await metasearch({ ast: parseQuery('x'), engines: [engineById('mojeek-web')], settings: { engines: {}, depth: 2 }, fetchImpl });
  assert.equal(r2.summary['mojeek-web'].status, 'paused');
  assert.equal(calls, 1, 'une seule requête : pas de contournement ni de relance');
});
