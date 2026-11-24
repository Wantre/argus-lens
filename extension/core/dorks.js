// Bibliothèque de requêtes OSINT légales (aucune recherche de secrets ni de vulnérabilités).
export const DORKS = [
  { cat: 'Documents publics', label: 'PDF publiés par un organisme', q: 'site:{domaine} filetype:pdf' },
  { cat: 'Documents publics', label: 'Documents bureautiques', q: 'site:{domaine} (filetype:docx OR filetype:xlsx OR filetype:pptx)' },
  { cat: 'Documents publics', label: 'Rapports annuels', q: 'site:{domaine} intitle:"rapport annuel"' },
  { cat: 'Cartographie', label: 'Pages hors www', q: 'site:{domaine} -site:www.{domaine}' },
  { cat: 'Cartographie', label: 'Sous-domaines indexés', q: 'site:*.{domaine}' },
  { cat: 'Cartographie', label: 'Section blog', q: 'site:{domaine} inurl:blog' },
  { cat: 'Mentions externes', label: 'Qui parle du domaine', q: '"{domaine}" -site:{domaine}' },
  { cat: 'Mentions externes', label: 'Nom exact hors site officiel', q: '"{nom}" -site:{domaine}' },
  { cat: 'Presse', label: 'Communiqués', q: '"{nom}" communiqué OR "press release"' },
  { cat: 'Réseaux publics', label: 'Pseudo sur X', q: 'site:x.com "{pseudo}"' },
  { cat: 'Réseaux publics', label: 'Terme sur Reddit', q: 'site:reddit.com "{terme}"' },
  { cat: 'Réseaux publics', label: "Page d'entreprise LinkedIn", q: 'site:linkedin.com/company "{organisation}"' },
  { cat: 'Code public', label: 'Projet sur GitHub', q: 'site:github.com "{projet}"' },
  { cat: 'Archives', label: 'Captures Wayback', q: '/wayback {url}' },
  { cat: 'Archives', label: 'Common Crawl', q: '/cc {domaine}' },
  { cat: 'Académique', label: 'Publications PDF', q: '"{sujet}" filetype:pdf site:edu OR site:ac.uk OR site:hal.science' },
  { cat: 'Juridique FR', label: 'Légifrance', q: 'site:legifrance.gouv.fr "{terme}"' },
  { cat: 'Juridique FR', label: 'data.gouv.fr', q: 'site:data.gouv.fr "{terme}"' },
  { cat: 'Juridique FR', label: 'Annuaire des entreprises', q: 'site:annuaire-entreprises.data.gouv.fr "{entreprise}"' },
];

export function dorkVariables(q) {
  return [...new Set([...q.matchAll(/\{([^}]+)\}/g)].map((m) => m[1]))];
}

export function fillDork(q, values) {
  return q.replace(/\{([^}]+)\}/g, (m, k) => (values[k] ? values[k].trim() : m));
}
