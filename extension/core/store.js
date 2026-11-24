// Réglages (storage.local) + données (IndexedDB). Mode éphémère : aucune écriture.
import { api } from './api.js';
import { idb } from './idb.js';
import { parisIso } from './time.js';

export const DEFAULTS = {
  theme: 'auto', // nacre | amethyste | nuit | auto
  motion: 'full', // full | reduced | none
  density: 'comfort', // comfort | compact
  sidebar: true,
  lang: 'fr', region: 'fr',
  retentionDays: 30,
  ephemeral: false,
  burstMax: 5,
  burstEngines: ['google', 'bing', 'ddg', 'yandex', 'startpage'],
  depth: 2, // pages demandées à chaque source paginée (1 à 5)
  engines: {
    marginalia: { enabled: true, weight: 1, key: '' },
    wiby: { enabled: true, weight: 1 },
    github: { enabled: true, weight: 1, key: '' },
    wayback: { enabled: true, weight: 1 },
    commoncrawl: { enabled: true, weight: 0.8 },
    crtsh: { enabled: true, weight: 1 },
    rdap: { enabled: true, weight: 1 },
    ddg: { enabled: true, weight: 1.2 }, bing: { enabled: true, weight: 1.2 }, 'brave-web': { enabled: true, weight: 1.1 }, 'mojeek-web': { enabled: true, weight: 1 }, yahoo: { enabled: true, weight: 1 },
    'startpage-web': { enabled: true, weight: 1 }, qwant: { enabled: true, weight: 1 }, 'searx-public': { enabled: true, weight: 1 }, '4get': { enabled: true, weight: 1 }, mwmbl: { enabled: true, weight: 0.8 },
    wikipedia: { enabled: true, weight: 1 }, wikidata: { enabled: true, weight: 0.8 }, openalex: { enabled: true, weight: 1 }, crossref: { enabled: true, weight: 1 }, arxiv: { enabled: true, weight: 1 }, 'ia-search': { enabled: true, weight: 0.8 },
    'github-issues': { enabled: true, weight: 0.9, key: '' }, hn: { enabled: true, weight: 1 }, reddit: { enabled: true, weight: 1 }, stackexchange: { enabled: true, weight: 1 }, lemmy: { enabled: true, weight: 0.8 }, mastodon: { enabled: true, weight: 0.8 }, bluesky: { enabled: true, weight: 0.8 }, doh: { enabled: true, weight: 1 },
    brave: { enabled: false, weight: 1, key: '' },
    mojeek: { enabled: false, weight: 1, key: '' },
    searxng: { enabled: false, weight: 1, url: '' },
  },
  engineStatus: {},
  dominant: ['wikipedia.org', 'youtube.com', 'amazon.com', 'amazon.fr', 'facebook.com', 'instagram.com', 'linkedin.com', 'pinterest.com', 'tiktok.com'],
  hideDominant: false,
  favorites: [
    { name: 'Wayback Machine', url: 'https://web.archive.org/' },
    { name: 'crt.sh', url: 'https://crt.sh/' },
    { name: 'OSINT Framework', url: 'https://osintframework.com/' },
    { name: 'Bellingcat Toolkit', url: 'https://bellingcat.gitbook.io/toolkit' },
    { name: 'Annuaire des entreprises', url: 'https://annuaire-entreprises.data.gouv.fr/' },
    { name: 'GitHub', url: 'https://github.com/' },
  ],
  pinned: [],
  activeSpace: null,
  widgets: { clock: false, evidence: false, pinned: false },
  savedDorks: [],
  onboarded: false,
};

const merge = (base, over) => {
  const out = { ...base };
  for (const [k, v] of Object.entries(over || {})) {
    out[k] = v && typeof v === 'object' && !Array.isArray(v) && base[k] && typeof base[k] === 'object' && !Array.isArray(base[k]) ? merge(base[k], v) : v;
  }
  return out;
};

export async function getSettings() {
  if (!api?.storage) return structuredClone(DEFAULTS);
  const { settings } = await api.storage.local.get('settings');
  return merge(DEFAULTS, settings);
}

export async function setSettings(patch) {
  const cur = await getSettings();
  const next = merge(cur, patch);
  await api.storage.local.set({ settings: next });
  return next;
}

export function onSettings(cb) {
  api?.storage?.onChanged.addListener((ch, area) => { if (area === 'local' && ch.settings) cb(merge(DEFAULTS, ch.settings.newValue)); });
}

export const uid = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

// Historique
export async function addHistory(entry, settings) {
  if (settings?.ephemeral) return null;
  const all = await idb.all('history');
  const dup = all.find((h) => h.q === entry.q && h.mode === entry.mode);
  const item = { ...(dup || {}), id: dup?.id || uid(), at: Date.now(), atParis: parisIso(), pinned: dup?.pinned || false, ...entry };
  await idb.put('history', item);
  return item;
}

export async function listHistory() {
  const all = await idb.all('history');
  return all.sort((a, b) => b.at - a.at);
}

export async function purgeHistory(olderThanDays) {
  const all = await idb.all('history');
  const limit = olderThanDays ? Date.now() - olderThanDays * 86400000 : Infinity;
  for (const h of all) if (!h.pinned && h.at < limit) await idb.del('history', h.id);
}

// Spaces
export const SPACE_COLORS = ['#6D3BFF', '#C04BFF', '#2BB8E6', '#1F9D6B', '#C27A00', '#D23A4F', '#5B5675'];
export const SPACE_GLYPHS = ['folder', 'eye', 'globe', 'building', 'user', 'file', 'shield', 'clock'];

export async function listSpaces() {
  return (await idb.all('spaces')).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
}

export async function saveSpace(space) {
  const s = { id: uid(), createdAt: Date.now(), color: SPACE_COLORS[0], glyph: 'folder', status: 'ouvert', budget: 20, cadrage: {}, hypotheses: [], log: [], ...space, updatedAt: Date.now() };
  await idb.put('spaces', s);
  return s;
}

export async function deleteSpace(id) {
  const entries = await idb.byIndex('entries', 'spaceId', id);
  for (const e of entries) { await idb.del('entries', e.id); if (e.blobId) await idb.del('blobs', e.blobId); }
  await idb.del('spaces', id);
}

export async function addEntry(entry) {
  const e = { id: uid(), createdAt: Date.now(), createdParis: parisIso(), ...entry };
  await idb.put('entries', e);
  if (e.spaceId) { const s = await idb.get('spaces', e.spaceId); if (s) await idb.put('spaces', { ...s, updatedAt: Date.now() }); }
  return e;
}

export const listEntries = (spaceId) => idb.byIndex('entries', 'spaceId', spaceId);
export const allEntries = () => idb.all('entries');
export const deleteEntry = (id) => idb.del('entries', id);

export async function logQuery(spaceId, row) {
  const s = spaceId && (await idb.get('spaces', spaceId));
  if (!s) return;
  s.log = [...(s.log || []), { at: parisIso(), ...row }];
  s.updatedAt = Date.now();
  await idb.put('spaces', s);
}
