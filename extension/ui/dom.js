// Petits utilitaires DOM sans framework. Tout texte externe passe par des nœuds texte (aucun innerHTML).
import { icon } from './icons.js';

export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style' && typeof v === 'object') for (const [sk, sv] of Object.entries(v)) { if (sk.startsWith('--')) el.style.setProperty(sk, sv); else el.style[sk] = sv; }
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else if (k in el && typeof v !== 'string' && k !== 'list') el[k] = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  append(el, children);
  return el;
}

function append(el, children) {
  for (const c of children.flat(Infinity)) {
    if (c == null || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
}

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export function clear(el) { while (el.firstChild) el.firstChild.remove(); return el; }

// Bouton-icône avec libellé accessible et info-bulle.
export function iconButton(name, label, attrs = {}) {
  const { class: cls = '', title, ...rest } = attrs;
  return h('button', { type: 'button', 'aria-label': label, title: title || label, ...rest, class: `icon-btn ${cls}`.trim() }, icon(name));
}

// Surligne les termes (sécurisé : nœuds texte + <mark>).
export function highlight(text, terms) {
  const t = String(text || '');
  const list = [...new Set(terms.map((x) => x.toLowerCase()).filter((x) => x.length > 1))];
  if (!list.length) return [t];
  const re = new RegExp(`(${list.map((x) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'gi');
  return t.split(re).map((part, i) => (i % 2 ? h('mark', {}, part) : part));
}

// Pastille d'initiale colorée (favicon local, aucune requête réseau).
// Favicon réel via l'API _favicon de MV3 : cache local du navigateur, aucune requête vers le site.
// Chrome renvoie une icône par défaut pour les sites jamais visités ; on la reconnaît et on garde
// alors le globe SVG neutre (jamais une lettre).
const faviconUrl = (pageUrl, px) => globalThis.chrome.runtime.getURL(`/_favicon/?pageUrl=${encodeURIComponent(pageUrl)}&size=${px}`);
const defaultIcon = {};
const bytes = async (url) => new Uint8Array(await (await fetch(url)).arrayBuffer());
const sameBytes = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);

export function favicon(target, size = 16) {
  const wrap = h('span', { class: 'favicon is-fallback', 'aria-hidden': 'true', style: { width: `${size}px`, height: `${size}px` } }, icon('globe', Math.round(size * 0.85)));
  const t = String(target || '').trim();
  const pageUrl = !t ? '' : /^https?:\/\//.test(t) ? t : `https://${t.replace(/^\/+/, '')}/`;
  if (!pageUrl || !globalThis.chrome?.runtime?.getURL) return wrap;
  const px = size > 16 ? 32 : 16;
  defaultIcon[px] ||= bytes(faviconUrl('https://argus-lens.invalid/', px)).catch(() => new Uint8Array());
  Promise.all([bytes(faviconUrl(pageUrl, px)), defaultIcon[px]]).then(([icn, def]) => {
    if (!icn.length || sameBytes(icn, def)) return;
    const img = h('img', { alt: '', width: size, height: size, decoding: 'async', src: URL.createObjectURL(new Blob([icn], { type: 'image/png' })) });
    img.addEventListener('load', () => URL.revokeObjectURL(img.src), { once: true });
    wrap.replaceChildren(img);
    wrap.classList.remove('is-fallback');
  }).catch(() => { /* repli déjà affiché */ });
  return wrap;
}

export function prefersReducedMotion() {
  return document.documentElement.dataset.motion === 'none' || document.documentElement.dataset.motion === 'reduced' || matchMedia('(prefers-reduced-motion: reduce)').matches;
}

// Piège de focus pour dialogues.
export function trapFocus(container, onClose) {
  const prev = document.activeElement;
  const focusables = () => $$('button:not([disabled]), [href], input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])', container).filter((e) => e.offsetParent !== null);
  const onKey = (e) => {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); onClose(); return; }
    if (e.key !== 'Tab') return;
    const f = focusables();
    if (!f.length) return;
    const first = f[0]; const last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  };
  container.addEventListener('keydown', onKey);
  return () => { container.removeEventListener('keydown', onKey); if (prev && prev.focus) prev.focus(); };
}

export function announce(msg) {
  const el = document.getElementById('sr-status');
  if (!el) return;
  el.textContent = '';
  setTimeout(() => { el.textContent = msg; }, 30);
}

export function toast(msg, { kind = 'info', action } = {}) {
  let region = document.getElementById('toasts');
  if (!region) { region = h('div', { id: 'toasts', class: 'toasts', role: 'status', 'aria-live': 'polite' }); document.body.append(region); }
  const t = h('div', { class: `toast toast-${kind}` }, icon(kind === 'error' ? 'alert' : kind === 'success' ? 'check' : 'info'), h('span', {}, msg),
    action ? h('button', { type: 'button', class: 'toast-action', onclick: () => { action.run(); close(); } }, action.label) : null);
  function close() { t.classList.add('out'); setTimeout(() => t.remove(), 180); }
  region.append(t);
  setTimeout(close, 3200);
}

export async function copyText(text) {
  try { await navigator.clipboard.writeText(text); toast('Copié dans le presse-papiers', { kind: 'success' }); }
  catch { toast('Copie impossible (autorisation du presse-papiers)', { kind: 'error' }); }
}
