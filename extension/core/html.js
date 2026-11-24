// Mini-analyseur HTML tolérant (le service worker MV3 n'a pas de DOMParser).
// Construit un arbre et propose un sous-ensemble de sélecteurs CSS :
// balise, #id, .classe, [attr], [attr=v], [attr*=v], [attr^=v], [attr$=v], [attr~=v], combinateurs « » et « > », listes « , ».
// Aucune exécution : le contenu reste du texte, jamais injecté tel quel dans l'interface.
const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr']);
const RAW = new Set(['script', 'style', 'textarea', 'noscript', 'template', 'svg']);
const AUTOCLOSE = { li: ['li'], p: ['p'], dt: ['dt', 'dd'], dd: ['dt', 'dd'], tr: ['tr', 'td', 'th'], td: ['td', 'th'], th: ['td', 'th'], option: ['option'] };
const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', laquo: '«', raquo: '»', hellip: '…', mdash: '—', ndash: '–', rsquo: '’', lsquo: '‘', ldquo: '“', rdquo: '”', eacute: 'é', egrave: 'è', agrave: 'à', ccedil: 'ç', middot: '·' };
export const decodeEntities = (s) => String(s || '').replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
  if (e[0] === '#') { const n = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : +e.slice(1); try { return String.fromCodePoint(n); } catch { return m; } }
  return ENT[e.toLowerCase()] ?? m;
});

class Node {
  constructor(tag, attrs, parent) { this.tag = tag; this.attrs = attrs; this.parent = parent; this.children = []; }
  attr(n) { return this.attrs?.[n]; }
  get classes() { return (this.attrs?.class || '').split(/\s+/).filter(Boolean); }
  get text() { return textOf(this); }
  qsa(sel) { return querySelectorAll(this, sel); }
  qs(sel) { return querySelectorAll(this, sel, true)[0] || null; }
}

function textOf(n) {
  if (typeof n === 'string') return n;
  let s = '';
  for (const c of n.children) s += typeof c === 'string' ? c : (c.tag === 'br' ? ' ' : textOf(c)) + (/^(p|div|li|h\d|tr|td)$/.test(c.tag) ? ' ' : '');
  return s;
}
export const clean = (s) => decodeEntities(String(s || '')).replace(/\s+/g, ' ').trim();

export function parseHtml(html, { xml = false } = {}) {
  const root = new Node('#root', {}, null);
  let cur = root;
  const re = /<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>|<!(?:[^>]*)>|<\/([a-zA-Z][\w:-]*)\s*>|<([a-zA-Z][\w:-]*)((?:\s+[^\s/>"'=]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+))?)*)\s*(\/?)>/g;
  let last = 0; let m;
  const s = String(html);
  while ((m = re.exec(s))) {
    if (m.index > last) cur.children.push(s.slice(last, m.index));
    last = re.lastIndex;
    if (m[1]) { // fermeture
      const tag = m[1].toLowerCase();
      let n = cur;
      while (n && n.tag !== tag) n = n.parent;
      if (n && n.parent) cur = n.parent;
      continue;
    }
    if (!m[2]) { if (m[0].startsWith('<![CDATA[')) cur.children.push(m[0].slice(9, -3)); continue; }
    const tag = m[2].toLowerCase();
    const attrs = {};
    const ar = /([^\s/>"'=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g; let a;
    while ((a = ar.exec(m[3] || ''))) attrs[a[1].toLowerCase()] = decodeEntities(a[2] ?? a[3] ?? a[4] ?? '');
    const closers = xml ? null : AUTOCLOSE[tag];
    if (closers) {
      let n = cur;
      while (n && n.tag !== '#root' && !['ul', 'ol', 'table', 'tbody', 'dl', 'select', 'div'].includes(n.tag)) { if (closers.includes(n.tag)) { cur = n.parent; break; } n = n.parent; }
    }
    const node = new Node(tag, attrs, cur);
    cur.children.push(node);
    if (!xml && RAW.has(tag) && !m[4]) {
      const end = s.toLowerCase().indexOf(`</${tag}`, last);
      const stop = end < 0 ? s.length : end;
      if (tag !== 'svg') node.children.push(s.slice(last, stop));
      const gt = end < 0 ? s.length : s.indexOf('>', end);
      last = re.lastIndex = gt < 0 ? s.length : gt + 1;
      continue;
    }
    if ((xml || !VOID.has(tag)) && !m[4]) cur = node;
  }
  if (last < s.length) cur.children.push(s.slice(last));
  return root;
}

// --- Sélecteurs ---
function parseCompound(src) {
  const c = { tag: null, id: null, classes: [], attrs: [] };
  const re = /([a-zA-Z][\w-]*|\*)|#([\w-]+)|\.([\w-]+)|\[\s*([\w:-]+)\s*(?:([*^$~|]?=)\s*(?:"([^"]*)"|'([^']*)'|([^\]\s]+)))?\s*\]/g;
  let m;
  while ((m = re.exec(src))) {
    if (m[1]) c.tag = m[1] === '*' ? null : m[1].toLowerCase();
    else if (m[2]) c.id = m[2];
    else if (m[3]) c.classes.push(m[3]);
    else if (m[4]) c.attrs.push({ name: m[4].toLowerCase(), op: m[5], val: m[6] ?? m[7] ?? m[8] });
  }
  return c;
}
function parseSelector(sel) {
  return sel.split(',').map((part) => {
    const toks = part.trim().replace(/\s*>\s*/g, ' > ').split(/\s+/).filter(Boolean);
    const steps = []; let comb = ' ';
    for (const t of toks) { if (t === '>') { comb = '>'; continue; } steps.push({ comb, c: parseCompound(t) }); comb = ' '; }
    return steps;
  });
}
function matches(n, c) {
  if (typeof n === 'string' || n.tag === '#root') return false;
  if (c.tag && n.tag !== c.tag) return false;
  if (c.id && n.attrs.id !== c.id) return false;
  if (c.classes.length) { const cl = n.classes; if (!c.classes.every((x) => cl.includes(x))) return false; }
  for (const a of c.attrs) {
    const v = n.attrs[a.name];
    if (v === undefined) return false;
    if (!a.op) continue;
    if (a.op === '=' && v !== a.val) return false;
    if (a.op === '*=' && !v.includes(a.val)) return false;
    if (a.op === '^=' && !v.startsWith(a.val)) return false;
    if (a.op === '$=' && !v.endsWith(a.val)) return false;
    if (a.op === '~=' && !v.split(/\s+/).includes(a.val)) return false;
  }
  return true;
}
function matchChain(n, steps, i, scope) {
  if (!matches(n, steps[i].c)) return false;
  if (i === 0) return true;
  const comb = steps[i].comb;
  let p = n.parent;
  if (comb === '>') return !!p && p !== scope.parent && matchChain(p, steps, i - 1, scope);
  while (p && p !== scope.parent) { if (matchChain(p, steps, i - 1, scope)) return true; p = p.parent; }
  return false;
}
export function querySelectorAll(scope, sel, first = false) {
  const groups = parseSelector(sel);
  const out = [];
  const walk = (n) => {
    for (const c of n.children) {
      if (typeof c === 'string') continue;
      if (groups.some((g) => matchChain(c, g, g.length - 1, { parent: scope }))) { out.push(c); if (first) return true; }
      if (walk(c) && first) return true;
    }
    return false;
  };
  walk(scope);
  return out;
}

// Analyseur XML minimal (RSS/Atom) réutilisant l'arbre HTML.
export const parseXml = (xml) => parseHtml(String(xml).replace(/<\?xml[^>]*>/, ''), { xml: true });
