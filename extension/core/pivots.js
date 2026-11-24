// Pivots publics et passifs uniquement (aucun scan, aucune base de fuites).
const enc = encodeURIComponent;

export function domainPivots(domain) {
  return [
    { id: 'rdap', label: 'RDAP (enregistrement)', kind: 'fetch', route: `#/r?q=${enc(domain)}&mode=infra` },
    { id: 'crt', label: 'Certificats (crt.sh)', kind: 'fetch', route: `#/r?q=${enc(`/crt ${domain}`)}` },
    { id: 'wayback', label: 'Archives Wayback', kind: 'fetch', route: `#/archive?u=${enc(domain)}` },
    { id: 'site', label: `Pages indexées site:${domain}`, kind: 'tab', url: `https://www.google.com/search?q=${enc(`site:${domain}`)}` },
    { id: 'mentions', label: 'Mentions externes', kind: 'tab', url: `https://www.google.com/search?q=${enc(`"${domain}" -site:${domain}`)}` },
    { id: 'gh', label: 'Mentions sur GitHub', kind: 'fetch', route: `#/r?q=${enc(`/gh ${domain}`)}` },
    { id: 'vt', label: 'Rapport VirusTotal existant', kind: 'tab', url: `https://www.virustotal.com/gui/domain/${enc(domain)}` },
  ];
}

export const PSEUDO_WARNING = "Un pseudo identique n'est pas une preuve d'identité. Recherche publique uniquement, proportionnée au besoin.";

export function pseudoPivots(pseudo) {
  const p = pseudo.replace(/^@/, '');
  return [
    { label: `"${p}" sur Google`, url: `https://www.google.com/search?q=${enc(`"${p}"`)}` },
    { label: `"${p}" sur DuckDuckGo`, url: `https://duckduckgo.com/?q=${enc(`"${p}"`)}` },
    { label: 'Profil GitHub public', url: `https://github.com/${enc(p)}` },
    { label: 'Mentions sur Reddit', url: `https://www.reddit.com/search/?q=${enc(`"${p}"`)}` },
    { label: 'Mentions sur X', url: `https://x.com/search?q=${enc(`"${p}"`)}&f=live` },
  ];
}

export const EMAIL_WARNING = "Adresse e-mail : recherche publique de l'adresse exacte uniquement. Aucune base de fuites n'est consultée.";
export function emailPivots(email) {
  return [
    { label: `"${email}" sur Google`, url: `https://www.google.com/search?q=${enc(`"${email}"`)}` },
    { label: `"${email}" sur Bing`, url: `https://www.bing.com/search?q=${enc(`"${email}"`)}` },
  ];
}
