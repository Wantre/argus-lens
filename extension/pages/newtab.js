// ARGUS Lens — page principale (accueil + routes). Modules secondaires chargés à la demande.
import { getSettings, setSettings, onSettings, listHistory, listSpaces } from '../core/store.js';
import { applySettingsToDom, switchTheme, resolveTheme } from '../ui/theme.js';
import { renderSidebar } from '../ui/sidebar.js';
import { renderHome } from '../ui/views/home.js';
import { $, prefersReducedMotion, toast } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { api } from '../core/api.js';

const view = $('#view');
const shell = $('#shell');
let current = null;

const ctx = {
  settings: null,
  sources: {
    history: async () => (await listHistory()).slice(0, 50),
    spaces: () => listSpaces(),
    domains: async () => [...new Set((await listHistory()).flatMap((x) => x.domains || []))].slice(0, 30),
  },
  navigate(hash) { if (location.hash === hash) route(); else location.hash = hash; },
  async update(patch) { ctx.settings = await setSettings(patch); applySettingsToDom(ctx.settings); return ctx.settings; },
  runSearch(text, mode = 'web') {
    const t = text.trim();
    const [cmd, ...rest] = t.split(/\s+/);
    const arg = rest.join(' ');
    const enc = encodeURIComponent;
    switch (cmd.toLowerCase()) {
      case '/wayback': return ctx.navigate(`#/archive?u=${enc(arg)}`);
      case '/cc': return ctx.navigate(`#/archive?u=${enc(arg)}&cc=1`);
      case '/crt': case '/rdap': return ctx.navigate(`#/r?q=${enc(arg)}&mode=infra`);
      case '/gh': return ctx.navigate(`#/r?q=${enc(arg)}&mode=code`);
      case '/pseudo': return ctx.navigate(`#/pivot?type=pseudo&v=${enc(arg)}`);
      case '/image': return ctx.navigate(`#/image?u=${enc(arg)}`);
      case '/space': return ctx.openSpaceDialog({ name: arg });
      default: return ctx.navigate(`#/r?q=${enc(t)}&mode=${mode}`);
    }
  },
  async openBuilder(text, onApply) { (await import('../ui/builder.js')).openBuilder(text, onApply || ((q) => ctx.runSearch(q, 'web')), ctx); },
  async openPalette() { (await import('../ui/palette.js')).openPalette(ctx); },
  async openSpaceDialog(preset) { (await import('../ui/space-dialog.js')).openSpaceDialog(ctx, preset); },
  async openHelp() { (await import('../ui/palette.js')).openHelp(); },
  refreshSidebar: () => renderSidebar($('#sidebar'), ctx),
  toggleFocus() { document.body.classList.toggle('focus-mode'); particles(); toast(document.body.classList.contains('focus-mode') ? 'Mode Focus activé (F pour quitter)' : 'Mode Focus désactivé'); },
  cycleTheme(origin) {
    const order = ['nacre', 'amethyste', 'nuit'];
    const cur = resolveTheme(ctx.settings.theme);
    const next = order[(order.indexOf(cur) + 1) % order.length];
    switchTheme(() => { ctx.settings.theme = next; applySettingsToDom(ctx.settings); particles(); }, origin);
    setSettings({ theme: next });
    toast(`Thème : ${{ nacre: 'Nacre', amethyste: 'Améthyste', nuit: "Nuit d'Argus" }[next]}`);
  },
};

// Fond à particules : uniquement thème Nuit d'Argus, hors mode Focus et hors mouvement réduit. Chargé au repos.
let particleMod = null;
async function particles() {
  const want = document.documentElement.dataset.theme === 'nuit' && !document.body.classList.contains('focus-mode') && !prefersReducedMotion();
  if (!want && !particleMod) return;
  particleMod = particleMod || (await import('../ui/particles.js'));
  particleMod.setParticles($('#particles'), want);
}

const ROUTES = {
  '': () => renderHome,
  r: async () => (await import('../ui/views/results.js')).renderResults,
  space: async () => (await import('../ui/views/spaces.js')).renderSpace,
  spaces: async () => (await import('../ui/views/spaces.js')).renderSpaces,
  history: async () => (await import('../ui/views/history.js')).renderHistory,
  archive: async () => (await import('../ui/views/archive.js')).renderArchive,
  graph: async () => (await import('../ui/views/graph.js')).renderGraph,
  export: async () => (await import('../ui/views/export.js')).renderExport,
  toolbox: async () => (await import('../ui/views/toolbox.js')).renderToolbox,
  pivot: async () => (await import('../ui/views/pivot.js')).renderPivot,
  image: async () => (await import('../ui/views/pivot.js')).renderImage,
};

async function route() {
  const raw = location.hash.replace(/^#\/?/, '');
  const [path, query = ''] = raw.split('?');
  const [name, ...rest] = path.split('/');
  const params = Object.fromEntries(new URLSearchParams(query));
  if (rest.length) params.id = decodeURIComponent(rest.join('/'));
  const loader = ROUTES[name] || ROUTES[''];
  current?.destroy?.();
  const render = await loader();
  document.body.className = document.body.className.replace(/\broute-\S+/g, '').trim();
  document.body.classList.add(`route-${name || 'home'}`);
  view.replaceChildren();
  current = (await render(view, params, ctx)) || null;
  ctx.refreshSidebar();
  if (name && name !== 'r') view.focus({ preventScroll: true });
}

function shortcuts(e) {
  const tag = e.target.tagName;
  const typing = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || e.target.isContentEditable;
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); ctx.openPalette(); return; }
  if (document.querySelector('.palette, .drawer, [role="dialog"]')) return;
  if (typing) return;
  if (e.altKey && /^[1-9]$/.test(e.key)) { e.preventDefault(); current?.setMode?.(e.key); return; }
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  if (e.key === '/') { e.preventDefault(); const inp = $('.search-input'); inp?.focus(); inp?.select(); return; }
  if (e.key === '?') { e.preventDefault(); ctx.openHelp(); return; }
  if (e.key.toLowerCase() === 'f' && !e.shiftKey) { e.preventDefault(); ctx.toggleFocus(); return; }
  if (e.key === 'g') { ctx.navigate('#/graph'); return; }
  current?.onKey?.(e);
}

function mobileMenu() {
  const btn = $('#mobile-menu');
  btn.append(icon('menu', 20));
  btn.addEventListener('click', () => { const open = shell.classList.toggle('mobile-open'); btn.setAttribute('aria-expanded', String(open)); });
  addEventListener('hashchange', () => { shell.classList.remove('mobile-open'); btn.setAttribute('aria-expanded', 'false'); });
}

async function init() {
  mobileMenu();
  ctx.settings = await getSettings();
  applySettingsToDom(ctx.settings);
  if (ctx.settings.sidebar === false) shell.classList.add('collapsed');
  onSettings((s) => { ctx.settings = s; applySettingsToDom(s); particles(); });
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { applySettingsToDom(ctx.settings); particles(); });
  addEventListener('hashchange', route);
  addEventListener('keydown', shortcuts);
  await route();
  const ready = performance.now();
  document.documentElement.dataset.ready = String(Math.round(ready));
  if (new URLSearchParams(location.search).has('debug')) toast(`Interactif en ${Math.round(ready)} ms`);
  (globalThis.requestIdleCallback || setTimeout)(() => particles(), { timeout: 600 });
  if (!ctx.settings.onboarded && !new URLSearchParams(location.search).has('noonboard')) (await import('../ui/onboarding.js')).openOnboarding(ctx);
  api?.runtime?.onMessage?.addListener((m) => { if (m?.type === 'data-changed') { ctx.refreshSidebar(); current?.refresh?.(); } });
}

init();
