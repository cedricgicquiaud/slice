# Cahier de recette

Chaque section correspond à une feature. Les cases se cochent pendant la recette, jamais avant.

## SLICE — Compte et liste de ses MCP

_Feature P-WAT-40. Une section par livraison, ajoutée par chaque PR._

## SLICE — Les MCP rangés en base de données

### Livraison 2 — Un connecteur hébergé est créé, servi et expiré depuis la base

**Préparer la recette**

- Une base PostgreSQL jetable : `docker run --rm -d --name slice-recette -p 54329:5432 -e POSTGRES_PASSWORD=recette postgres:16`.
- Une description d'API simple avec au moins trois actions, dont une lecture (GET) et une écriture (POST ou DELETE),
  par exemple la description publique de Petstore (`fixtures/petstore-swagger2.json`).
- Un agent capable d'ajouter un connecteur par adresse (Claude Desktop, ou `scripts/try-hosted.ts`).
- Sauf mention contraire, l'application tourne avec `pnpm dev` (http://localhost:5173), sans `DATABASE_URL`.

**Créer et servir un connecteur (WAT-62)**

- [ ] Créer un connecteur : écran 1, déposer la description ; écran 2, cocher trois actions ; écran 3, choisir
  l'hébergement par SLICE puis valider. L'écran 4 affiche une adresse qui se termine par `/m/` suivi de
  22 caractères (lettres, chiffres, `-` ou `_`).
- [ ] Coller cette adresse dans l'agent : il voit les trois actions cochées, dans l'ordre de l'écran 2, avec les mêmes
  champs à remplir ; la lecture est annoncée comme lecture seule, les écritures comme pouvant modifier.
- [ ] Avec une API à clé d'API (en-tête au nom choisi à l'écran 3, par exemple `X-Api-Key`) : l'agent fournit sa clé,
  appelle une action, et l'API d'origine reçoit cette clé dans l'en-tête `X-Api-Key`.
- [ ] Arrêter `pnpm dev` puis le relancer : la même adresse sert toujours le même connecteur, mêmes actions.
- [ ] Ouvrir deux onglets à l'écran 3 sur la même sélection et valider dans les deux presque en même temps : deux
  adresses différentes, et chacune sert son connecteur.
- [ ] Sur une machine sans PostgreSQL et sans `DATABASE_URL` : `pnpm install`, `pnpm dev` et `pnpm test` fonctionnent
  sans rien installer d'autre. Un dossier `data/pglite/` apparaît après le premier lancement de `pnpm dev`.
- [ ] Refus : copier un ancien `data/hosted.json` contenant un connecteur, relancer `pnpm dev`, ouvrir l'adresse de ce
  connecteur : elle répond « inconnue » (`Unknown MCP id.`), et le fichier `data/hosted.json` n'a pas changé.
- [ ] Refus : après avoir créé un connecteur à clé d'API et fait appeler une action par l'agent avec sa clé, chercher
  cette clé dans la base (`docker exec slice-recette pg_dump -U postgres postgres | grep <la clé>`, l'application
  lancée avec `DATABASE_URL`) : aucun résultat.
- [ ] Refus : ouvrir une adresse inventée (`http://localhost:3001/m/nimportequoi`) : elle répond « inconnue »
  (`Unknown MCP id.`), sans erreur dans le terminal du serveur.
- [ ] Refus : une création qui échoue en cours d'écriture ne laisse aucun connecteur à moitié écrit. Ce cas ne se
  provoque pas depuis l'écran ; il est prouvé par le test automatique « leaves no connector behind when writing its
  actions fails ».

**Démarrer avec la base prête (WAT-63)**

- [ ] Premier démarrage sur une base vide :
  `DATABASE_URL=postgres://postgres:recette@localhost:54329/postgres pnpm dev`. Le serveur démarre sans geste
  manuel et un connecteur se crée normalement. Arrêter, relancer : le connecteur est toujours servi.
- [ ] Le serveur ne répond à aucune requête avant d'avoir préparé ses tables : pendant le démarrage,
  http://localhost:3001/api/health ne répond pas encore ; dès qu'il répond, une création fonctionne.
- [ ] Lancer deux serveurs en même temps sur la même base vide (deux terminaux, `PORT=3001` et `PORT=3002`, même
  `DATABASE_URL`) : les deux démarrent, aucun n'affiche d'erreur de migration.
- [ ] `pnpm build`, puis `DATABASE_URL=postgres://postgres:recette@localhost:54329/postgres pnpm start` : le serveur
  compilé démarre et crée ses tables.
- [ ] Sur la PR, la vérification automatique « typecheck + tests + prod smoke » est verte, avec l'étape
  « Storage tests (PostgreSQL) ».
- [ ] Refus : `NODE_ENV=production pnpm dev:server` sans `DATABASE_URL` : le serveur s'arrête aussitôt et affiche
  « SLICE server cannot start: DATABASE_URL is required in production ».
- [ ] Refus : dans la base, créer à la main un type qui gêne (`docker exec slice-recette psql -U postgres -c
  "CREATE TYPE upstream_auth_type AS ENUM ('x')"` sur une base vide), puis démarrer le serveur sur cette base : il
  s'arrête et affiche « SLICE server cannot start: Database migrations failed: » suivi de la raison donnée par la base
  (« type … already exists »).
- [ ] Refus : chercher un mot de passe de base dans le dépôt : seul `ci-throwaway`, le mot de passe jetable de la CI,
  apparaît, dans `.github/workflows/ci.yml`.

**Expiration (WAT-64)**

- [ ] Créer un connecteur : la date d'expiration affichée à l'écran 4 vaut l'heure de création plus 72 heures.
- [ ] Relancer avec `SLICE_HOSTED_TTL_HOURS=0`, créer un connecteur : l'écran 4 n'affiche aucune date d'expiration,
  et l'adresse reste servie.
- [ ] Relancer avec `SLICE_HOSTED_TTL_HOURS=0.01` (36 secondes), créer un connecteur, attendre une minute, ouvrir
  l'adresse deux fois de suite : les deux fois elle répond « expirée » (`This MCP URL has expired…`).
- [ ] Passé 30 jours après l'expiration, le connecteur et ses actions ont disparu de la base, même sans visite. Ce cas
  ne se joue pas en temps réel ; il est prouvé par les tests automatiques du nettoyage (conservé à 29 jours, supprimé
  à 31 jours, actions comprises).
- [ ] Le nettoyage passe au démarrage puis toutes les heures : avec `DATABASE_URL`, insérer à la main un connecteur
  daté de plus de 33 jours (`docker exec slice-recette psql -U postgres -c "INSERT INTO connectors (id, name,
  base_url, upstream_auth_type, created_at) VALUES ('ancien', 'ancien', 'https://api.example.com', 'none',
  now() - interval '40 days')"`), démarrer le serveur : l'adresse `/m/ancien` répond « inconnue ».
- [ ] Refus : une adresse expirée ne sert jamais ses actions : l'agent qui l'utilise reçoit « expirée », jamais la
  liste des actions.

**Base injoignable (WAT-65)**

- [ ] Avec `DATABASE_URL`, créer un connecteur, arrêter la base (`docker stop slice-recette`) puis la relancer
  (même commande qu'en préparation, la base repart vide : recréer un connecteur suffit) : sans redémarrer SLICE, la
  création et l'adresse refonctionnent.
- [ ] Pendant la coupure, http://localhost:3001/api/health répond 503 (`database unreachable`) ; la base revenue, il
  répond de nouveau `ok`.
- [ ] Pendant la coupure, valider l'écran 3 : la bulle d'erreur habituelle affiche « Hosting is unavailable for the
  moment. Try again in a few minutes. », et l'utilisateur reste à l'écran 3.
- [ ] Refus : pendant la coupure, la création répond `SERVICE_UNAVAILABLE` avec ce message, et le terminal du serveur
  montre qu'il tourne toujours.
- [ ] Refus : pendant la coupure, une adresse existante répond « indisponible pour le moment » (`This MCP is
  unavailable for the moment…`), jamais « inconnue ».

**Documentation (WAT-66)**

- [ ] `docs/configuration.md` et le README décrivent `DATABASE_URL` (obligatoire en production), `SLICE_DATA_DIR`,
  la conservation de 30 jours après expiration et le nettoyage toutes les heures.
- [ ] Dans `CLAUDE.md`, la ligne « Prochaine étape » liste `DATABASE_URL`, `SLICE_HOSTED_TTL_HOURS` et
  `NODE_ENV=production`.
- [ ] `docs/API.md` décrit le code `SERVICE_UNAVAILABLE` (503) de la création et la réponse 503 d'une adresse.
- [ ] Refus : chercher `SLICE_STORE_PATH` et `hosted.json` dans le dépôt (`git grep -n -e SLICE_STORE_PATH -e
  hosted.json`) : rien, hors l'historique `.workflow/` et le test qui vérifie
  que l'ancien fichier est ignoré (`src/server/index.test.ts`).
