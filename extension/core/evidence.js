// Preuves : SHA-256 des octets bruts, horodatage Europe/Paris, métadonnées de provenance.
import { parisIso } from './time.js';

export async function sha256Hex(data) {
  const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data instanceof ArrayBuffer ? new Uint8Array(data) : data;
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function dataUrlToBytes(dataUrl) {
  const b64 = dataUrl.split(',')[1] || '';
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export async function buildEvidence({ originalUrl, finalUrl, title, bytes, mime = 'image/png', kind = 'brut', method = 'chrome.tabs.captureVisibleTab (partie visible)', label = 'observation', date = new Date() }) {
  return {
    type: 'evidence',
    originalUrl,
    finalUrl: finalUrl || originalUrl,
    title: title || '',
    collectedAt: parisIso(date),
    method,
    mime,
    size: bytes.length,
    sha256: await sha256Hex(bytes),
    kind, // brut = octets capturés tels quels ; transformé = extrait/normalisé
    label,
  };
}

// Sceau d'un Space : SHA-256 de la liste ordonnée des empreintes.
export async function spaceSeal(hashes) {
  if (!hashes.length) return null;
  return sha256Hex(hashes.join('\n'));
}
