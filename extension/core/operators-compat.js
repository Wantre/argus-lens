// Table de compatibilité des opérateurs par moteur + traduction AST -> syntaxe native.
// Valeurs : true (natif), 'param' (passé en paramètre d'URL), false (ignoré : signalé à l'écran).
const FULL = { site: true, notSite: true, exact: true, none: true, any: true, inurl: true, intitle: true, allintitle: true, intext: true, filetype: true, dates: true, lang: 'param', region: 'param' };
const BASIC = { site: true, notSite: true, exact: true, none: true, any: true, inurl: false, intitle: false, allintitle: false, intext: false, filetype: false, dates: false, lang: false, region: false };

export const COMPAT = {
  google: FULL,
  bing: { ...FULL, inurl: false, allintitle: false, dates: false, lang: true, region: true, intext: true },
  ddg: { ...FULL, allintitle: false, intext: false, dates: false, lang: 'param', region: 'param' },
  yandex: { ...FULL, allintitle: false, intext: false, dates: true, lang: true, region: false },
  startpage: { ...BASIC, filetype: true, intitle: true, inurl: true },
  qwant: { ...BASIC, filetype: true },
  ecosia: { ...BASIC, filetype: true },
  brave: { ...BASIC, filetype: true, intitle: true, inurl: true, intext: true, lang: true, region: false },
  mojeek: { ...BASIC, any: false, intitle: false, inurl: false, notSite: false },
  marginalia: { ...BASIC, any: false, notSite: false },
  wiby: { site: false, notSite: false, exact: false, none: false, any: false, inurl: false, intitle: false, allintitle: false, intext: false, filetype: false, dates: false, lang: false, region: false },
  github: { ...BASIC, site: false, notSite: false, any: true },
  yahoo: { ...BASIC, filetype: true, intitle: true, inurl: true },
  baidu: { ...BASIC, any: false, filetype: true, intitle: true, inurl: true },
  naver: { ...BASIC, filetype: false },
  generic: BASIC,
};

export const OP_LABELS = {
  site: 'site:', notSite: '-site:', exact: '"mots exacts"', none: '-exclure', any: 'OR', inurl: 'inurl:',
  intitle: 'intitle:', allintitle: 'allintitle:', intext: 'intext:', filetype: 'filetype:', dates: 'before:/after:', lang: 'langue', region: 'pays',
};

const quote = (s) => (/\s/.test(s) ? `"${s}"` : s);
const grp = (arr) => (arr.length > 1 ? `(${arr.join(' OR ')})` : arr[0]);
const compact = (d) => d.replace(/-/g, '').padEnd(8, '0').replace(/0000$/, '0101').replace(/(\d{6})00$/, '$101');

// Renvoie { query, ignored:[clés], params:{lang,region,after,before} }
export function translate(engineId, ast) {
  const c = COMPAT[engineId] || COMPAT.generic;
  const out = [];
  const ignored = [];
  const use = (key, fn) => {
    const has = Array.isArray(ast[key]) ? ast[key].length : ast[key];
    if (!has) return;
    if (c[key]) fn(); else ignored.push(key);
  };
  out.push(...ast.all);
  if (ast.exact.length) { if (c.exact) out.push(...ast.exact.map((s) => `"${s}"`)); else { out.push(...ast.exact); ignored.push('exact'); } }
  use('site', () => out.push(grp(ast.site.map((s) => `site:${s}`))));
  use('notSite', () => out.push(...ast.notSite.map((s) => `-site:${s}`)));
  if (ast.none.length) {
    if (c.none) out.push(...ast.none.map((s) => (/^[a-z]+:/.test(s) ? `-${s}` : `-${quote(s)}`))); else ignored.push('none');
  }
  const ft = engineId === 'yandex' ? 'mime' : 'filetype';
  const it = engineId === 'yandex' ? 'title' : 'intitle';
  const tx = engineId === 'bing' ? 'inbody' : 'intext';
  use('intitle', () => out.push(...ast.intitle.map((s) => `${it}:${quote(s)}`)));
  use('allintitle', () => out.push(...ast.allintitle.map((s) => `allintitle:${quote(s)}`)));
  use('inurl', () => out.push(...ast.inurl.map((s) => `inurl:${quote(s)}`)));
  use('intext', () => out.push(...ast.intext.map((s) => `${tx}:${quote(s)}`)));
  use('filetype', () => out.push(grp(ast.filetype.map((s) => `${ft}:${s}`))));
  if (ast.after || ast.before) {
    if (!c.dates) ignored.push('dates');
    else if (engineId === 'yandex') {
      if (ast.after) out.push(`date:>${compact(ast.after)}`);
      if (ast.before) out.push(`date:<${compact(ast.before)}`);
    } else {
      if (ast.after) out.push(`after:${ast.after}`);
      if (ast.before) out.push(`before:${ast.before}`);
    }
  }
  if (ast.lang) { if (c.lang === true) out.push(engineId === 'bing' ? `language:${ast.lang}` : `lang:${ast.lang}`); else if (!c.lang) ignored.push('lang'); }
  if (ast.region) { if (c.region === true) out.push(`loc:${ast.region}`); else if (!c.region) ignored.push('region'); }
  if (ast.any.length) {
    if (c.any) out.push(ast.any.length > 1 && out.length ? `(${ast.any.join(' OR ')})` : ast.any.join(' OR '));
    else { out.push(...ast.any.map((s) => s.replace(/"/g, ''))); ignored.push('any'); }
  }
  return { query: out.filter(Boolean).join(' '), ignored, params: { lang: ast.lang, region: ast.region } };
}
