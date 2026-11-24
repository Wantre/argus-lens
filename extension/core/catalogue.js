// Catalogue d'outils ARGUS (source : outils-scripts/catalogue.json, vérifié le 2026-11-08T23:03:45.757041+01:00). Statuts honnêtes, aucun test opérationnel revendiqué.
export const CATALOGUE_CHECKED_AT = "2026-11-08T23:03:45.757041+01:00";
export const CATALOGUE = [
 {
  "name": "OSINT Framework",
  "url": "https://osintframework.com/",
  "cat": "Annuaires",
  "status": "DOCUMENTED_ONLY",
  "doc": "HTTP_VERIFIED",
  "op": "NOT_TESTED",
  "notes": "Annuaire de pistes, pas garantie de qualité ou disponibilité."
 },
 {
  "name": "Bellingcat toolkit",
  "url": "https://bellingcat.gitbook.io/toolkit",
  "cat": "Annuaires",
  "status": "DOCUMENTED_ONLY",
  "doc": "HTTP_VERIFIED",
  "op": "NOT_TESTED",
  "notes": "La page présente des catégories et guides ; elle précise explicitement que l’inclusion ne vaut pas approbation ou recommandation par Bellingcat."
 },
 {
  "name": "SpiderFoot",
  "url": "https://github.com/smicallef/spiderfoot",
  "cat": "Automatisation (passif)",
  "status": "DOCUMENTED_ONLY",
  "doc": "HTTP_VERIFIED",
  "op": "NOT_TESTED",
  "notes": "Sélectionner modules passifs uniquement ; modules actifs hors périmètre."
 },
 {
  "name": "Maltego",
  "url": "https://www.maltego.com/",
  "cat": "Graphes",
  "status": "DOCUMENTED_ONLY",
  "doc": "HTTP_VERIFIED",
  "op": "NOT_TESTED",
  "notes": "Graphes et transformations ; données, licences et transferts à vérifier."
 },
 {
  "name": "WhatsMyName",
  "url": "https://github.com/WebBreacher/WhatsMyName",
  "cat": "Pseudos",
  "status": "DOCUMENTED_ONLY",
  "doc": "HTTP_VERIFIED",
  "op": "NOT_TESTED",
  "notes": "Présence de pseudo ; faux positifs et homonymes."
 },
 {
  "name": "Maigret",
  "url": "https://github.com/soxoj/maigret",
  "cat": "Pseudos",
  "status": "DOCUMENTED_ONLY",
  "doc": "HTTP_VERIFIED",
  "op": "NOT_TESTED",
  "notes": "Pas installé ; aucun rattachement automatique à une identité civile."
 },
 {
  "name": "SearXNG",
  "url": "https://docs.searxng.org/",
  "cat": "Méta-recherche",
  "status": "DOCUMENTED_ONLY",
  "doc": "HTTP_VERIFIED",
  "op": "NOT_TESTED",
  "notes": "Instance, règles et quotas à vérifier ; pas contournement."
 },
 {
  "name": "Wayback Machine",
  "url": "https://web.archive.org/",
  "cat": "Archives",
  "status": "DOCUMENTED_ONLY",
  "doc": "HTTP_VERIFIED",
  "op": "NOT_TESTED",
  "notes": "Accueil HTTP accessible ; moteur de recherche de captures, CDX et récupération d’archive non testés. Couverture historique non démontrée."
 },
 {
  "name": "ICANN RDAP",
  "url": "https://www.icann.org/rdap",
  "cat": "Infrastructure",
  "status": "DOCUMENTED_ONLY",
  "doc": "HTTP_VERIFIED",
  "op": "NOT_TESTED",
  "notes": "Données d’enregistrement publiques parfois expurgées."
 },
 {
  "name": "Shodan",
  "url": "https://developer.shodan.io/",
  "cat": "Infrastructure",
  "status": "DOCUMENTED_ONLY",
  "doc": "HTTP_VERIFIED",
  "op": "NOT_TESTED",
  "notes": "Consulter données indexées ; aucun scan déclenché."
 },
 {
  "name": "Censys",
  "url": "https://docs.censys.com/",
  "cat": "Infrastructure",
  "status": "DOCUMENTED_ONLY",
  "doc": "HTTP_VERIFIED",
  "op": "NOT_TESTED",
  "notes": "Recherche passive ; offres et authentification à confirmer."
 },
 {
  "name": "VirusTotal",
  "url": "https://docs.virustotal.com/",
  "cat": "Infrastructure",
  "status": "DOCUMENTED_ONLY",
  "doc": "HTTP_VERIFIED",
  "op": "NOT_TESTED",
  "notes": "Rapports existants ; ne pas envoyer de fichier ou URL confidentiels."
 },
 {
  "name": "MITRE ATT&CK",
  "url": "https://attack.mitre.org/",
  "cat": "CTI défensif",
  "status": "DOCUMENTED_ONLY",
  "doc": "HTTP_VERIFIED",
  "op": "NOT_TESTED",
  "notes": "Cadre CTI de comportements ; mapping justifié, pas preuve d’attribution."
 },
 {
  "name": "CISA KEV",
  "url": "https://www.cisa.gov/known-exploited-vulnerabilities-catalog",
  "cat": "CTI défensif",
  "status": "DOCUMENTED_ONLY",
  "doc": "HTTP_VERIFIED",
  "op": "NOT_TESTED",
  "notes": "Source candidate pour priorisation défensive, à recouper avec éditeur."
 },
 {
  "name": "ExifTool",
  "url": "https://exiftool.org/",
  "cat": "Médias",
  "status": "DOCUMENTED_ONLY",
  "doc": "HTTP_VERIFIED",
  "op": "NOT_TESTED",
  "notes": "Page publique accessible ; elle signale un forum désactivé à cause du trafic automatisé. Ne pas recommander ce forum comme disponible ; usage local en lecture seule seulement après préparation séparée."
 }
];
