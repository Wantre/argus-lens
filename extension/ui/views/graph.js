// É8 — Graphe des pivots : canvas force-dirigé léger (sans librairie). Nœuds = requêtes, domaines, URL, preuves.
import { h, clear, prefersReducedMotion } from '../dom.js';
import { icon } from '../icons.js';
import { listSpaces, listEntries, allEntries, listHistory } from '../../core/store.js';
import { domainOf } from '../../core/merge.js';
import { download } from '../../core/export.js';

const TYPES = { query: { label: 'Requête', color: '#6D3BFF' }, domain: { label: 'Domaine', color: '#0E7FA6' }, url: { label: 'URL', color: '#A234E0' }, evidence: { label: 'Preuve', color: '#17805A' }, note: { label: 'Note', color: '#9A5F00' } };

export async function buildGraph(spaceId) {
  const nodes = new Map(); const edges = [];
  const add = (id, type, label, extra = {}) => { if (!nodes.has(id)) nodes.set(id, { id, type, label, ...extra }); return id; };
  const link = (a, b, rel, conf = 'moyenne', prov = '') => edges.push({ source: a, target: b, rel, confidence: conf, provenance: prov });
  const spaces = await listSpaces();
  const space = spaces.find((s) => s.id === spaceId);
  const entries = spaceId ? await listEntries(spaceId) : await allEntries();
  for (const e of entries) {
    const url = e.url || e.originalUrl;
    if (!url) continue;
    const d = domainOf(url);
    const u = add(`u:${url}`, 'url', e.title || url, { url });
    if (d) { add(`d:${d}`, 'domain', d); link(`d:${d}`, u, 'héberge', 'forte', 'URL'); }
    if (e.query) { add(`q:${e.query}`, 'query', e.query); link(`q:${e.query}`, u, 'a trouvé', 'moyenne', (e.engines || []).join(', ')); }
    if (e.type === 'evidence') { const ev = add(`e:${e.id}`, 'evidence', `Preuve ${e.sha256?.slice(0, 8)}`); link(ev, u, 'capture', 'forte', `SHA-256 ${e.sha256}`); }
    if (e.type === 'note') { const n = add(`n:${e.id}`, 'note', `${e.label} : ${e.text.slice(0, 30)}`); link(n, u, e.label, e.confidence, 'note'); }
  }
  const log = space ? space.log || [] : (await listHistory()).slice(0, 30).map((x) => ({ query: x.q, domains: x.domains }));
  for (const l of log) {
    const qid = add(`q:${l.query}`, 'query', l.query);
    for (const d of l.domains || []) { add(`d:${d}`, 'domain', d); link(qid, `d:${d}`, 'résultat', 'faible', 'historique'); }
  }
  return { nodes: [...nodes.values()], edges: edges.filter((e) => nodes.has(e.source) && nodes.has(e.target)) };
}

export async function renderGraph(root, params, ctx) {
  const spaces = await listSpaces();
  const spaceSel = h('select', { class: 'input', style: { width: 'auto' }, 'aria-label': 'Périmètre du graphe', onchange: (e) => ctx.navigate(`#/graph${e.target.value ? `?space=${encodeURIComponent(e.target.value)}` : ''}`) }, h('option', { value: '' }, 'Tous les Spaces + historique'), spaces.map((s) => h('option', { value: s.id, selected: s.id === params.space }, s.name)));
  const search = h('input', { class: 'input', type: 'search', placeholder: 'Rechercher un nœud…', 'aria-label': 'Rechercher un nœud', style: { maxWidth: '240px' } });
  const typeChecks = Object.entries(TYPES).map(([t, m]) => h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: true, value: t }), h('i', { class: 'fr-key', style: { background: m.color } }), m.label));
  const canvas = h('canvas', { class: 'graph-canvas', role: 'img', 'aria-label': 'Graphe des pivots (une liste textuelle équivalente suit)' });
  const tableBody = h('tbody');
  const info = h('p', { class: 'muted', 'aria-live': 'polite' });
  const g = await buildGraph(params.space);
  root.append(h('div', { class: 'page' },
    h('div', { class: 'page-head' }, h('div', {}, h('h1', {}, 'Graphe des pivots'), h('p', {}, 'Nœuds : requêtes, domaines, URL, preuves, notes. Arêtes : relation, provenance et confiance.')),
      h('div', { class: 'row' }, spaceSel, h('button', { type: 'button', class: 'btn', onclick: () => { const a = document.createElement('a'); a.href = canvas.toDataURL('image/png'); a.download = 'argus-graphe.png'; a.click(); } }, icon('image', 15), 'PNG'),
        h('button', { type: 'button', class: 'btn', onclick: () => download('argus-graphe.json', JSON.stringify(g, null, 2), 'application/json') }, icon('download', 15), 'JSON'))),
    h('p', { class: 'rule' }, icon('alert', 16), 'Règle ARGUS : un pseudo identique n’est pas une preuve d’identité. Ne jamais fusionner des personnes sur un pseudo seul.'),
    h('div', { class: 'card stack' }, h('div', { class: 'row' }, search, ...typeChecks, info), canvas),
    h('details', { class: 'card' }, h('summary', { style: { cursor: 'pointer', fontWeight: 600 } }, 'Liste des relations (équivalent textuel)'), h('div', { class: 'table-wrap' }, h('table', { class: 'table' }, h('thead', {}, h('tr', {}, ['Source', 'Relation', 'Cible', 'Confiance', 'Provenance'].map((x) => h('th', { scope: 'col' }, x)))), tableBody)))));

  clear(tableBody).append(...g.edges.slice(0, 400).map((e) => { const s = g.nodes.find((n) => n.id === e.source); const t = g.nodes.find((n) => n.id === e.target); return h('tr', {}, h('td', {}, s.label), h('td', {}, e.rel), h('td', {}, t.label), h('td', {}, e.confidence), h('td', { class: 'r-url' }, e.provenance)); }));
  if (!g.nodes.length) { canvas.replaceWith(h('div', { class: 'empty' }, icon('graph', 28), h('h2', {}, 'Graphe vide'), h('p', {}, 'Sauvegardez des résultats, notes ou preuves dans un Space pour faire apparaître les pivots.'))); return; }

  const dpr = Math.min(devicePixelRatio || 1, 2);
  const ctx2 = canvas.getContext('2d');
  let W = 0; let H = 520;
  const view = { x: 0, y: 0, k: 1 };
  const N = g.nodes.map((n, i) => ({ ...n, x: Math.cos(i) * 120 + (Math.random() - 0.5) * 40, y: Math.sin(i) * 120 + (Math.random() - 0.5) * 40, vx: 0, vy: 0 }));
  const byId = new Map(N.map((n) => [n.id, n]));
  const E = g.edges.map((e) => ({ ...e, s: byId.get(e.source), t: byId.get(e.target) }));
  const deg = new Map(); for (const e of E) { deg.set(e.s.id, (deg.get(e.s.id) || 0) + 1); deg.set(e.t.id, (deg.get(e.t.id) || 0) + 1); }
  const visibleTypes = () => new Set(typeChecks.map((l) => l.querySelector('input')).filter((i) => i.checked).map((i) => i.value));
  let hover = null; let alpha = 1; let raf = 0;
  const resize = () => { W = canvas.clientWidth; canvas.width = W * dpr; canvas.height = H * dpr; canvas.style.height = `${H}px`; draw(); };
  function tick() {
    const vt = visibleTypes();
    const nodes = N.filter((n) => vt.has(n.type));
    for (let i = 0; i < nodes.length; i++) for (let j = i + 1; j < nodes.length; j++) {
      const a = nodes[i]; const b = nodes[j]; let dx = b.x - a.x; let dy = b.y - a.y; let d2 = dx * dx + dy * dy || 0.01;
      if (d2 > 90000) continue; const f = (900 / d2) * alpha; const d = Math.sqrt(d2); dx /= d; dy /= d;
      a.vx -= dx * f; a.vy -= dy * f; b.vx += dx * f; b.vy += dy * f;
    }
    for (const e of E) { if (!vt.has(e.s.type) || !vt.has(e.t.type)) continue; const dx = e.t.x - e.s.x; const dy = e.t.y - e.s.y; const d = Math.sqrt(dx * dx + dy * dy) || 1; const f = (d - 70) * 0.02 * alpha; e.s.vx += (dx / d) * f; e.s.vy += (dy / d) * f; e.t.vx -= (dx / d) * f; e.t.vy -= (dy / d) * f; }
    for (const n of nodes) { n.vx -= n.x * 0.002 * alpha; n.vy -= n.y * 0.002 * alpha; n.vx *= 0.82; n.vy *= 0.82; if (n !== drag) { n.x += n.vx; n.y += n.vy; } }
    alpha *= 0.985;
  }
  function draw() {
    const vt = visibleTypes(); const q = search.value.toLowerCase();
    const css = getComputedStyle(document.documentElement);
    ctx2.setTransform(dpr, 0, 0, dpr, 0, 0); ctx2.clearRect(0, 0, W, H);
    ctx2.translate(W / 2 + view.x, H / 2 + view.y); ctx2.scale(view.k, view.k);
    ctx2.lineWidth = 1 / view.k;
    for (const e of E) { if (!vt.has(e.s.type) || !vt.has(e.t.type)) continue; ctx2.strokeStyle = e.confidence === 'forte' ? 'rgba(109,59,255,.55)' : e.confidence === 'faible' ? 'rgba(120,110,150,.22)' : 'rgba(120,110,150,.4)'; ctx2.setLineDash(e.confidence === 'faible' ? [3, 3] : []); ctx2.beginPath(); ctx2.moveTo(e.s.x, e.s.y); ctx2.lineTo(e.t.x, e.t.y); ctx2.stroke(); }
    ctx2.setLineDash([]);
    ctx2.font = `${12 / view.k}px Inter, system-ui, sans-serif`;
    for (const n of N) {
      if (!vt.has(n.type)) continue;
      const r = 5 + Math.min(8, (deg.get(n.id) || 0) * 1.2);
      const match = q && n.label.toLowerCase().includes(q);
      ctx2.globalAlpha = q && !match ? 0.25 : 1;
      ctx2.fillStyle = TYPES[n.type].color; ctx2.beginPath(); ctx2.arc(n.x, n.y, r, 0, Math.PI * 2); ctx2.fill();
      if (n === hover || match) { ctx2.strokeStyle = css.getPropertyValue('--text'); ctx2.lineWidth = 2 / view.k; ctx2.stroke(); ctx2.lineWidth = 1 / view.k; }
      if (r > 7 || n === hover || match || view.k > 1.4) { ctx2.fillStyle = css.getPropertyValue('--text'); ctx2.fillText(n.label.slice(0, 36), n.x + r + 4, n.y + 4); }
    }
    ctx2.globalAlpha = 1;
  }
  function loop() { tick(); draw(); if (alpha > 0.02) raf = requestAnimationFrame(loop); }
  const toWorld = (ev) => { const r = canvas.getBoundingClientRect(); return { x: (ev.clientX - r.left - W / 2 - view.x) / view.k, y: (ev.clientY - r.top - H / 2 - view.y) / view.k }; };
  const pick = (p) => N.find((n) => visibleTypes().has(n.type) && (n.x - p.x) ** 2 + (n.y - p.y) ** 2 < 144);
  let drag = null; let pan = null;
  canvas.addEventListener('pointerdown', (ev) => { const p = toWorld(ev); drag = pick(p); if (!drag) pan = { x: ev.clientX - view.x, y: ev.clientY - view.y }; canvas.setPointerCapture(ev.pointerId); });
  canvas.addEventListener('pointermove', (ev) => { const p = toWorld(ev); if (drag) { drag.x = p.x; drag.y = p.y; alpha = Math.max(alpha, 0.3); cancelAnimationFrame(raf); loop(); } else if (pan) { view.x = ev.clientX - pan.x; view.y = ev.clientY - pan.y; draw(); } else { const n = pick(p); if (n !== hover) { hover = n; info.textContent = n ? `${TYPES[n.type].label} : ${n.label}` : ''; canvas.style.cursor = n ? 'pointer' : 'grab'; draw(); } } });
  canvas.addEventListener('pointerup', () => { drag = null; pan = null; });
  canvas.addEventListener('dblclick', (ev) => { const n = pick(toWorld(ev)); if (n?.type === 'domain') ctx.navigate(`#/pivot?type=domain&v=${encodeURIComponent(n.label)}`); else if (n?.url) window.open(n.url, '_blank', 'noopener'); });
  canvas.addEventListener('wheel', (ev) => { ev.preventDefault(); view.k = Math.max(0.3, Math.min(3, view.k * (ev.deltaY < 0 ? 1.1 : 0.9))); draw(); }, { passive: false });
  search.addEventListener('input', draw);
  typeChecks.forEach((l) => l.querySelector('input').addEventListener('change', () => { alpha = 0.5; loop(); }));
  addEventListener('resize', resize);
  resize();
  if (prefersReducedMotion()) { for (let i = 0; i < 300; i++) tick(); draw(); } else loop();
  return { destroy() { cancelAnimationFrame(raf); removeEventListener('resize', resize); } };
}
