// Parseur de requête ARGUS Lens : texte <-> AST d'opérateurs.
// Multiples valeurs de site:/filetype: = OU logique (comme sur les moteurs).

export const LIST_KEYS = ['all', 'exact', 'any', 'none', 'site', 'notSite', 'inurl', 'intitle', 'allintitle', 'intext', 'filetype'];
export const SCALAR_KEYS = ['after', 'before', 'lang', 'region'];

const OPS = {
  site: 'site', inurl: 'inurl', intitle: 'intitle', allintitle: 'allintitle', intext: 'intext',
  filetype: 'filetype', ext: 'filetype', after: 'after', before: 'before',
  lang: 'lang', langue: 'lang', region: 'region', pays: 'region',
};

export function emptyAst() {
  const ast = {};
  for (const k of LIST_KEYS) ast[k] = [];
  for (const k of SCALAR_KEYS) ast[k] = null;
  return ast;
}

// Découpe en jetons : phrases entre guillemets, parenthèses, mots.
export function tokenize(text) {
  const tokens = [];
  const re = /\s*(-?[a-zA-Z]+:"[^"]*"?|-?"[^"]*"?|\(|\)|[^\s()]+)/g;
  let m;
  while ((m = re.exec(text))) if (m[1]) tokens.push(m[1]);
  return tokens;
}

const unquote = (s) => s.replace(/^"/, '').replace(/"$/, '');
const isDate = (s) => /^\d{4}(-\d{2}(-\d{2})?)?$/.test(s);

export function parseQuery(text = '') {
  const ast = emptyAst();
  const tokens = tokenize(String(text).trim());
  let pendingOr = false;
  let last = null; // { key, value } du dernier terme simple, pour bâtir les OR

  const pushAny = (v) => { if (v && !ast.any.includes(v)) ast.any.push(v); };

  for (const raw of tokens) {
    if (raw === '(' || raw === ')') continue;
    if (raw === 'OR' || raw === '|') { pendingOr = true; continue; }

    let neg = false;
    let tok = raw;
    if (tok.startsWith('-') && tok.length > 1) { neg = true; tok = tok.slice(1); }

    const op = /^([a-zA-Z]+):(.*)$/.exec(tok);
    if (op && OPS[op[1].toLowerCase()] && op[2] !== '') {
      const key = OPS[op[1].toLowerCase()];
      const value = unquote(op[2]);
      pendingOr = false; // OR entre opérateurs de même type = multiples valeurs
      if (key === 'site') { (neg ? ast.notSite : ast.site).push(value.toLowerCase()); continue; }
      if (neg) { ast.none.push(`${key}:${value}`); continue; }
      if (key === 'after' || key === 'before') { if (isDate(value)) ast[key] = value; else ast.all.push(tok); continue; }
      if (key === 'lang' || key === 'region') { ast[key] = value.toLowerCase(); continue; }
      if (key === 'filetype') { const v = value.toLowerCase().replace(/^\./, ''); if (!ast.filetype.includes(v)) ast.filetype.push(v); continue; }
      ast[key].push(value);
      continue;
    }

    const quoted = tok.startsWith('"');
    const value = quoted ? unquote(tok) : tok;
    if (!value) continue;
    if (neg) { ast.none.push(value); pendingOr = false; last = null; continue; }

    if (pendingOr && last) {
      // Le terme précédent bascule dans le groupe OR (chaînes « a OR b OR c » acceptées).
      if (last.key !== 'any') {
        const arr = ast[last.key];
        const i = arr.lastIndexOf(last.value);
        if (i >= 0) arr.splice(i, 1);
        pushAny(last.anyForm);
      }
      pushAny(quoted ? `"${value}"` : value);
      last = { key: 'any' };
      pendingOr = false;
      continue;
    }
    pendingOr = false;
    if (quoted) { ast.exact.push(value); last = { key: 'exact', value, anyForm: `"${value}"` }; }
    else { ast.all.push(value); last = { key: 'all', value, anyForm: value }; }
  }
  return ast;
}

const q = (s) => (/\s/.test(s) ? `"${s}"` : s);
const group = (items) => (items.length > 1 ? `(${items.join(' OR ')})` : items[0]);

// Forme canonique : mots, "exacts", site:, -site:, -exclus, intitle, allintitle, inurl, intext, filetype, dates, langue, pays, puis OR.
export function serializeQuery(ast) {
  const a = { ...emptyAst(), ...ast };
  const parts = [];
  parts.push(...a.all);
  parts.push(...a.exact.map((s) => `"${s}"`));
  if (a.site.length) parts.push(group(a.site.map((s) => `site:${s}`)));
  parts.push(...a.notSite.map((s) => `-site:${s}`));
  parts.push(...a.none.map((s) => (/^[a-z]+:/.test(s) ? `-${s.replace(/:(.*\s.*)$/, ':"$1"')}` : `-${q(s)}`)));
  for (const k of ['intitle', 'allintitle', 'inurl', 'intext']) parts.push(...a[k].map((s) => `${k}:${q(s)}`));
  if (a.filetype.length) parts.push(group(a.filetype.map((s) => `filetype:${s}`)));
  if (a.after) parts.push(`after:${a.after}`);
  if (a.before) parts.push(`before:${a.before}`);
  if (a.lang) parts.push(`lang:${a.lang}`);
  if (a.region) parts.push(`region:${a.region}`);
  if (a.any.length) parts.push(a.any.join(' OR '));
  return parts.filter(Boolean).join(' ');
}

// Puces affichées dans l'en-tête des résultats.
export function astToChips(ast) {
  const chips = [];
  const add = (key, value, label) => chips.push({ key, value, label });
  for (const v of ast.exact) add('exact', v, `"${v}"`);
  for (const v of ast.site) add('site', v, `site:${v}`);
  for (const v of ast.notSite) add('notSite', v, `-site:${v}`);
  for (const v of ast.none) add('none', v, `-${v}`);
  for (const k of ['intitle', 'allintitle', 'inurl', 'intext']) for (const v of ast[k]) add(k, v, `${k}:${v}`);
  for (const v of ast.filetype) add('filetype', v, `filetype:${v}`);
  if (ast.after) add('after', ast.after, `après ${ast.after}`);
  if (ast.before) add('before', ast.before, `avant ${ast.before}`);
  if (ast.lang) add('lang', ast.lang, `langue ${ast.lang}`);
  if (ast.region) add('region', ast.region, `pays ${ast.region}`);
  if (ast.any.length) add('any', null, ast.any.join(' OU '));
  return chips;
}

export function removeChip(ast, key, value) {
  const next = structuredClone(ast);
  if (SCALAR_KEYS.includes(key)) next[key] = null;
  else if (key === 'any') next.any = [];
  else next[key] = next[key].filter((v) => v !== value);
  return next;
}

// Mots « plein texte » (pour surligner et filtrer localement).
export function plainTerms(ast) {
  return [...ast.all, ...ast.exact, ...ast.any.map(unquote), ...ast.intitle, ...ast.allintitle, ...ast.intext]
    .filter((t) => t && t !== '*');
}

// Domaine ou URL cible (pour Archives / Infra).
export function targetDomain(ast) {
  if (ast.site[0]) return ast.site[0].replace(/^\*\./, '');
  const cand = [...ast.all, ...ast.exact].find((t) => /^(https?:\/\/)?([a-z0-9-]+\.)+[a-z]{2,}(\/\S*)?$/i.test(t));
  if (!cand) return null;
  return cand.replace(/^https?:\/\//i, '').replace(/\/.*$/, '').toLowerCase();
}

export function targetUrl(ast) {
  const cand = [...ast.all, ...ast.exact, ...ast.site].find((t) => /^(https?:\/\/)?([a-z0-9-]+\.)+[a-z]{2,}(\/\S*)?$/i.test(t));
  return cand ? cand.replace(/^https?:\/\//i, '') : null;
}

// Motifs de recherche de secrets : avertissement (pas de modèle fourni).
const RISKY = [/intext:\s*"?password/i, /filetype:\s*(env|sql|bak|log)\b/i, /\.env\b/i, /index of\s*\/?\s*backup/i, /inurl:\s*admin/i, /intitle:\s*"?index of/i, /webcam|camera\s+live/i, /api[_-]?key/i];
export function riskyPattern(text) {
  return RISKY.some((r) => r.test(text));
}
