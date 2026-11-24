// Horodatage Europe/Paris (ISO 8601 avec décalage +01:00 / +02:00).
const TZ = 'Europe/Paris';

function parts(date) {
  const f = new Intl.DateTimeFormat('en-GB', {
    timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  });
  const o = {};
  for (const p of f.formatToParts(date)) o[p.type] = p.value;
  return o;
}

export function parisOffsetMinutes(date = new Date()) {
  const p = parts(date);
  const asUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
  return Math.round((asUtc - Math.floor(date.getTime() / 1000) * 1000) / 60000);
}

export function parisIso(date = new Date()) {
  const p = parts(date);
  const off = parisOffsetMinutes(date);
  const sign = off >= 0 ? '+' : '-';
  const hh = String(Math.floor(Math.abs(off) / 60)).padStart(2, '0');
  const mm = String(Math.abs(off) % 60).padStart(2, '0');
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}${sign}${hh}:${mm}`;
}

export function parisHour(date = new Date()) {
  return +parts(date).hour;
}

export function greeting(date = new Date()) {
  const h = parisHour(date);
  if (h >= 5 && h < 12) return 'Bonjour Monsieur';
  if (h >= 12 && h < 18) return 'Bon après-midi Monsieur';
  if (h >= 18 && h < 23) return 'Bonsoir Monsieur';
  return 'Bonne nuit Monsieur';
}

export function formatParis(dateLike, opts = { dateStyle: 'medium', timeStyle: 'short' }) {
  const d = typeof dateLike === 'string' || typeof dateLike === 'number' ? new Date(dateLike) : dateLike;
  if (!d || Number.isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat('fr-FR', { timeZone: TZ, ...opts }).format(d);
}

export function relativeFr(ts) {
  const s = Math.round((Date.now() - ts) / 1000);
  if (s < 60) return "à l'instant";
  if (s < 3600) return `il y a ${Math.round(s / 60)} min`;
  if (s < 86400) return `il y a ${Math.round(s / 3600)} h`;
  return `il y a ${Math.round(s / 86400)} j`;
}
