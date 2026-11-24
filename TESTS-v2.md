# ARGUS Lens 2.0.0 : tests réels des sources (20/11/2026)

Les mesures ont été faites le 20/11/2026 entre 22 h 35 et 23 h 05, heure de Paris.

**Environnement.** L'extension a été chargée dans Chromium 156 headless (Playwright), depuis une adresse IP de centre de données. Les recherches passent par le vrai chemin de l'extension : port `lens-search` du service worker, puis fusion avec `mergeResults`. Le banc de test remplace l'agent utilisateur « HeadlessChrome » par celui d'un Chrome normal, uniquement pour reproduire un navigateur habituel : l'extension elle-même ne modifie aucun en-tête. Chaque recherche demande 2 pages par source, le réglage par défaut. Le cache est désactivé (mode éphémère).

Tests unitaires : `cd extension && node --test tests/*.test.js` donne **75/75 réussis** (67 en v1 et 8 nouveaux). Les nouveaux tests couvrent :

- l'analyseur HTML ;
- les parsers DuckDuckGo, Bing, Startpage, Mojeek et Wikipédia sur des pages types ;
- la pagination et la déduplication entre les pages ;
- le blocage anti-robot, qui met la source en pause sans la relancer.

## 1. Diagnostic de la v1 : pourquoi il y avait si peu de résultats

| Cause | Constat mesuré |
|---|---|
| Le mode Web n'interrogeait que **2 sources** | Seulement Marginalia et Wiby. Google, Bing, DuckDuckGo et les autres s'ouvraient seulement dans un onglet, donc ne donnaient aucun résultat dans ARGUS. |
| La clé partagée « public » de Marginalia est saturée | HTTP 429 à **chaque** requête (12/12 sous Node, 7/7 sous Chromium). Chaque recherche attendait aussi 3,3 s en relances inutiles. |
| Wiby est un tout petit index | 0 à 12 résultats, et 0 pour « recette ratatouille ». |
| Brave, Mojeek et SearXNG exigeaient une clé ou une instance personnelle | Ces sources sont restées désactivées. |
| Aucun mode Social ni Savoir | 0 source pour Reddit, HN, Mastodon, Bluesky, Wikipédia, OpenAlex, etc. |
| Pas de pagination | Une seule page par source, 20 résultats au maximum. |
| crt.sh : délai de 15 s trop court | Délai dépassé sur groupedlsi.com sous Node. Passé à 30 s, avec un budget global de 65 s. |
| Common Crawl | Erreur HTTP 504 côté serveur (index surchargé). Ce n'est pas un défaut de l'extension. |
| Manifeste | Les hôtes déclarés étaient corrects. Il n'y avait ni problème de CORS ni erreur de parsing sur les sources v1. Le défaut venait de la couverture. |
| Erreurs silencieuses | Aucune. Les pastilles affichaient déjà « Limité 429 ». Mais une pastille « 0 résultat » s'affichait comme un grand cadre en pointillés, par collision avec la classe CSS `.empty`. C'est corrigé. |

## 2. Résultat par source (Chromium avec l'extension chargée, 16 requêtes FR et EN)

Lecture des colonnes :

- **Essais** : requêtes réellement envoyées, sans compter celles où la source était « en pause » ;
- **Moyenne** : nombre de résultats sur les essais réussis, pour 2 pages ;
- **Latence** : médiane en millisecondes.

Les colonnes Essais, Moyenne et Latence viennent de l’exécution finale, de 22 h 52 à 22 h 54. Dans cette exécution, une source mise en pause après son premier blocage n’est plus réinterrogée, d’où « 1 / 0 ». Les exécutions précédentes et complémentaires ont donné les mêmes statuts, avec en plus :

- Bing à 0 sur « linux kernel » ;
- arXiv à 0 sur « photosynthèse » ;
- crt.sh hors délai sur wikipedia.org.

| Source | Méthode (endpoint public) | Statut | Essais / OK | Moyenne | Latence | Cause d'échec |
|---|---|---|---|---|---|---|
| Bing | Flux RSS `bing.com/search?format=rss&mkt=fr-FR`, repli sur la page HTML | **OK** (parfois 0) | 6 / 6 | 10,7 | 967 | Renvoie parfois 0 résultat : réponse vide sans captcha (« climate change », « linux kernel ») |
| Brave Search | Page HTML `search.brave.com/search` | **Partiel** | 6 / 3 | 27 | 1 269 | 429 après quelques requêtes depuis l'IP de la box. Parfois une page à 0 ou 1 résultat |
| Wikipédia FR et EN | API MediaWiki `list=search` | **OK** | 8 / 8 | 35 | 465 | — |
| Wikidata | `wbsearchentities` | **OK** | 3 / 3 | 20 | 108 | 0 sur des requêtes de plusieurs mots (normal) |
| Mwmbl | JSON `api.mwmbl.org/search/` | **OK** | 7 / 6 | 26 | 165 | 0 pour « mairie Saint-Priest » |
| Wiby | JSON `wiby.me/json` | **OK** | 7 / 6 | 18 | 643 | Petit index |
| OpenAlex | API `/works?search` | **OK** | 3 / 3 | 40 | 1 351 | Budget gratuit partagé par IP, signalé par l'API |
| Crossref | API REST `/works` | **OK** | 3 / 3 | 40 | 7 731 | Lent |
| arXiv | API Atom `export.arxiv.org` | **OK** | 3 / 3 | 28 | 3 231 | 0 pour « photosynthèse » (normal) |
| Internet Archive (collections) | `advancedsearch.php` | **OK** | 4 / 3 | 49 | 1 483 | 0 sur un nom de domaine (normal) |
| GitHub (dépôts) | REST `search/repositories`, sans authentification | **OK** | 3 / 3 | 40 | 3 866 | Plafond de 10 requêtes par minute sans jeton |
| GitHub (tickets et PR) | REST `search/issues`, sans authentification | **OK** | 3 / 3 | 40 | 3 168 | Même plafond |
| Hacker News | API Algolia | **OK** | 5 / 5 | 32 | 844 | — |
| Stack Exchange | API 2.3 sans clé | **OK** | 3 / 3 | 37 | 609 | 300 requêtes par jour et par IP |
| Lemmy | API v3 `lemmy.world`, repli sur `lemmy.ml` | **OK** | 3 / 3 | 40 | 10 165 | Lent par moments (délai de 9 s dépassé une fois, d'où le délai porté à 12 s) |
| Mastodon | `/api/v2/search` (comptes et hashtags) et fil public d'un hashtag | **OK** | 3 / 3 | 34 | 434 | Recherche plein texte des messages impossible sans compte (limite de Mastodon) |
| Bluesky | `api.bsky.app` searchPosts et `public.api.bsky.app` searchActors | **OK** | 3 / 3 | 35 | 1 110 | `public.api.bsky.app/searchPosts` répond 403, d'où l'usage d'`api.bsky.app` |
| DNS (DoH) | `dns.google/resolve`, repli sur Cloudflare | **OK** | 2 / 2 | 6 | 1 762 | — |
| RDAP | rdap.org | **OK** | 2 / 2 | 1 | 126 | — |
| Wayback CDX | API CDX | **OK** | 3 / 3 | 40 | 488 | — |
| crt.sh | JSON `?output=json` | **Partiel** | 2 / 1 | 17 | 6 338 | HTTP 502 et délais dépassés côté crt.sh (service instable) |
| Common Crawl | Index CDX | **Bloqué (serveur)** | 1 / 0 | 0 | 23 073 | HTTP 504 côté serveur, aussi en v1 |
| DuckDuckGo | HTML `html.duckduckgo.com`, repli sur `lite` | **Bloqué** | 1 / 0 | 0 | 867 | HTTP 202 avec page de défi pour toute requête venant d'une extension (en-tête `Origin: chrome-extension://`). La même URL fonctionne depuis Node (10 résultats). Non contourné. |
| Mojeek | HTML `mojeek.com/search` | **Bloqué** (depuis une IP de centre de données) | 1 / 0 | 0 | 342 | Page « Captcha » ou 403 « your network appears to be sending automated queries » : l'IP de centre de données est filtrée. Non vérifié depuis une connexion résidentielle. |
| Yahoo | HTML `search.yahoo.com` | **Bloqué** | 1 / 0 | 0 | 396 | Redirection vers `/_bv/` (vérification anti-robot) puis HTTP 500 |
| Startpage | HTML `/sp/search` | **Bloqué** | 1 / 0 | 0 | 889 | Défi Anubis (preuve de travail anti-robot) |
| Qwant | JSON interne `api.qwant.com/v3/search/web` | **Bloqué** | 1 / 0 | 0 | 396 | HTTP 403 (captcha exigé) |
| SearXNG publiques | `/search?format=json`, bascule sur 3 instances au maximum | **Bloqué** | 4 / 0 | 0 | 1 862 | 0 instance sur 41 testées n'accepte le JSON (codes 429, 403, 418 ou page HTML) |
| 4get (4get.ca) | API JSON `/api/v1/web` | **Hors service** | 2 / 0 | 0 | — | HTTP 503 (instance en panne). Mesuré lors d’une exécution complémentaire |
| Marginalia | API officielle, clé « public » | **Limité** | 1 / 0 | 0 | 430 | 429 en permanence. Une clé personnelle gratuite (demande par mail à Marginalia) lèverait cette limite. |
| Reddit | `/search.json` | **Bloqué** | 1 / 0 | 0 | 821 | HTTP 403 (filtrage du réseau). Non vérifié depuis une IP résidentielle. |

**Bilan : 19 sources OK, 2 partielles (Brave, crt.sh), 9 bloquées ou hors service, 1 limitée (Marginalia).** Une source bloquée est mise en pause 10 minutes : pastille « en pause », et aucune nouvelle requête pendant ce temps.

Sous Node, avec un autre en-tête `Origin`, DuckDuckGo a donné 9 à 10 résultats sur chacune de 4 requêtes. Le blocage dans l'extension est donc propre aux requêtes d'extension. Pour DuckDuckGo, Mojeek, Yahoo et Reddit, le résultat peut être différent depuis une connexion résidentielle. Il faut le vérifier avec **Paramètres → Moteurs → Tester toutes les sources**. Ces sources ne sont pas déclarées opérationnelles.

## 3. Comparatif avant/après (mêmes requêtes, Chromium, résultats fusionnés et dédupliqués)

| Mode | Requête | v1.0.0 | v2.0.0 | Temps v2 |
|---|---|---|---|---|
| Web | intelligence artificielle | 12 | 97 | 3,3 s |
| Web | recette ratatouille | 0 | 46 | 2,6 s |
| Web | mairie Saint-Priest | 8 | 90 | 2,2 s |
| Web | open source intelligence | 12 | 137 | 4,0 s |
| Web | rust async runtime | 9 | 68 | 2,1 s |
| Petit web | logiciel libre | 12 | 54 | 0,6 s |
| Code | rust async runtime | 20 | 154 | 3,9 s |
| Code | osint | 20 | 146 | 4,2 s |
| Social (nouveau) | osint | 32 * | 172 | 33,5 s ** |
| Social (nouveau) | élections municipales | 21 * | 99 | 1,5 s |
| Savoir (nouveau) | changement climatique | 24 * | 190 | 6,5 s |
| Savoir (nouveau) | large language models | 32 * | 230 | 8,4 s |
| Archives | groupedlsi.com | 40 | 40 | 23 s (Common Crawl 504) |
| Infra | groupedlsi.com | 54 | 58 (avec DNS) | 12,6 s |
| Infra | example.com | 49 | 45 (crt.sh 502) | 1,8 s |
| Tout voir | climate change | 32 | 542 | 10,2 s |

\* Les modes Social et Savoir n'existaient pas en v1. Le chiffre v1 est celui du mode « Tout voir » de la v1 (Wiby, GitHub, Marginalia) sur la même requête, et ces résultats ne relevaient pas du sujet social ou scientifique.
\** Lemmy était lent ce soir-là.

**Totaux :**

- **Web**, 5 requêtes : 41 résultats en v1 contre 438 en v2, soit une moyenne qui passe de 8,2 à 87,6 par requête (×10,7).
- **Ensemble des 16 requêtes** : 377 contre 2 168 (×5,8).

Les modes Archives et Infra restent à peu près au même niveau : ils dépendent de Wayback, crt.sh et Common Crawl, dont les deux derniers étaient instables ce soir-là.

## 4. Interface (vérifiée dans Chromium, captures `docs/v2-*.png`)

- Le design est inchangé : thèmes, barre, pastilles, colonne de filtres. Les nouveaux modes **Social** et **Savoir** apparaissent dans le sélecteur.
- Chaque pastille de source indique son état (OK, bloqué, en pause, limité, hors service, 0 résultat), le nombre de résultats, le nombre de pages et la latence.
- Le bouton **« Plus de résultats (page N sur chaque source) »** fonctionne : il a fait passer la requête « changement climatique » de 190 à 269 résultats.
- La page Paramètres affiche 34 sources. Pour chacune : sa méthode, le bouton « Tester », et un bouton « Tester toutes les sources ». La profondeur se règle de 1 à 5 pages.
- Aucune erreur dans la console sur ces parcours.
- Anomalie observée une seule fois : la pastille Reddit est restée en « Chargement » plus de 120 s. Elle ne s'est pas reproduite sur 3 nouvelles exécutions. Le budget global par source (25 s) doit normalement l'empêcher.
