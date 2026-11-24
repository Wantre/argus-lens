// F12 — Aperçu de page : métadonnées + texte assaini (DOMParser inerte, aucun script exécuté, pas d'iframe).
import { h, toast, highlight } from './dom.js';
import { openDrawer } from './dialog.js';
import { api } from '../core/api.js';

export async function openPreview(item, terms = []) {
  const body = h('div', { class: 'stack' }, h('p', { class: 'muted' }, 'Chargement de l’aperçu…'));
  const dlg = openDrawer({ title: 'Aperçu', body, foot: [h('a', { class: 'btn primary', href: item.url, target: '_blank', rel: 'noreferrer' }, 'Ouvrir la page')] });
  let origin;
  try { origin = `${new URL(item.url).origin}/*`; } catch { body.replaceChildren(h('p', {}, 'URL invalide.')); return; }
  let granted = await api.permissions.contains({ origins: [origin] });
  if (!granted) {
    body.replaceChildren(h('p', {}, 'L’aperçu lit la page en HTML (lecture seule) et demande donc l’accès à ce site. L’autorisation est révocable dans les paramètres de Chrome.'),
      h('button', { type: 'button', class: 'btn primary', onclick: async () => { granted = await api.permissions.request({ origins: [origin] }).catch(() => false); if (granted) load(); else toast('Autorisation refusée : aperçu indisponible', { kind: 'error' }); } }, `Autoriser ${new URL(item.url).hostname}`));
    return;
  }
  load();

  async function load() {
    body.replaceChildren(h('p', { class: 'muted' }, 'Lecture de la page…'));
    const res = await api.runtime.sendMessage({ type: 'fetch-html', url: item.url });
    if (!res?.ok) { body.replaceChildren(h('p', {}, `Aperçu impossible : ${res?.error || 'erreur inconnue'}.`), h('p', { class: 'muted' }, 'Certaines pages refusent la lecture automatisée : ouvrez-la dans un onglet.')); return; }
    const doc = new DOMParser().parseFromString(res.html, 'text/html');
    const meta = (sel) => doc.querySelector(sel)?.getAttribute('content') || '';
    doc.querySelectorAll('script, style, noscript, svg, iframe, nav, footer, header, form').forEach((n) => n.remove());
    const text = (doc.querySelector('article, main') || doc.body)?.textContent.replace(/\s+/g, ' ').trim().slice(0, 2400) || '';
    const rows = [
      ['Titre', doc.title || meta('meta[property="og:title"]')],
      ['Description', meta('meta[name="description"]') || meta('meta[property="og:description"]')],
      ['Site', meta('meta[property="og:site_name"]')],
      ['Publié', meta('meta[property="article:published_time"]') || meta('meta[name="date"]') || doc.querySelector('time[datetime]')?.getAttribute('datetime') || ''],
      ['Auteur', meta('meta[name="author"]')],
      ['URL finale', res.finalUrl],
      ['Statut HTTP', String(res.status)],
    ].filter(([, v]) => v);
    body.replaceChildren(
      h('table', { class: 'table' }, h('tbody', {}, rows.map(([k, v]) => h('tr', {}, h('th', { scope: 'row' }, k), h('td', {}, v))))),
      h('h3', {}, 'Texte (extrait assaini)'),
      h('p', { class: 'preview-text' }, highlight(text, terms)),
      h('p', { class: 'muted', style: { fontSize: '12px' } }, 'Aucun script de la page n’est exécuté. Date de publication indicative (métadonnées déclarées par le site).'));
  }
  return dlg;
}
