// É2 — Lens Results : méta-recherche progressive, liste fusionnée, filtres, vues, actions clavier.
import { h, iconButton, favicon, highlight, clear, announce, toast, copyText, prefersReducedMotion } from '../dom.js';
import { icon } from '../icons.js';
import { createSearchBar, MODES } from '../searchbar.js';
import { parseQuery, serializeQuery, astToChips, removeChip, plainTerms, targetDomain } from '../../core/query-parser.js';
import { mergeResults, sortResults, domainCounts, tldOf } from '../../core/merge.js';
import { FETCH_ENGINES, ENGINE_META } from '../../engines/fetch-engines.js';
import { TAB_ENGINES, buildTabUrl, ignoredFor } from '../../engines/tab-engines.js';
import { OP_LABELS } from '../../core/operators-compat.js';
import { enginesForMode, STATUS_LABEL } from '../../core/metasearch.js';
import { addHistory, logQuery, addEntry, listSpaces } from '../../core/store.js';
import { domainPivots } from '../../core/pivots.js';
import { formatParis, parisIso } from '../../core/time.js';
import { sha256Hex } from '../../core/evidence.js';
import { api } from '../../core/api.js';

const PAGE = 30;
const enc = encodeURIComponent;

export function toutVoirInfo() {
  const pop = h('div', { class: 'pop', role: 'dialog', 'aria-label': 'Ce que fait le mode Tout voir', hidden: true },
    h('h2', {}, 'Ce que fait « Tout voir »'),
    h('ul', {}, h('li', {}, 'Interroge en parallèle des index indépendants (Marginalia, Wiby, + Brave/Mojeek si clés).'), h('li', {}, 'Ajoute le petit web, les archives (Wayback, Common Crawl), les certificats (crt.sh), RDAP et le code public (GitHub).'), h('li', {}, 'Aucune personnalisation : pas de compte, pas de cookies de profil, rien de votre historique n’est envoyé.'), h('li', {}, 'Badge « Rare » quand un seul index indépendant a trouvé le résultat.')),
    h('h2', {}, 'Ce qu’il ne fait pas'),
    h('ul', {}, h('li', {}, 'Il n’existe aucun index complet du web : « plus d’index, moins de filtres », pas « tout ».'), h('li', {}, 'Aucun accès aux contenus privés (connexion, paywalls, réseaux privés, intranets).'), h('li', {}, 'Pas de Tor, I2P ni .onion.'), h('li', {}, 'Ne contourne aucun blocage : CAPTCHA, robots.txt, noindex, déréférencements, retraits DMCA, géoblocage.'), h('li', {}, 'Les petits index sont plus petits : moins d’actualité et de gros sites.'), h('li', {}, 'Les quotas gratuits saturent souvent : l’erreur est affichée, jamais masquée.'), h('li', {}, 'Google, Bing, DuckDuckGo et Yandex ne sont pas fusionnés : ils s’ouvrent en onglet.')));
  const btn = h('button', { type: 'button', class: 'btn ghost sm', 'aria-expanded': 'false', onclick: () => { pop.hidden = !pop.hidden; btn.setAttribute('aria-expanded', String(!pop.hidden)); } }, icon('info', 16), 'Tout voir : limites');
  const wrap = h('div', { class: 'info-pop' }, btn, pop);
  wrap.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !pop.hidden) { e.stopPropagation(); pop.hidden = true; btn.setAttribute('aria-expanded', 'false'); btn.focus(); } });
  document.addEventListener('click', (e) => { if (!wrap.contains(e.target)) { pop.hidden = true; btn.setAttribute('aria-expanded', 'false'); } });
  return wrap;
}

export function renderResults(root, params, ctx) {
  const q = params.q || '';
  const mode = MODES.some((m) => m.id === params.mode) ? params.mode : 'web';
  const ast = parseQuery(q);
  const terms = plainTerms(ast);
  const target = targetDomain(ast);
  const settings = ctx.settings;
  const weights = Object.fromEntries(Object.entries(settings.engines).map(([k, v]) => [k, v.weight ?? 1]));
  const engines = enginesForMode(mode, FETCH_ENGINES, settings, !!target);
  const keyEngines = FETCH_ENGINES.filter((e) => e.meta.needsKey && e.meta.modes.includes(mode) && !settings.engines[e.meta.id]?.enabled);
  const state = { raw: {}, status: {}, merged: [], shown: PAGE, view: 'list', sort: 'relevance', lens: 0, active: -1, filters: { engines: new Set(), tld: '', ft: '', rare: false, hideDominant: settings.hideDominant, after: ast.after || '', before: ast.before || '' }, done: false, archived: new Set() };

  // En-tête collant
  const bar = createSearchBar({ value: q, mode, compact: true, sources: ctx.sources, onSubmit: (t, m) => ctx.runSearch(t, m), onBuilder: (t) => ctx.openBuilder(t), onModeChange: (m) => ctx.navigate(`#/r?q=${enc(q)}&mode=${m}`) });
  const chipsRow = h('div', { class: 'chips', role: 'list', 'aria-label': 'Opérateurs actifs' }, astToChips(ast).map((c) => h('span', { class: 'op-chip', role: 'listitem' }, c.label,
    h('button', { type: 'button', 'aria-label': `Retirer ${c.label}`, onclick: () => ctx.navigate(`#/r?q=${enc(serializeQuery(removeChip(ast, c.key, c.value)))}&mode=${mode}`) }, icon('x', 13)))));
  const pills = new Map();
  const engineBar = h('div', { class: 'engine-bar', role: 'status', 'aria-live': 'polite', 'aria-label': 'État des moteurs' });
  for (const e of engines) { const p = pill(e.meta, 'loading'); pills.set(e.meta.id, p); engineBar.append(p.el); }
  for (const e of keyEngines) engineBar.append(pill(e.meta, 'no_key', 'clé à saisir').el);
  if (!engines.length) engineBar.append(h('span', { class: 'muted' }, mode === 'archives' || mode === 'infra' ? 'Ce mode demande un domaine ou une URL (ex. example.com).' : 'Aucun moteur actif pour ce mode : voir Paramètres.'));

  const viewSeg = h('div', { class: 'seg', role: 'group', 'aria-label': 'Vue' }, [['list', 'Liste', 'list'], ['grid', 'Grille', 'grid'], ['domains', 'Domaines', 'domain'], ['sources', 'Carte des sources', 'upset']].map(([id, label, ic]) =>
    h('button', { type: 'button', 'aria-pressed': String(id === state.view), dataset: { v: id }, onclick: (e) => { state.view = id; [...viewSeg.children].forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.v === id))); draw(); } }, icon(ic, 15), h('span', { class: 'seg-lbl' }, label))));
  const sortSel = h('select', { class: 'input sort', 'aria-label': 'Trier par', onchange: (e) => { state.sort = e.target.value; draw(); } },
    h('option', { value: 'relevance' }, 'Pertinence fusionnée'), h('option', { value: 'rarity' }, 'Rareté'), h('option', { value: 'date' }, 'Date'), h('option', { value: 'domain' }, 'Domaine'));
  const countEl = h('p', { class: 'res-count tnum', id: 'res-count' }, 'Recherche en cours…');
  const head = h('header', { class: 'res-head' },
    h('div', { class: 'res-head-in' }, h('h1', { class: 'sr-only' }, `Résultats pour « ${q} »`), bar.el,
      chipsRow.children.length ? chipsRow : null,
      engineBar,
      h('div', { class: 'res-tools' }, countEl, h('div', { class: 'row' }, mode === 'tout' ? toutVoirInfo() : null, viewSeg, sortSel,
        h('button', { type: 'button', class: 'btn sm', onclick: burst, title: 'Ouvrir la requête sur plusieurs moteurs dans un groupe d’onglets' }, icon('zap', 15), 'Lancer en rafale')))));

  // Pagination : demande la page suivante aux sources paginées qui ont encore des résultats.
  const moreBtn = h('button', { type: 'button', class: 'btn', hidden: true, onclick: () => {
    if (!port || state.loadingMore) return;
    state.loadingMore = true; moreBtn.disabled = true; moreBtn.textContent = 'Chargement de la page suivante…';
    port.postMessage({ type: 'more', page: (state.page || 1) + 1 });
  } }, 'Plus de résultats (page suivante sur chaque source)');
  const list = h('div', { class: 'results-list', id: 'results', 'aria-labelledby': 'res-count' });
  const sentinel = h('div', { class: 'sentinel', 'aria-hidden': 'true' });
  const side = sideColumn();
  root.append(head, h('div', { class: 'res-body' }, h('section', { class: 'res-main', 'aria-label': 'Résultats' }, list, sentinel, h('div', { class: 'row', style: { justifyContent: 'center', margin: '16px 0' } }, moreBtn)), side.el));
  for (let i = 0; i < 4; i++) list.append(h('div', { class: 'skeleton', 'aria-hidden': 'true' }));

  const io = new IntersectionObserver((en) => { if (en[0].isIntersecting && state.shown < filtered().length) { state.shown += PAGE; draw(); } }, { rootMargin: '400px' });
  io.observe(sentinel);

  // Connexion au service worker (streaming par runtime.Port)
  let port = null;
  if (engines.length && api?.runtime?.connect) {
    port = api.runtime.connect({ name: 'lens-search' });
    port.onMessage.addListener(onEvent);
    port.postMessage({ type: 'search', ast, engines: engines.map((e) => e.meta.id), ephemeral: settings.ephemeral });
  } else {
    state.done = true;
    draw();
  }

  function onEvent(ev) {
    if (ev.type === 'engine' || ev.type === 'results') {
      state.status[ev.id] = ev;
      pills.get(ev.id)?.set(ev.status, ev);
    }
    if (ev.type === 'results') {
      state.raw[ev.id] = ev.results;
      state.merged = mergeResults(state.raw, { weights });
      draw(ev.id);
    }
    if (ev.type === 'done') { state.page = ev.page || state.page || 1; state.loadingMore = false; if (state.done) { draw(); updateMore(); } else finish(ev.summary); }
  }

  function updateMore() {
    const can = state.done && port && (state.page || 1) < 8 && Object.values(state.status).some((s) => s.type === 'results' && s.results?.length);
    moreBtn.hidden = !can; moreBtn.disabled = false; moreBtn.textContent = `Plus de résultats (page ${(state.page || 1) + 1} sur chaque source)`;
  }

  async function finish(summary) {
    state.done = true;
    draw();
    updateMore();
    const count = state.merged.length;
    const okEngines = Object.entries(summary).filter(([, s]) => s.status === 'ok').map(([id]) => ENGINE_META[id]?.name || id);
    announce(`${count} résultat${count > 1 ? 's' : ''} fusionné${count > 1 ? 's' : ''}, ${okEngines.length} moteur${okEngines.length > 1 ? 's' : ''} sur ${engines.length} ont répondu`);
    const domains = domainCounts(state.merged).slice(0, 8).map(([d]) => d);
    await addHistory({ q, mode, count, domains }, settings).catch(() => {});
    if (settings.activeSpace && !settings.ephemeral) {
      await logQuery(settings.activeSpace, {
        query: q, mode, count,
        engines: Object.entries(summary).map(([id, s]) => `${ENGINE_META[id]?.short || id} ${STATUS_LABEL[s.status] || s.status}${s.count ? ` (${s.count})` : ''}`).join(', '),
        errors: Object.entries(summary).filter(([, s]) => s.error).map(([id, s]) => `${id}: ${s.error}`).join(' ; '),
        decision: count ? '' : 'Résultat négatif (absence de résultat ≠ preuve d’absence)',
      }).catch(() => {});
    }
  }

  function filtered() {
    const f = state.filters;
    const dom = settings.dominant || [];
    let items = state.merged.filter((i) => {
      if (f.engines.size && !i.engines.some((e) => f.engines.has(e))) return false;
      if (f.tld && tldOf(i.url) !== f.tld) return false;
      if (f.ft && !new RegExp(`\\.${f.ft}($|[?#])`, 'i').test(i.url)) return false;
      if (f.rare && !i.rare) return false;
      if (f.hideDominant && dom.some((d) => i.domain === d || i.domain.endsWith(`.${d}`))) return false;
      if (f.after && i.date && i.date < f.after) return false;
      if (f.before && i.date && i.date > f.before) return false;
      return true;
    });
    items = sortResults(items, state.sort, state.lens, dom);
    return items;
  }

  function card(item, i, animate) {
    const el = h('article', { class: `result${animate ? ' anim' : ''}`, style: { '--i': Math.min(i, 10) }, dataset: { key: item.key }, 'aria-labelledby': `t-${i}` },
      h('div', { class: 'r-head' }, favicon(item.url, 16),
        h('div', { class: 'r-url' }, h('b', {}, item.domain), item.url.replace(/^https?:\/\/(www\.)?[^/]+/, '').slice(0, 80))),
      h('a', { class: 'r-title', id: `t-${i}`, href: item.url, rel: 'noreferrer noopener', target: '_blank' }, highlight(item.title, terms)),
      item.snippet ? h('p', { class: 'r-snippet' }, highlight(item.snippet, terms)) : null,
      h('div', { class: 'r-meta' },
        item.engines.map((e) => h('span', { class: 'badge eng', style: { '--c': ENGINE_META[e]?.color || '#888' }, title: `Trouvé par ${ENGINE_META[e]?.name || e} (rang ${item.ranks[e]})` }, ENGINE_META[e]?.short || e)),
        item.rare ? h('span', { class: 'badge rare', title: 'Trouvé par un seul index indépendant' }, 'Rare') : null,
        state.archived.has(item.key) || item.engines.includes('wayback') ? h('span', { class: 'badge arch' }, 'Archivé') : null,
        item.date ? h('span', { class: 'badge tnum' }, item.date) : null,
        h('div', { class: 'r-actions' },
          iconButton('eye', 'Aperçu (p)', { class: 'sm', onclick: () => preview(item) }),
          iconButton('archive', 'Archives (a)', { class: 'sm', onclick: () => ctx.navigate(`#/archive?u=${enc(item.url)}`) }),
          iconButton('globe', `Pivots du domaine ${item.domain}`, { class: 'sm', onclick: () => ctx.navigate(`#/pivot?type=domain&v=${enc(item.domain)}`) }),
          iconButton('bookmark', 'Ajouter au Space (s)', { class: 'sm', onclick: () => saveToSpace(item) }),
          iconButton('hash', 'Enregistrer comme preuve (métadonnées hachées)', { class: 'sm', onclick: () => saveEvidence(item) }),
          iconButton('quote', 'Copier en citation', { class: 'sm', onclick: () => copyText(citation(item)) }))));
    el.addEventListener('click', (e) => { if (!e.target.closest('a,button')) setActive([...list.querySelectorAll('.result')].indexOf(el)); });
    return el;
  }

  function draw(stampEngine) {
    const items = filtered();
    side.update(items);
    const total = state.merged.length;
    const answered = Object.values(state.status).filter((s) => s.type === 'results').length;
    countEl.textContent = state.done
      ? `${items.length} résultat${items.length > 1 ? 's' : ''}${items.length !== total ? ` (sur ${total})` : ''} · ${answered}/${engines.length} moteur${engines.length > 1 ? 's' : ''}`
      : `${total} résultat${total > 1 ? 's' : ''} · ${answered}/${engines.length} moteur${engines.length > 1 ? 's' : ''} ont répondu…`;
    if (!items.length) {
      if (!state.done) return;
      clear(list).append(emptyState());
      return;
    }
    list.className = `results-list${state.view === 'grid' ? ' grid' : ''}`;
    if (state.view === 'domains') { drawDomains(items); return; }
    if (state.view === 'sources') { drawSources(items); return; }
    const before = new Map([...list.querySelectorAll('.result')].map((el) => [el.dataset.key, el.getBoundingClientRect().top]));
    const firstRender = !before.size;
    const nodes = items.slice(0, state.shown).map((it, i) => {
      const old = list.querySelector(`.result[data-key="${CSS.escape(it.key)}"]`);
      const fresh = card(it, i, firstRender || !old ? !prefersReducedMotion() : false);
      if (old && stampEngine && it.engines.includes(stampEngine) && it.engines.length > 1) fresh.querySelectorAll('.badge.eng')[it.engines.indexOf(stampEngine)]?.classList.add('stamp');
      return fresh;
    });
    clear(list).append(...nodes);
    if (!prefersReducedMotion() && before.size) {
      for (const el of nodes) {
        const top = before.get(el.dataset.key);
        if (top == null) continue;
        const dy = top - el.getBoundingClientRect().top;
        if (Math.abs(dy) > 2) el.animate([{ transform: `translateY(${dy}px)` }, { transform: 'none' }], { duration: 260, easing: 'cubic-bezier(.22,1,.36,1)' });
      }
    }
    if (state.active >= 0) setActive(Math.min(state.active, nodes.length - 1), false);
  }

  function drawDomains(items) {
    const groups = new Map();
    for (const it of items) { if (!groups.has(it.domain)) groups.set(it.domain, []); groups.get(it.domain).push(it); }
    clear(list).append(...[...groups.entries()].sort((a, b) => b[1].length - a[1].length).map(([d, arr], gi) =>
      h('details', { class: 'domain-group', open: gi < 3 }, h('summary', {}, favicon(d, 16), d, h('span', { class: 'badge tnum' }, arr.length), h('span', { class: 'muted', style: { marginLeft: 'auto', fontWeight: 500 } }, 'filtrer site:'),
        h('button', { type: 'button', class: 'btn sm', onclick: (e) => { e.preventDefault(); ctx.navigate(`#/r?q=${enc(`${q} site:${d}`)}&mode=${mode}`); } }, `site:${d}`)),
      h('div', { class: 'results-list' }, arr.map((it, i) => card(it, i, false))))));
  }

  function drawSources(items) {
    const combos = new Map();
    for (const it of items) { const k = [...it.engines].sort().join('+'); combos.set(k, (combos.get(k) || 0) + 1); }
    const per = new Map();
    for (const it of items) for (const e of it.engines) per.set(e, (per.get(e) || 0) + 1);
    const max = Math.max(...combos.values(), 1);
    const ids = [...per.keys()];
    clear(list).append(h('div', { class: 'card sources-map' },
      h('h2', {}, icon('upset'), 'Qui a trouvé quoi'),
      h('p', { class: 'muted' }, 'Chaque ligne est une combinaison de moteurs (diagramme de type UpSet). Les combinaisons à un seul index indépendant correspondent aux résultats « Rares ».'),
      h('table', { class: 'table upset' }, h('thead', {}, h('tr', {}, ids.map((id) => h('th', { scope: 'col', title: ENGINE_META[id]?.name }, ENGINE_META[id]?.short || id)), h('th', { scope: 'col' }, 'Résultats'))),
        h('tbody', {}, [...combos.entries()].sort((a, b) => b[1] - a[1]).map(([k, n]) => {
          const set = new Set(k.split('+'));
          return h('tr', {}, ids.map((id) => h('td', { class: 'dotcell' }, h('span', { class: `udot${set.has(id) ? ' on' : ''}`, style: { '--c': ENGINE_META[id]?.color }, role: 'img', 'aria-label': set.has(id) ? `${ENGINE_META[id]?.name} : oui` : `${ENGINE_META[id]?.name} : non` }))),
            h('td', {}, h('div', { class: 'ubar' }, h('span', { style: { width: `${(n / max) * 100}%` } }), h('b', { class: 'tnum' }, n))));
        }))),
      h('h2', { style: { marginTop: '18px' } }, 'Total par moteur'),
      h('div', { class: 'chips' }, ids.map((id) => h('span', { class: 'badge eng', style: { '--c': ENGINE_META[id]?.color } }, `${ENGINE_META[id]?.name} · ${per.get(id)}`)))));
  }

  function emptyState() {
    const errors = Object.values(state.status).filter((s) => ['limited', 'down', 'blocked', 'paused'].includes(s.status));
    return h('div', { class: 'empty' }, icon('search', 28),
      h('h2', {}, 'Aucun résultat dans ces index.'),
      h('p', {}, 'Une absence de résultat n’est pas une preuve d’absence.', errors.length ? ` ${errors.length} moteur${errors.length > 1 ? 's' : ''} n’a pas pu répondre (quota, blocage anti-robot ou panne) : réessayez plus tard.` : ''),
      h('p', { style: { marginTop: '12px' } }, 'Essayez : retirer un opérateur, passer en mode « Tout voir », ou ouvrir la même requête sur un grand moteur.'),
      h('div', { class: 'row', style: { justifyContent: 'center', marginTop: '16px' } },
        h('button', { type: 'button', class: 'btn', onclick: () => ctx.navigate(`#/r?q=${enc(q)}&mode=tout`) }, 'Mode Tout voir'),
        ['google', 'bing', 'ddg'].map((id) => h('a', { class: 'btn', href: buildTabUrl(id, ast, target), target: '_blank', rel: 'noreferrer' }, `Ouvrir sur ${TAB_ENGINES.find((t) => t.id === id).name}`))));
  }

  function sideColumn() {
    const cloud = h('div', { class: 'cloud' });
    const engineChecks = h('div', { class: 'stack', style: { gap: '2px' } });
    const tldSel = h('select', { class: 'input', 'aria-label': 'Filtrer par extension de domaine', onchange: (e) => { state.filters.tld = e.target.value; draw(); } });
    const ftSel = h('select', { class: 'input', 'aria-label': 'Filtrer par type de fichier', onchange: (e) => { state.filters.ft = e.target.value; draw(); } }, h('option', { value: '' }, 'Tous types'), ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'csv', 'txt', 'html'].map((f) => h('option', { value: f }, f)));
    const lens = h('input', { type: 'range', min: '0', max: '100', value: '0', 'aria-label': 'Lentille de rareté : grand public à profondeurs', 'aria-valuetext': 'Grand public',
      oninput: (e) => { state.lens = +e.target.value / 100; e.target.setAttribute('aria-valuetext', state.lens < 0.34 ? 'Grand public' : state.lens < 0.67 ? 'Équilibré' : 'Profondeurs'); lensIcon.classList.remove('focusing'); void lensIcon.offsetWidth; lensIcon.classList.add('focusing'); draw(); } });
    const lensIcon = h('span', { class: 'lens-icon logo-hero' }, icon('focus', 18));
    const check = (label, key) => h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: !!state.filters[key], onchange: (e) => { state.filters[key] = e.target.checked; draw(); } }), label);
    const dateIn = (key, label) => h('label', { class: 'field' }, h('span', { class: 'hint' }, label), h('input', { type: 'date', class: 'input', value: state.filters[key], onchange: (e) => { state.filters[key] = e.target.value; draw(); } }));
    const elsewhere = h('div', { class: 'stack', style: { gap: '6px' } }, TAB_ENGINES.filter((t) => ['google', 'bing', 'ddg', 'yandex', 'startpage', 'qwant', 'mojeek-web', 'brave-web', 'marginalia-web'].includes(t.id)).map((t) => {
      const ign = ignoredFor(t.id, ast);
      return h('a', { class: 'elsewhere', href: buildTabUrl(t.id, ast, target), target: '_blank', rel: 'noreferrer' }, h('span', { class: 'dot', style: { background: t.color } }), h('span', {}, `Ouvrir sur ${t.name}`), ign.length ? h('span', { class: 'ignored', title: `Opérateurs ignorés par ${t.name}` }, `ignore ${ign.map((k) => OP_LABELS[k]).join(', ')}`) : null, icon('external', 14));
    }));
    const pivots = target ? h('div', { class: 'card' }, h('h2', {}, `Pivots · ${target}`), h('div', { class: 'stack', style: { gap: '4px' } }, domainPivots(target).map((p) => p.kind === 'tab' ? h('a', { class: 'elsewhere', href: p.url, target: '_blank', rel: 'noreferrer' }, p.label, icon('external', 14)) : h('a', { class: 'elsewhere', href: p.route }, p.label, icon('chevron', 14))))) : null;
    const el = h('aside', { class: 'res-side side-col', 'aria-label': 'Filtres et outils' },
      h('div', { class: 'card' }, h('h2', {}, 'Lentille de rareté'), h('div', { class: 'lens-slider' }, h('div', { class: 'row', style: { gap: '8px', flexWrap: 'nowrap' } }, lensIcon, lens), h('div', { class: 'ends' }, h('span', {}, 'Grand public'), h('span', {}, 'Profondeurs')))),
      h('div', { class: 'card stack' }, h('h2', {}, 'Filtres'), engineChecks, check('Rares seulement', 'rare'), check('Masquer les domaines dominants', 'hideDominant'),
        h('div', { class: 'grid-2', style: { gap: '8px' } }, tldSel, ftSel), h('div', { class: 'grid-2', style: { gap: '8px' } }, dateIn('after', 'Après le'), dateIn('before', 'Avant le')),
        h('p', { class: 'hint muted', style: { fontSize: '12px' } }, 'Filtres de date appliqués aux résultats datés uniquement.')),
      h('div', { class: 'card' }, h('h2', {}, 'Nuage de domaines'), cloud),
      h('div', { class: 'card' }, h('h2', {}, 'Même requête ailleurs'), elsewhere),
      pivots);
    let lastEngines = '';
    return {
      el,
      update(items) {
        const all = state.merged;
        const ids = [...new Set(all.flatMap((i) => i.engines))];
        if (ids.join() !== lastEngines) {
          lastEngines = ids.join();
          clear(engineChecks).append(...ids.map((id) => h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: state.filters.engines.has(id), onchange: (e) => { if (e.target.checked) state.filters.engines.add(id); else state.filters.engines.delete(id); draw(); } }), h('span', { class: 'badge eng', style: { '--c': ENGINE_META[id]?.color } }, ENGINE_META[id]?.short), ENGINE_META[id]?.name)));
          const tlds = [...new Set(all.map((i) => tldOf(i.url)).filter(Boolean))].sort();
          clear(tldSel).append(h('option', { value: '' }, 'Tous les TLD'), ...tlds.map((t) => h('option', { value: t, selected: t === state.filters.tld }, `.${t}`)));
        }
        const counts = domainCounts(items).slice(0, 24);
        const max = counts[0]?.[1] || 1;
        clear(cloud).append(...(counts.length ? counts.map(([d, n]) => h('button', { type: 'button', style: { fontSize: `${12 + Math.round((n / max) * 8)}px` }, title: `${n} résultat(s) — filtrer site:${d}`, onclick: () => ctx.navigate(`#/r?q=${enc(`${q} site:${d}`)}&mode=${mode}`) }, d)) : [h('span', { class: 'muted' }, '—')]));
      },
    };
  }

  function pill(meta, status, msg) {
    const st = h('span', { class: 'st' }, msg || STATUS_LABEL[status]);
    const el = h('span', { class: `pill ${status === 'empty' ? 'is-empty' : status}`, style: { '--c': meta.color }, title: meta.name }, h('span', { class: 'dot' }), meta.short, h('span', { class: 'sr-only' }, meta.name), st);
    return {
      el,
      set(s, ev = {}) {
        el.className = `pill ${s === 'empty' ? 'is-empty' : s}`;
        const label = s === 'ok' ? `${ev.results?.length ?? 0}${ev.page > 1 ? ` · ${ev.page} p.` : ''}${ev.cached ? ' (cache)' : ''}` : s === 'limited' ? `limité ${ev.http || ''}` : s === 'down' ? (ev.http ? `HTTP ${ev.http}` : 'hors service') : s === 'blocked' ? 'bloqué' : s === 'paused' ? 'en pause' : STATUS_LABEL[s];
        st.textContent = `${label}${ev.ms != null && s !== 'loading' ? ` · ${ev.ms} ms` : ''}`;
        el.title = `${meta.name} : ${ev.message || STATUS_LABEL[s]}${ev.removed ? ` · ${ev.removed} filtré(s) localement (${ev.applied.join(', ')})` : ''}`;
        if (ev.removed) st.textContent += ' · filtré';
      },
    };
  }

  function citation(item) {
    return `${item.title} — ${item.url} (consulté le ${formatParis(new Date())}, heure de Paris ; trouvé via ${item.engines.map((e) => ENGINE_META[e]?.name || e).join(', ')})`;
  }

  async function pickSpace() {
    if (settings.activeSpace) return settings.activeSpace;
    const spaces = await listSpaces();
    if (spaces[0]) { await ctx.update({ activeSpace: spaces[0].id }); toast(`Space actif : ${spaces[0].name}`); return spaces[0].id; }
    toast('Créez d’abord un Space (Enquête)', { kind: 'error', action: { label: 'Créer', run: () => ctx.openSpaceDialog() } });
    return null;
  }

  async function saveToSpace(item) {
    if (settings.ephemeral) { toast('Mode éphémère : rien n’est enregistré', { kind: 'error' }); return; }
    const spaceId = await pickSpace();
    if (!spaceId) return;
    await addEntry({ spaceId, type: 'result', url: item.url, title: item.title, snippet: item.snippet, domain: item.domain, engines: item.engines, query: q });
    toast('Résultat ajouté au Space', { kind: 'success' });
    ctx.refreshSidebar();
  }

  async function saveEvidence(item) {
    if (settings.ephemeral) { toast('Mode éphémère : rien n’est enregistré', { kind: 'error' }); return; }
    const spaceId = await pickSpace();
    if (!spaceId) return;
    const record = { url: item.url, title: item.title, snippet: item.snippet, engines: item.engines, query: q };
    const canonical = JSON.stringify(record);
    await addEntry({ spaceId, type: 'evidence', originalUrl: item.url, finalUrl: item.url, title: item.title, collectedAt: parisIso(), method: 'Métadonnées du résultat de recherche (JSON canonique)', sha256: await sha256Hex(canonical), size: canonical.length, kind: 'transformé', label: 'observation', mime: 'application/json', payload: canonical });
    toast('Preuve enregistrée (métadonnées hachées SHA-256). Pour une capture d’écran : popup ou panneau latéral.', { kind: 'success' });
  }

  async function preview(item) {
    (await import('../preview.js')).openPreview(item, terms);
  }

  async function burst() {
    const ids = settings.burstEngines?.length ? settings.burstEngines : ['google', 'bing', 'ddg', 'yandex', 'startpage'];
    const urls = ids.map((id) => buildTabUrl(id, ast, target)).filter(Boolean);
    if (urls.length > (settings.burstMax || 5) && !confirm(`Ouvrir ${urls.length} onglets ?`)) return;
    const res = await api.runtime.sendMessage({ type: 'burst', urls, title: q.slice(0, 40) });
    toast(res?.ok ? `${urls.length} onglets ouverts dans le groupe « ${q.slice(0, 24)} »` : 'Ouverture en rafale impossible', { kind: res?.ok ? 'success' : 'error' });
  }

  function setActive(i, scroll = true) {
    const cards = [...list.querySelectorAll('.result')];
    cards.forEach((c) => c.classList.remove('kb-active'));
    state.active = Math.max(-1, Math.min(i, cards.length - 1));
    const c = cards[state.active];
    if (c) { c.classList.add('kb-active'); if (scroll) c.scrollIntoView({ block: 'nearest', behavior: prefersReducedMotion() ? 'auto' : 'smooth' }); c.querySelector('.r-title')?.focus({ preventScroll: true }); }
  }

  function activeItem() {
    const c = list.querySelectorAll('.result')[state.active];
    return c ? state.merged.find((m) => m.key === c.dataset.key) : null;
  }

  return {
    destroy() { port?.disconnect(); io.disconnect(); },
    setMode(n) { const m = +n === 7 ? null : MODES[+n > 7 ? +n - 2 : +n - 1]; if (m) ctx.navigate(`#/r?q=${enc(q)}&mode=${m.id}`); },
    onKey(e) {
      const it = activeItem();
      if (e.key === 'j') { e.preventDefault(); setActive(state.active + 1); }
      else if (e.key === 'k') { e.preventDefault(); setActive(state.active - 1); }
      else if (e.key === 'o' && it) { e.preventDefault(); api.tabs.create({ url: it.url, active: true }); }
      else if (e.key === 'O' && it) { e.preventDefault(); api.tabs.create({ url: it.url, active: false }); toast('Ouvert en arrière-plan'); }
      else if (e.key === 'p' && it) { e.preventDefault(); preview(it); }
      else if (e.key === 's' && it) { e.preventDefault(); saveToSpace(it); }
      else if (e.key === 'a' && it) { e.preventDefault(); ctx.navigate(`#/archive?u=${enc(it.url)}`); }
      else if (e.key === 'e') { e.preventDefault(); exportCurrent(); }
      else if (e.key === 'Escape') { setActive(-1); bar.focus(); }
    },
  };

  async function exportCurrent() {
    const { toCSV, download } = await import('../../core/export.js');
    const rows = filtered().map((i) => ({ titre: i.title, url: i.url, domaine: i.domain, moteurs: i.engines.join(' '), rare: i.rare ? 'oui' : '', date: i.date || '', extrait: i.snippet }));
    download(`argus-lens-${parisIso().slice(0, 16).replace(/[:T]/g, '-')}.csv`, toCSV(rows), 'text/csv');
    toast('Résultats exportés en CSV', { kind: 'success' });
  }
}
