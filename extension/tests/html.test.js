import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseHtml, parseXml, clean } from '../core/html.js';
import { OPEN_ENGINES } from '../engines/open-engines.js';
import { parseQuery } from '../core/query-parser.js';
import { clearCooldowns } from '../engines/http.js';

const eng = (id) => OPEN_ENGINES.find((e) => e.meta.id === id);
const html = (body, status = 200) => async () => new Response(body, { status, headers: { 'Content-Type': 'text/html' } });

test('analyseur : sélecteurs balise, classe, attribut, descendant, enfant, liste', () => {
  const d = parseHtml('<ul class="r x"><li><h2><a href="/a?x=1&amp;y=2">Un &eacute;t&eacute;</a></h2><p class=s>S1<br>suite</p></li><li data-type="web"><a href="b">B</a><img src=x></li></ul><script>var a="<li>";</script>');
  assert.equal(d.qsa('li').length, 2);
  assert.equal(d.qsa('ul.r > li').length, 2);
  assert.equal(d.qs('h2 a').attr('href'), '/a?x=1&y=2');
  assert.equal(clean(d.qs('h2 a').text), 'Un été');
  assert.equal(clean(d.qs('p.s').text), 'S1 suite');
  assert.equal(d.qsa('[data-type=web]').length, 1);
  assert.equal(d.qsa('[class*=r]').length, 1);
  assert.equal(d.qsa('p.s, [data-type=web]').length, 2);
});

test('analyseur XML : RSS (link non vide) et Atom', () => {
  const x = parseXml('<?xml version="1.0"?><rss><channel><item><title>T</title><link>https://a.fr/</link><description>D</description></item></channel></rss>');
  assert.equal(clean(x.qs('item > link').text), 'https://a.fr/');
});

test('DuckDuckGo HTML : publicités retirées, liens uddg décodés ; 202 = bloqué', async () => {
  clearCooldowns();
  const page = '<div class="result results_links result--ad"><a class="result__a" href="https://duckduckgo.com/y.js?ad">Pub</a></div><div class="result results_links"><h2><a class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Ffr.wikipedia.org%2Fwiki%2FIA&rut=1">IA — Wikipédia</a></h2><a class="result__snippet">Définition</a></div>';
  const r = await eng('ddg').search(parseQuery('ia'), { fetchImpl: html(page) });
  assert.deepEqual(r.map((x) => x.url), ['https://fr.wikipedia.org/wiki/IA']);
  await assert.rejects(eng('ddg').search(parseQuery('ia'), { fetchImpl: html('<html>anomaly</html>', 202) }), (e) => e.code === 'BLOCKED');
});

test('Bing : RSS avec marché, puis repli HTML avec liens /ck/a décodés', async () => {
  const urls = [];
  const rssEmpty = '<?xml version="1.0"?><rss><channel><title>x</title></channel></rss>';
  const htmlPage = `<ol><li class="b_algo"><h2><a href="https://www.bing.com/ck/a?!&&p=1&u=a1${Buffer.from('https://exemple.fr/page').toString('base64url')}&ntb=1">Exemple</a></h2><div class="b_caption"><p>Texte</p></div></li></ol>`;
  const fetchImpl = async (u) => { urls.push(u); return new Response(u.includes('format=rss') ? rssEmpty : htmlPage, { status: 200 }); };
  const r = await eng('bing').search(parseQuery('exemple'), { fetchImpl, lang: 'fr', region: 'fr' });
  assert.ok(urls[0].includes('mkt=fr-FR'));
  assert.equal(r[0].url, 'https://exemple.fr/page');
});

test('Startpage / Mojeek : défi anti-robot détecté, jamais contourné', async () => {
  await assert.rejects(eng('startpage-web').search(parseQuery('x'), { fetchImpl: html('<script id="anubis_challenge" type="application/json">{}</script>') }), (e) => e.code === 'BLOCKED');
  await assert.rejects(eng('mojeek-web').search(parseQuery('x'), { fetchImpl: html('<title>403 - Forbidden</title>automated queries', 403) }), (e) => e.code === 'BLOCKED');
});

test('Wikipédia : FR et EN entrelacés', async () => {
  const fetchImpl = async (u) => new Response(JSON.stringify({ query: { search: [{ title: u.includes('//fr.') ? 'Chat' : 'Cat', snippet: '<span>x</span>', timestamp: '2026-01-01T00:00:00Z' }] } }), { status: 200 });
  const r = await eng('wikipedia').search(parseQuery('chat'), { fetchImpl });
  assert.deepEqual(r.map((x) => x.url), ['https://fr.wikipedia.org/wiki/Chat', 'https://en.wikipedia.org/wiki/Cat']);
});
