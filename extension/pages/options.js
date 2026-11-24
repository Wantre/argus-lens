// É6 — Paramètres : moteurs (activation, poids, clés saisies par Monsieur, test), thème, densité, animations, confidentialité, favoris, à propos.
import { h, clear, toast } from '../ui/dom.js';
import { icon, logo } from '../ui/icons.js';
import { getSettings, setSettings, purgeHistory } from '../core/store.js';
import { idb } from '../core/idb.js';
import { applySettingsToDom, THEMES } from '../ui/theme.js';
import { FETCH_ENGINES } from '../engines/fetch-engines.js';
import { TAB_ENGINES } from '../engines/tab-engines.js';
import { STATUS_LABEL } from '../core/metasearch.js';
import { api } from '../core/api.js';

const app = document.getElementById('app');
let s;

const SECTIONS = [['engines', 'Moteurs'], ['look', 'Apparence'], ['search', 'Recherche'], ['privacy', 'Confidentialité'], ['favorites', 'Favoris'], ['shortcuts', 'Raccourcis'], ['about', 'À propos']];

async function save(patch, msg = 'Enregistré') { s = await setSettings(patch); applySettingsToDom(s); if (msg) toast(msg, { kind: 'success' }); }

function seg(name, value, options, onChange) {
  return h('div', { class: 'seg', role: 'radiogroup', 'aria-label': name }, options.map(([v, l]) => h('button', { type: 'button', role: 'radio', 'aria-checked': String(v === value), onclick: (e) => { [...e.currentTarget.parentElement.children].forEach((b) => b.setAttribute('aria-checked', String(b === e.currentTarget))); onChange(v); } }, l)));
}

function enginesSection() {
  const rows = FETCH_ENGINES.map((e) => {
    const id = e.meta.id;
    const conf = s.engines[id] || {};
    const st = s.engineStatus?.[id];
    const pillSt = h('span', { class: `pill ${st?.status || 'off'}`, style: { '--c': e.meta.color } }, h('span', { class: 'dot' }), h('span', { class: 'st' }, st ? `${STATUS_LABEL[st.status]} · ${st.ms} ms` : 'non testé'));
    const statusLine = h('p', { class: 'muted', style: { fontSize: '12px' } }, st ? `${st.detail || ''} — testé le ${st.at}` : '');
    const legend = st ? ({ ok: 'Vérifié · disponible', empty: 'Vérifié · 0 résultat', limited: 'Vérifié · quota atteint', blocked: 'Bloqué (anti-robot) · indisponible', no_key: 'Configuration requise', down: 'Documenté · indisponible' })[st.status] : e.meta.needsKey ? 'Configuration requise' : 'Documenté · non testé';
    const keyField = id === 'searxng'
      ? h('input', { class: 'input mono-text', type: 'url', placeholder: 'https://votre-instance.example (format=json activé)', value: conf.url || '', 'aria-label': 'URL de votre instance SearXNG' })
      : e.meta.needsKey || e.meta.keyOptional ? h('input', { class: 'input mono-text', type: 'password', autocomplete: 'off', placeholder: id === 'marginalia' ? 'Clé personnelle (vide = clé partagée « public »)' : id === 'github' ? 'Jeton en lecture seule, sans scope (facultatif)' : 'Clé API à saisir par vous', value: conf.key || '', 'aria-label': `Clé API ${e.meta.name}` }) : null;
    const enabled = h('input', { type: 'checkbox', checked: conf.enabled !== false && !(e.meta.needsKey && !conf.enabled), 'aria-label': `Activer ${e.meta.name}` });
    const weight = h('input', { type: 'range', min: '0', max: '2', step: '0.1', value: String(conf.weight ?? 1), 'aria-label': `Poids de ${e.meta.name} dans la fusion` });
    const wOut = h('output', { class: 'tnum' }, String(conf.weight ?? 1));
    weight.addEventListener('input', () => { wOut.textContent = weight.value; });
    weight.addEventListener('change', () => save({ engines: { [id]: { weight: +weight.value } } }, null));
    enabled.addEventListener('change', async () => {
      if (enabled.checked && e.meta.origin) {
        const ok = await api.permissions.request({ origins: [e.meta.origin] }).catch(() => false);
        if (!ok) { enabled.checked = false; toast('Autorisation d’accès refusée', { kind: 'error' }); return; }
      }
      save({ engines: { [id]: { enabled: enabled.checked } } }, enabled.checked ? `${e.meta.name} activé` : `${e.meta.name} désactivé`);
    });
    const saveKey = keyField ? h('button', { type: 'button', class: 'btn sm', onclick: async () => {
      const v = keyField.value.trim();
      if (id === 'searxng' && v) {
        let origin; try { origin = `${new URL(v).origin}/*`; } catch { return toast('URL invalide', { kind: 'error' }); }
        const ok = await api.permissions.request({ origins: [origin] }).catch(() => false);
        if (!ok) return toast('Autorisation refusée pour cette instance', { kind: 'error' });
        return save({ engines: { searxng: { url: v } } }, 'Instance enregistrée');
      }
      if (e.meta.origin && v) { const ok = await api.permissions.request({ origins: [e.meta.origin] }).catch(() => false); if (!ok) return toast('Autorisation refusée', { kind: 'error' }); }
      save({ engines: { [id]: { key: v } } }, v ? 'Clé enregistrée localement (jamais synchronisée ni exportée)' : 'Clé effacée');
    } }, 'Enregistrer') : null;
    const test = h('button', { type: 'button', class: 'btn sm', onclick: async () => {
      pillSt.className = 'pill loading'; pillSt.querySelector('.st').textContent = 'test…';
      const r = await api.runtime.sendMessage({ type: 'test-engine', id });
      s = await getSettings();
      pillSt.className = `pill ${r.status}`; pillSt.querySelector('.st').textContent = `${STATUS_LABEL[r.status]} · ${r.ms} ms`;
      statusLine.textContent = `${r.detail || ''} — testé le ${r.at}`;
    } }, 'Tester');
    return h('div', { class: 'engine-row card' },
      h('div', { class: 'row', style: { justifyContent: 'space-between' } }, h('label', { class: 'switch' }, enabled, h('strong', {}, e.meta.name)), h('div', { class: 'row' }, pillSt, h('span', { class: 'badge' }, legend), test)),
      h('p', { class: 'muted', style: { fontSize: '13px' } }, e.meta.kind === 'key' ? 'Facultatif : désactivé tant que vous ne saisissez pas vous-même une clé. Aucune dépense engagée par l’extension.' : `Modes : ${e.meta.modes.join(', ')}.${e.meta.method ? ` Méthode : ${e.meta.method}.` : ''}`, ' ', h('a', { href: e.meta.termsUrl, target: '_blank', rel: 'noreferrer' }, 'Conditions'), e.meta.license ? ` · Licence des données : ${e.meta.license} (attribution, usage non commercial)` : ''),
      h('div', { class: 'row', style: { flexWrap: 'nowrap' } }, h('span', { class: 'muted', style: { fontSize: '12px', minWidth: '70px' } }, 'Poids'), weight, wOut),
      keyField ? h('div', { class: 'row', style: { flexWrap: 'nowrap' } }, keyField, saveKey) : null,
      statusLine);
  });
  const burstList = h('div', { class: 'chips' }, TAB_ENGINES.filter((t) => !t.needsUrl && !t.needsDomain).map((t) => h('label', { class: 'check task-chip', style: { height: '34px' } }, h('input', { type: 'checkbox', checked: s.burstEngines.includes(t.id), onchange: (e) => { const set = new Set(s.burstEngines); if (e.target.checked) set.add(t.id); else set.delete(t.id); save({ burstEngines: TAB_ENGINES.map((x) => x.id).filter((x) => set.has(x)) }, null); } }), t.name)));
  return [
    h('p', { class: 'muted' }, 'Les sources sont interrogées par l’extension, sans clé ni paiement, via les pages et endpoints publics que les sites utilisent eux-mêmes (HTML de résultats, RSS, JSON). Une source qui renvoie un captcha, un défi anti-robot ou exige une clé est marquée « bloquée » et mise en pause 10 minutes : aucun contournement. Google, Yandex, Baidu, Ecosia et Ahmia restent en ouverture d’onglet.'),
    h('div', { class: 'row' }, h('button', { type: 'button', class: 'btn', onclick: async (ev) => { ev.currentTarget.disabled = true; toast('Test de toutes les sources en cours (1 à 2 min)…'); await api.runtime.sendMessage({ type: 'test-all' }); location.reload(); } }, 'Tester toutes les sources')),
    ...rows,
    h('div', { class: 'card stack' }, h('h3', {}, 'Lancer en rafale (ouverture en onglets groupés)'), burstList,
      h('label', { class: 'field' }, h('span', {}, 'Confirmation au-delà de'), h('input', { class: 'input', type: 'number', min: '1', max: '20', value: s.burstMax, style: { width: '100px' }, onchange: (e) => save({ burstMax: +e.target.value || 5 }) }))),
  ];
}

function lookSection() {
  return [
    h('div', { class: 'field' }, h('span', {}, 'Thème'), seg('Thème', s.theme, THEMES.map((t) => [t.id, t.label]), (v) => save({ theme: v }))),
    h('div', { class: 'field' }, h('span', {}, 'Densité'), seg('Densité', s.density, [['comfort', 'Confortable'], ['compact', 'Compacte']], (v) => save({ density: v }))),
    h('div', { class: 'field' }, h('span', {}, 'Animations ', h('span', { class: 'hint' }, '(le réglage système « réduire les animations » est toujours respecté)')), seg('Animations', s.motion, [['full', 'Complètes'], ['reduced', 'Réduites'], ['none', 'Aucune']], (v) => save({ motion: v }))),
    h('label', { class: 'switch' }, h('input', { type: 'checkbox', checked: !!s.widgets?.clock, onchange: (e) => save({ widgets: { clock: e.target.checked } }) }), 'Widget horloge de Paris sur l’accueil'),
  ];
}

function searchSection() {
  return [
    h('div', { class: 'grid-2' },
      h('label', { class: 'field' }, h('span', {}, 'Langue par défaut'), h('select', { class: 'input', onchange: (e) => save({ lang: e.target.value }) }, [['fr', 'Français'], ['en', 'Anglais'], ['', 'Aucune']].map(([v, l]) => h('option', { value: v, selected: v === s.lang }, l)))),
      h('label', { class: 'field' }, h('span', {}, 'Pays par défaut'), h('select', { class: 'input', onchange: (e) => save({ region: e.target.value }) }, [['fr', 'France'], ['be', 'Belgique'], ['ch', 'Suisse'], ['ca', 'Canada'], ['', 'Aucun']].map(([v, l]) => h('option', { value: v, selected: v === s.region }, l))))),
    h('label', { class: 'field' }, h('span', {}, 'Profondeur : pages demandées à chaque source ', h('span', { class: 'hint' }, '(plus de résultats, mais plus lent ; « Plus de résultats » en bas de liste pour continuer)')), h('select', { class: 'input', style: { width: '160px' }, onchange: (e) => save({ depth: +e.target.value }) }, [1, 2, 3, 4, 5].map((v) => h('option', { value: String(v), selected: v === (s.depth || 2) }, `${v} page${v > 1 ? 's' : ''}`)))),
    h('label', { class: 'switch' }, h('input', { type: 'checkbox', checked: s.hideDominant, onchange: (e) => save({ hideDominant: e.target.checked }) }), 'Masquer les domaines dominants par défaut'),
    h('label', { class: 'field' }, h('span', {}, 'Domaines dominants ', h('span', { class: 'hint' }, '(un par ligne)')), h('textarea', { class: 'input mono-text', onchange: (e) => save({ dominant: e.target.value.split(/\s+/).filter(Boolean) }) }, (s.dominant || []).join('\n'))),
  ];
}

function privacySection() {
  return [
    h('p', { class: 'muted' }, 'Aucune télémétrie, aucun serveur ARGUS, aucune police ni CDN distants. Les favicons sont des initiales générées localement.'),
    h('label', { class: 'switch' }, h('input', { type: 'checkbox', checked: s.ephemeral, onchange: (e) => save({ ephemeral: e.target.checked }, e.target.checked ? 'Mode éphémère : rien ne sera écrit (ni historique, ni cache)' : 'Mode éphémère désactivé') }), 'Mode éphémère (aucune écriture)'),
    h('label', { class: 'field' }, h('span', {}, 'Rétention de l’historique (jours)'), h('input', { class: 'input', type: 'number', min: '1', max: '3650', value: s.retentionDays, style: { width: '120px' }, onchange: (e) => save({ retentionDays: +e.target.value || 30 }) })),
    h('div', { class: 'row' },
      h('button', { type: 'button', class: 'btn danger', onclick: async () => { if (!confirm('Purger tout l’historique non épinglé ?')) return; await purgeHistory(); toast('Historique purgé', { kind: 'success' }); } }, icon('trash', 15), 'Purger l’historique'),
      h('button', { type: 'button', class: 'btn danger', onclick: async () => { await api.storage.session.clear(); toast('Cache des résultats vidé', { kind: 'success' }); } }, 'Vider le cache (1 h)'),
      h('button', { type: 'button', class: 'btn danger', onclick: async () => { if (!confirm('Tout effacer : Spaces, preuves, historique, réglages et clés ?')) return; for (const st of ['history', 'spaces', 'entries', 'blobs']) await idb.clear(st); await api.storage.local.clear(); await api.storage.session.clear(); localStorage.clear(); toast('Toutes les données locales ont été effacées', { kind: 'success' }); setTimeout(() => location.reload(), 800); } }, 'Tout effacer')),
    h('p', { class: 'muted', style: { fontSize: '12px' } }, 'Les autorisations d’accès facultatives (aperçu de page, Brave, Mojeek, instance SearXNG) se révoquent dans chrome://extensions → ARGUS Lens → Détails.'),
  ];
}

function favoritesSection() {
  const list = h('div', { class: 'stack' });
  const draw = () => clear(list).append(...s.favorites.map((f, i) => h('div', { class: 'row', style: { flexWrap: 'nowrap' } },
    h('input', { class: 'input', value: f.name, 'aria-label': `Nom du favori ${i + 1}`, onchange: (e) => { const a = [...s.favorites]; a[i] = { ...f, name: e.target.value }; save({ favorites: a }); } }),
    h('input', { class: 'input mono-text', value: f.url, 'aria-label': `Adresse du favori ${i + 1}`, onchange: (e) => { const a = [...s.favorites]; a[i] = { ...f, url: e.target.value }; save({ favorites: a }); } }),
    h('button', { type: 'button', class: 'icon-btn', 'aria-label': `Supprimer ${f.name}`, onclick: async () => { await save({ favorites: s.favorites.filter((_, j) => j !== i) }); draw(); } }, icon('trash', 16)))),
  h('button', { type: 'button', class: 'btn sm', onclick: async () => { await save({ favorites: [...s.favorites, { name: 'Nouveau', url: 'https://' }] }, null); draw(); } }, icon('plus', 15), 'Ajouter un favori'));
  draw();
  return [h('p', { class: 'muted' }, 'Favoris internes à l’extension (aucun accès à vos favoris Chrome).'), list];
}

function shortcutsSection() {
  return [
    h('table', { class: 'table' }, h('tbody', {}, [['/', 'Barre de recherche'], ['Ctrl+K', 'Palette'], ['Alt+1…6', 'Modes'], ['j / k / o / Maj+O / p / s / a / e', 'Résultats'], ['g', 'Graphe'], ['F', 'Focus'], ['?', 'Aide'], ['a + espace', 'Omnibox'], ['Alt+Maj+A', 'Popup'], ['Alt+Maj+S', 'Panneau latéral']].map(([k, d]) => h('tr', {}, h('th', { scope: 'row' }, h('kbd', {}, k)), h('td', {}, d))))),
    h('button', { type: 'button', class: 'btn sm', onclick: () => api.tabs.create({ url: 'chrome://extensions/shortcuts' }) }, 'Modifier les raccourcis du navigateur'),
  ];
}

function aboutSection() {
  const v = api.runtime.getManifest().version;
  return [
    h('p', {}, `ARGUS Lens ${v} — recherche web avancée et enquête OSINT légale. Conçu pour Monsieur.`),
    h('ul', { class: 'about-list' },
      h('li', {}, 'Résultats Marginalia : données sous licence CC-BY-NC-SA 4.0 (attribution, usage non commercial), © Marginalia Search.'),
      h('li', {}, 'Brave Search API et Mojeek API : utilisées uniquement avec la clé que vous saisissez ; attribution et conditions de stockage respectées (cache 1 h maximum).'),
      h('li', {}, 'Wayback Machine et archive.org : Internet Archive. Common Crawl : index public, utilisé ponctuellement. crt.sh : Sectigo. RDAP : rdap.org.'),
      h('li', {}, 'Polices embarquées : Inter, Space Grotesk, JetBrains Mono — SIL Open Font License 1.1 (fichiers dans assets/fonts/).'),
      h('li', {}, 'Icônes : dessinées dans le style Lucide (licence ISC).')),
    h('p', { class: 'muted' }, 'Limites : aucun index complet du web, aucun contenu privé, aucun contournement (CAPTCHA, robots.txt, paywalls), pas de Tor. Une absence de résultat n’est pas une preuve d’absence.'),
    h('button', { type: 'button', class: 'btn sm', onclick: async () => { await save({ onboarded: false }, 'L’accueil réaffichera la présentation'); } }, 'Revoir la présentation'),
  ];
}

async function render() {
  s = await getSettings();
  applySettingsToDom(s);
  const builders = { engines: enginesSection, look: lookSection, search: searchSection, privacy: privacySection, favorites: favoritesSection, shortcuts: shortcutsSection, about: aboutSection };
  clear(app).append(h('div', { class: 'opt-shell' },
    h('nav', { class: 'opt-nav', 'aria-label': 'Sections des paramètres' }, h('div', { class: 'sb-brand' }, logo(), h('span', {}, 'Paramètres')), h('ul', {}, SECTIONS.map(([id, l]) => h('li', {}, h('a', { class: 'sb-link', href: `#${id}` }, l))))),
    h('div', { class: 'opt-main' }, h('h1', {}, 'Paramètres d’ARGUS Lens'), SECTIONS.map(([id, l]) => h('section', { id, class: 'opt-sec', 'aria-labelledby': `${id}-t` }, h('h2', { id: `${id}-t` }, l), h('div', { class: 'stack' }, builders[id]()))))));
}

render();
