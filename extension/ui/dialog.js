// Dialogues accessibles : tiroir latéral et fenêtre centrée (role=dialog, aria-modal, piège de focus, Échap).
import { h, iconButton, trapFocus, prefersReducedMotion } from './dom.js';

let seq = 0;
function open(kind, { title, body, foot, onClose, wide }) {
  const id = `dlg${++seq}`;
  const overlay = h('div', { class: 'overlay', 'aria-hidden': 'true' });
  const panel = h('div', { class: kind === 'drawer' ? 'drawer' : `modal${wide ? ' wide' : ''}`, role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': `${id}-t` },
    h('div', { class: 'drawer-head' }, h('h2', { id: `${id}-t` }, title), iconButton('x', 'Fermer', { onclick: () => close() })),
    h('div', { class: 'drawer-body' }, body),
    foot ? h('div', { class: 'drawer-foot' }, foot) : null);
  let release;
  let closed = false;
  function close() {
    if (closed) return;
    closed = true;
    release?.();
    panel.classList.add('out');
    overlay.style.opacity = '0';
    setTimeout(() => { panel.remove(); overlay.remove(); }, prefersReducedMotion() ? 0 : 200);
    onClose?.();
  }
  overlay.addEventListener('click', close);
  document.body.append(overlay, panel);
  release = trapFocus(panel, close);
  requestAnimationFrame(() => (panel.querySelector('[autofocus], input, select, textarea, button:not(.icon-btn)') || panel.querySelector('button'))?.focus());
  return { close, panel };
}

export const openDrawer = (opts) => open('drawer', opts);
export const openModal = (opts) => open('modal', opts);
