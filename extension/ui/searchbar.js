// Barre de recherche ARGUS : combobox ARIA + suggestions (historique, Spaces, dorks, opérateurs, commandes).
import { h, iconButton, clear } from './dom.js';
import { icon } from './icons.js';
import { DORKS } from '../core/dorks.js';
import { createVoice } from './voice.js';

export const MODES = [
  { id: 'web', label: 'Web' },
  { id: 'petit', label: 'Petit web' },
  { id: 'archives', label: 'Archives' },
  { id: 'code', label: 'Code' },
  { id: 'infra', label: 'Infra' },
  { id: 'tout', label: 'Tout voir' },
  { id: 'social', label: 'Social' },
  { id: 'savoir', label: 'Savoir' },
];

export const COMMANDS = [
  { cmd: '/wayback', hint: 'Captures Wayback d’une URL ou d’un domaine', icon: 'archive' },
  { cmd: '/cc', hint: 'Présence dans Common Crawl', icon: 'layers' },
  { cmd: '/crt', hint: 'Sous-domaines publics (certificats)', icon: 'shield' },
  { cmd: '/rdap', hint: 'Enregistrement du domaine', icon: 'building' },
  { cmd: '/gh', hint: 'Dépôts GitHub publics', icon: 'code' },
  { cmd: '/pseudo', hint: 'Recherche publique d’un pseudo', icon: 'user' },
  { cmd: '/image', hint: 'Recherche inversée (URL d’image)', icon: 'image' },
  { cmd: '/space', hint: 'Créer un Space d’enquête', icon: 'folder' },
];

const OPERATORS = ['site:', '-site:', 'inurl:', 'intitle:', 'allintitle:', 'intext:', 'filetype:', 'after:', 'before:', 'lang:', 'region:'];
let uidSeq = 0;

export function createSearchBar({ value = '', mode = 'web', compact = false, placeholder = 'Que cherchez-vous, Monsieur ?', sources = {}, onSubmit, onBuilder, onModeChange, label = 'Recherche ARGUS Lens' } = {}) {
  const id = `sb${++uidSeq}`;
  const listId = `${id}-list`;
  const input = h('input', {
    class: 'search-input', id: `${id}-input`, type: 'text', role: 'combobox', 'aria-expanded': 'false', 'aria-controls': listId,
    'aria-autocomplete': 'list', 'aria-label': label, placeholder, autocomplete: 'off', spellcheck: 'false', value,
  });
  const modeSel = h('select', { class: 'mode-select', 'aria-label': 'Mode de recherche' }, MODES.map((m, i) => h('option', { value: m.id, selected: m.id === mode }, `${m.label}`)));
  modeSel.addEventListener('change', () => onModeChange?.(modeSel.value));
  const builderBtn = onBuilder ? iconButton('sliders', 'Constructeur de requête (opérateurs)', { onclick: () => onBuilder(input.value) }) : null;
  const voice = createVoice((text, final) => { input.value = text; if (final) submit(); });
  const micBtn = voice.supported ? iconButton('mic', 'Recherche vocale (la reconnaissance Chrome passe par les serveurs du navigateur)', { class: 'mic', onclick: () => voice.toggle(micBtn) }) : null;
  const submitBtn = h('button', { type: 'submit', class: 'search-submit', 'aria-label': 'Lancer la recherche' }, icon('search', 18));
  const list = h('div', { class: 'suggest', id: listId, role: 'listbox', 'aria-label': 'Suggestions', hidden: true });
  const form = h('form', { class: `search${compact ? ' compact' : ''}`, role: 'search', onsubmit: (e) => { e.preventDefault(); submit(); } },
    h('div', { class: 'search-box' }, icon('search', 20), input, modeSel, builderBtn, micBtn, submitBtn), list);

  let options = [];
  let active = -1;
  let timer;

  function submit(textOverride) {
    close();
    const text = (textOverride ?? input.value).trim();
    if (!text) { input.focus(); return; }
    onSubmit?.(text, modeSel.value);
  }

  function close() {
    list.hidden = true;
    input.setAttribute('aria-expanded', 'false');
    input.removeAttribute('aria-activedescendant');
    active = -1;
  }

  function setActive(i) {
    active = i;
    options.forEach((o, j) => o.el.setAttribute('aria-selected', String(j === i)));
    if (i >= 0) { input.setAttribute('aria-activedescendant', options[i].el.id); options[i].el.scrollIntoView({ block: 'nearest' }); }
    else input.removeAttribute('aria-activedescendant');
  }

  async function build() {
    const text = input.value;
    const last = text.split(/\s+/).pop() || '';
    const low = text.trim().toLowerCase();
    const groups = [];
    if (low.startsWith('/')) {
      groups.push(['Commandes', COMMANDS.filter((c) => c.cmd.startsWith(low.split(' ')[0])).map((c) => ({ icon: c.icon, main: c.cmd, hint: c.hint, apply: `${c.cmd} ` }))]);
    } else if (/^-?[a-z]+:/i.test(last)) {
      const [op, val = ''] = last.split(':');
      if (/site$/i.test(op)) {
        const domains = (await sources.domains?.()) || [];
        const pick = (list) => list.filter((d) => d.startsWith(val)).slice(0, 6).map((d) => ({ icon: 'globe', main: `${op}:${d}`, apply: text.slice(0, text.length - last.length) + `${op}:${d} ` }));
        groups.push(['Domaines récents', pick(domains)]);
        groups.push(['Périmètres courants', pick(['gouv.fr', 'data.gouv.fr', 'europa.eu', 'github.com', 'archive.org', 'edu'].filter((d) => !domains.includes(d)))]);
      } else if (/filetype|ext/i.test(op)) {
        groups.push(['Types de fichier', ['pdf', 'docx', 'xlsx', 'pptx', 'csv', 'txt', 'odt'].filter((f) => f.startsWith(val)).map((f) => ({ icon: 'file', main: `${op}:${f}`, apply: text.slice(0, text.length - last.length) + `${op}:${f} ` }))]);
      }
    } else {
      if (last.length >= 1 && !last.includes(':')) {
        const ops = OPERATORS.filter((o) => o.startsWith(last.toLowerCase()) && o !== last.toLowerCase());
        if (ops.length && last.length >= 2) groups.push(['Opérateurs', ops.slice(0, 4).map((o) => ({ icon: 'sliders', main: o, hint: 'opérateur', apply: text.slice(0, text.length - last.length) + o }))]);
      }
      const hist = (await sources.history?.()) || [];
      const hm = hist.filter((x) => !low || x.q.toLowerCase().includes(low)).slice(0, low ? 5 : 6);
      if (hm.length) groups.push(['Historique', hm.map((x) => ({ icon: x.pinned ? 'pin' : 'clock', main: x.q, hint: MODES.find((m) => m.id === x.mode)?.label, run: () => { modeSel.value = x.mode || 'web'; submit(x.q); } }))]);
      if (low) {
        const spaces = (await sources.spaces?.()) || [];
        const sm = spaces.filter((s) => s.name.toLowerCase().includes(low)).slice(0, 3);
        if (sm.length) groups.push(['Spaces', sm.map((s) => ({ icon: 'folder', main: s.name, hint: 'ouvrir le Space', run: () => { location.hash = `#/space/${s.id}`; } }))]);
        const dm = DORKS.filter((d) => `${d.label} ${d.cat} ${d.q}`.toLowerCase().includes(low)).slice(0, 3);
        if (dm.length) groups.push(['Requêtes OSINT', dm.map((d) => ({ icon: 'sparkles', main: d.label, hint: d.q, apply: d.q }))]);
      } else if (!hm.length) {
        groups.push(['Pour commencer', [
          { icon: 'sparkles', main: 'site:gouv.fr filetype:pdf "rapport annuel"', hint: 'documents publics', apply: 'site:gouv.fr filetype:pdf "rapport annuel"' },
          { icon: 'archive', main: '/wayback example.com', hint: 'archives', apply: '/wayback example.com' },
          { icon: 'shield', main: '/crt example.com', hint: 'certificats', apply: '/crt example.com' },
        ]]);
      }
    }
    render(groups.filter(([, items]) => items.length));
  }

  function render(groups) {
    clear(list);
    options = [];
    if (!groups.length) { close(); return; }
    for (const [title, items] of groups) {
      const gid = `${id}-g${options.length}`;
      const g = h('div', { role: 'group', 'aria-labelledby': gid }, h('div', { class: 'suggest-group', id: gid, role: 'presentation' }, title));
      for (const it of items) {
        const el = h('div', { role: 'option', id: `${id}-o${options.length}`, 'aria-selected': 'false' }, icon(it.icon, 16), h('span', { class: 'opt-main' }, it.main), it.hint ? h('span', { class: 'opt-hint' }, it.hint) : null);
        const opt = { ...it, el };
        el.addEventListener('mousedown', (e) => { e.preventDefault(); choose(opt); });
        options.push(opt);
        g.append(el);
      }
      list.append(g);
    }
    list.append(h('div', { class: 'suggest-foot', 'aria-hidden': 'true' }, h('span', {}, h('kbd', {}, '↑'), h('kbd', {}, '↓'), ' naviguer'), h('span', {}, h('kbd', {}, 'Tab'), ' compléter'), h('span', {}, h('kbd', {}, 'Échap'), ' fermer')));
    list.hidden = false;
    input.setAttribute('aria-expanded', 'true');
    setActive(-1);
  }

  function choose(opt) {
    if (opt.run) { close(); opt.run(); return; }
    input.value = opt.apply;
    input.focus();
    schedule();
  }

  function schedule() { clearTimeout(timer); timer = setTimeout(build, 60); }

  input.addEventListener('input', schedule);
  input.addEventListener('pointerdown', () => { if (list.hidden) schedule(); });
  input.addEventListener('blur', () => setTimeout(close, 120));
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); if (list.hidden) build(); else setActive(Math.min(active + 1, options.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(Math.max(active - 1, -1)); }
    else if (e.key === 'Escape') { if (!list.hidden) { e.preventDefault(); e.stopPropagation(); close(); } else input.blur(); }
    else if (e.key === 'Tab' && !e.shiftKey && active >= 0 && options[active]?.apply) { e.preventDefault(); choose(options[active]); }
    else if (e.key === 'Enter' && active >= 0) { e.preventDefault(); choose(options[active]); }
  });

  return {
    el: form, input, modeSel,
    setValue(v) { input.value = v; },
    setMode(m) { modeSel.value = m; },
    setPlaceholder(p) { input.placeholder = p; },
    focus() { input.focus(); },
  };
}
