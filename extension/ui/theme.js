// Thèmes Nacre / Améthyste / Nuit d'Argus / Auto, avec transition circulaire (View Transitions) si disponible.
import { prefersReducedMotion } from './dom.js';

export const THEMES = [
  { id: 'nacre', label: 'Nacre (clair)' },
  { id: 'amethyste', label: 'Améthyste (sombre)' },
  { id: 'nuit', label: "Nuit d'Argus (particules)" },
  { id: 'auto', label: 'Auto (système)' },
];

export function resolveTheme(theme) {
  if (theme === 'auto') return matchMedia('(prefers-color-scheme: dark)').matches ? 'amethyste' : 'nacre';
  return theme;
}

export function applySettingsToDom(settings) {
  const d = document.documentElement;
  d.dataset.theme = resolveTheme(settings.theme);
  d.dataset.motion = settings.motion;
  d.dataset.density = settings.density;
  try { localStorage.setItem('argus-theme', JSON.stringify({ theme: settings.theme, motion: settings.motion, density: settings.density, sidebar: settings.sidebar })); } catch { /* ignore */ }
}

export function switchTheme(apply, origin) {
  if (!document.startViewTransition || prefersReducedMotion()) { apply(); return; }
  const x = origin?.x ?? innerWidth / 2;
  const y = origin?.y ?? 0;
  const r = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
  const vt = document.startViewTransition(apply);
  vt.ready.then(() => {
    document.documentElement.animate({ clipPath: [`circle(0 at ${x}px ${y}px)`, `circle(${r}px at ${x}px ${y}px)`] }, { duration: 350, easing: 'ease-in-out', pseudoElement: '::view-transition-new(root)' });
  }).catch(() => {});
}
