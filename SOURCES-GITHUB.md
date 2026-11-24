# Projets GitHub et open source évalués pour ARGUS Lens 2.0.0 (20/11/2026)

**Méthode.** Les licences et dates viennent de l'API GitHub ou Gitea publique, consultée le 20/11/2026 vers 22 h 30, heure de Paris. Pour chaque projet, j'ai lu le code ou le README afin d'identifier comment il obtient ses résultats.

**Règle appliquée.** ARGUS réutilise seulement des **endpoints publics**, réécrits en JavaScript : ce sont des URL et des sélecteurs, pas du code copié. Tout mécanisme d'**usurpation d'empreinte TLS ou de navigateur, de résolution de captcha, de rotation de proxys ou de clés volées** est exclu.

**Licences.** Le code AGPL de SearXNG et 4get n'a pas été copié : il a seulement servi à connaître les URL publiques. Les sélecteurs de ddgs (licence MIT) ont été réécrits. Le fichier `engines/open-engines.js` cite ces sources.

## Métamoteurs et wrappers

| Projet | URL | Licence | Dernier commit | Méthode | Intégrable en MV3 ? | Décision |
|---|---|---|---|---|---|---|
| SearXNG (`searx/engines/`) | https://github.com/searxng/searxng | AGPL-3.0 | 20/11/2026 | Moteurs interrogés côté serveur : HTML de Brave, Startpage, Mojeek, Yahoo, Bing, DDG, Qwant, ainsi que des API publiques (Wikipédia, arXiv, Crossref…) | Pas le serveur. Ses instances publiques, si elles acceptent le JSON. | **Référence d'endpoints.** Adaptateur « SearXNG publiques » avec bascule sur 3 instances au maximum. Test : 0 instance sur 41 n'accepte le JSON (429, 403 ou 418), donc **bloqué**. Une instance personnelle reste configurable. |
| ddgs (anciennement duckduckgo_search) | https://github.com/deedy5/ddgs | MIT | 23/10/2026 | Pages HTML de DDG, Bing, Brave, Mojeek, Yahoo, Startpage et Yandex, **via `primp`, qui usurpe l'empreinte TLS d'un navigateur** | Les endpoints et sélecteurs, oui. L'usurpation d'empreinte, **non**. | **Sélecteurs réutilisés** (réécrits) pour DDG, Brave, Mojeek et Yahoo. `primp` est **exclu**. L'extension utilise le vrai Chrome de l'utilisateur, sans rien imiter. |
| Whoogle | https://github.com/benbusby/whoogle-search | MIT | 14/08/2026, **archivé** | Proxy serveur des résultats Google | Non (serveur, Google bloque l'automatisation) | **Écarté**. Google reste en onglet. |
| LibreX | https://github.com/hnhx/librex | AGPL-3.0 | 24/06/2023 (abandonné) | Serveur PHP qui récupère Google, DDG et Brave | Non | **Écarté** (abandonné) |
| LibreY | https://github.com/Ahwxorg/LibreY | AGPL-3.0 | 10/06/2026 | Fork de LibreX, serveur PHP | Non | **Documenté**. Une instance auto-hébergée pourrait être ajoutée comme « instance personnelle ». |
| 4get | https://git.lolcat.ca/lolcat/4get (Gitea, hors GitHub) | AGPL-3.0 | 19/11/2026 | Serveur PHP proxy. **API JSON publique** `/api/v1/web`, autorisée pour un « usage personnel déclenché par un humain ». Certaines instances exigent un « pass » obtenu par captcha. | Oui (API JSON) | **Intégré** (source « 4get »). Test : HTTP 503, instance 4get.ca en panne, donc **hors service** ce soir. Aucun captcha ne sera résolu. |
| Mullvad Leta | https://leta.mullvad.net, wrapper https://github.com/unixfox/mullvad-leta-openwebui-external | Service non open source. Wrapper sous MIT. | Wrapper archivé, indiqué « Doesn't work anymore » | Proxy payant de Google et Brave | Non | **Écarté** |
| webserp | https://github.com/PaperBoardOfficial/webserp | MIT | 21/02/2026 | 7 moteurs **via curl_cffi : usurpation d'empreinte JA3** (« bypasses bot detection »), option proxy | Non | **Exclu** (contournement anti-robot) |
| free-search-mcp | https://github.com/sweetcornna/free-search-mcp | MIT | 17/11/2026 | Serveur MCP local de recherche sans clé | Non (serveur) | **Documenté seulement** |
| GScraper (Brave et DDG, images) | https://github.com/d4n3436/GScraper | MIT | 22/07/2026 | Scrapers C# des endpoints d'images | Non (C#) | **Documenté**. La recherche d'images n'entre pas dans cette version. |
| GoogleScraper (Google, Yandex, Bing…) | https://github.com/NikolaiT/GoogleScraper | Apache-2.0 | 03/07/2021 (abandonné) | Selenium et rotation de proxys | Non | **Exclu** (rotation de proxys) |
| luminati-io/yandex-api | https://github.com/luminati-io/yandex-api | Non indiquée | 20/08/2025 | Publicité pour l'API payante de Bright Data, avec proxys | Non | **Exclu** (payant, proxys) |
| omkarcloud/baidu-scraper | https://github.com/omkarcloud/baidu-scraper | MIT | 13/05/2026 | API commerciale (25 requêtes gratuites par mois, clé requise) | Clé requise | **Écarté**. Baidu reste en onglet. |

## Moteurs directs testés sans wrapper (endpoints publics)

| Endpoint | Résultat dans l'extension | Décision |
|---|---|---|
| `bing.com/search?format=rss&mkt=…` | OK, 10 résultats par page | **Intégré** |
| `search.brave.com/search` (HTML) | OK, puis 429 après quelques requêtes depuis la box | **Intégré** (partiel) |
| `html.duckduckgo.com` et `lite.duckduckgo.com` | HTTP 202 avec page de défi pour les requêtes d'extension | **Intégré, mais marqué bloqué**. Pas de suppression de l'en-tête Origin (ce serait du maquillage). Il reste en onglet. |
| `mojeek.com/search` (HTML) | Captcha ou 403 « automated queries » depuis une IP de centre de données | **Intégré, marqué bloqué**. À retester depuis une connexion résidentielle. |
| `search.yahoo.com` | Vérification anti-robot `/_bv/`, HTTP 500 | **Intégré, marqué bloqué** |
| `startpage.com/sp/search` | Défi Anubis (preuve de travail) | **Intégré, marqué bloqué**. Le défi n'est pas résolu. |
| `api.qwant.com/v3/search/web` | 403, captcha exigé | **Intégré, marqué bloqué** |
| Yandex, Baidu, Google, Ecosia | Captcha, Cloudflare ou interdiction d'automatisation | **Onglet uniquement** |
| Mwmbl `api.mwmbl.org/search/` | OK, index libre | **Intégré** |
| Alexandria `api.alexandria.org` | Ne répond pas (connexion impossible) | Écarté |

## Moteurs .onion (deep et dark web)

| Projet | URL | Licence | Dernier commit | Méthode | Décision |
|---|---|---|---|---|---|
| Ahmia | https://github.com/ahmia/ahmia-site | BSD-3-Clause | 25/09/2026 | Index des services .onion, consultable en clear web sur https://ahmia.fi. Le formulaire contient un **jeton caché tournant** destiné à bloquer les requêtes automatisées (sans lui, retour à l'accueil). | **Ouverture en onglet** (nouvelle entrée « Ahmia » dans Archives). L'interrogation automatique demanderait de récupérer le jeton anti-automatisation : **non faite**. |
| OnionSearch | https://github.com/megadose/OnionSearch | GPL-3.0 | 29/12/2023 | Scraper Python de plus de 15 moteurs .onion **via un proxy Tor** (127.0.0.1:9050) | **Documenté seulement**. Il exige Tor, et rien n'est installé. |
| Torch | Pas de dépôt officiel (seulement des clones sans licence, comme rsh46/Torch-onion-zone-search-engine) | Aucune | — | Service .onion uniquement | **Documenté seulement** (Tor requis) |
| Tor et I2P | — | — | — | Réseaux qui demandent un client local | **Non configurés, non installés** (règle ARGUS) |

**« Deep web » au sens légal** (bases non indexées par les moteurs, accessibles publiquement) : ARGUS l'atteint désormais par OpenAlex, Crossref, arXiv, Internet Archive (collections), Wikidata, crt.sh, RDAP, DNS, les index CDX de Wayback et Common Crawl, Stack Exchange, HN, Lemmy, Mastodon et Bluesky. Les forums ou bases derrière une connexion ne sont **pas** interrogés.
