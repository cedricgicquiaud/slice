# Cahier de recette

Chaque section correspond à une feature. Les cases se cochent pendant la recette, jamais avant.

## SLICE — Compte et liste de ses MCP

_Feature P-WAT-40. Une section par livraison, ajoutée par chaque PR._

### Livraison 1 — On se connecte à SLICE, et rien ne se fait sans compte

**Préparer la recette**

- Supprimer le dossier `data/` d'une ancienne base de développement s'il existe : la base est recréée avec les tables
  des comptes au premier lancement.
- Lancer `pnpm dev`, puis ouvrir http://localhost:5173 dans une fenêtre de navigation privée (aucune session ouverte).
- Les liens « My MCPs » et « Delete account » du menu mènent à `/mcps` et `/account/delete`, qui affichent l'accueil
  jusqu'aux livraisons 2 et 3.

**Sans compte, l'écran de connexion (WAT-96)**

- [ ] Sans session, ouvrir http://localhost:5173 : l'écran « Sign in to SLICE » s'affiche, et non l'accueil
  « Any API, in any agent, in 3 clicks ».
- [ ] Sans session, ouvrir http://localhost:5173/mcps : le même écran « Sign in to SLICE » s'affiche.
- [ ] L'écran propose trois entrées : un bouton « Continue with Google », un bouton « Continue with Microsoft », et un
  champ « Email » suivi du bouton « Email me a code ».
- [ ] Refus : aucun champ de l'écran ne demande de mot de passe, et le mot « password » n'apparaît nulle part. Côté
  base, aucune table n'a de colonne de mot de passe (contrôle automatique : `src/server/db/schema.test.ts`).
- [ ] Refus : aucun texte de l'écran ne parle d'espace (ni « space », ni « workspace »).

**Connexion par Google ou Microsoft (WAT-97)**

Préparer : copier `.env.example` en `.env`, déclarer les deux applications en suivant `docs/oauth-apps.md`, remplir
`.env`, puis relancer `pnpm dev`.

- [ ] `docs/oauth-apps.md` se suit pas à pas, sans connaître le code : à la fin, `.env` contient `BETTER_AUTH_URL`,
  `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `MICROSOFT_CLIENT_ID` et `MICROSOFT_CLIENT_SECRET`, et les adresses
  de retour déclarées sont les adresses locales (`http://localhost:5173/api/auth/callback/google` et
  `…/microsoft`).
- [ ] `.env.example` liste ces variables sans aucune valeur après le `=`, et `git status` ne montre pas `.env` une
  fois rempli (contrôle automatique : `src/server/index.test.ts`).
- [ ] Cliquer « Continue with Google », choisir son compte Google : on revient sur SLICE, connecté (l'accueil
  « Any API, in any agent, in 3 clicks » s'affiche).
- [ ] En navigation privée, cliquer « Continue with Microsoft » avec un compte Microsoft personnel (outlook.com,
  hotmail.com, live.com) : on revient sur SLICE, connecté.
- [ ] Même chose avec un compte Microsoft professionnel ou scolaire : on revient sur SLICE, connecté.
- [ ] Se connecter par Google, puis, en navigation privée, par Microsoft avec la même adresse e-mail : c'est le même
  compte (le menu de compte de WAT-100 affichera la même adresse ; contrôle automatique :
  `src/server/auth/social-sign-in.test.ts`).
- [ ] Refus : une adresse que Google ou Microsoft ne garantit pas ne connecte pas. Pour le voir : avant l'étape 4 de
  la partie Microsoft de `docs/oauth-apps.md` (ou après avoir retiré ses « optional claims »), cliquer
  « Continue with Microsoft » : on revient sur l'écran de connexion, sans session, avec le message « Your Google or
  Microsoft account didn't confirm this email address. Get a code by email instead. » Le message seul s'affiche aussi
  en ouvrant http://localhost:5173/?error=email_not_verified.

**Connexion par code reçu par e-mail (WAT-98)**

Préparer : `.env` sans `RESEND_API_KEY` (ou vide) pour les trois premières cases ; garder sous les yeux le terminal où
tourne `pnpm dev`.

- [ ] Saisir son adresse dans le champ « Email » (par exemple `ada@example.com`), cliquer « Email me a code » : un
  champ « Code » et un bouton « Sign in » remplacent le champ « Email ».
- [ ] Sans clé Resend, le terminal de `pnpm dev` affiche une ligne
  `Sign-in code for ada@example.com: <6 chiffres> (no RESEND_API_KEY, no email sent)`, et aucun e-mail n'arrive.
- [ ] Recopier ces 6 chiffres dans « Code », cliquer « Sign in » : l'accueil « Any API, in any agent, in 3 clicks »
  s'affiche, connecté.
- [ ] Première connexion d'une adresse jamais vue : le compte est créé au premier code, sans autre étape, et rien ne
  parle d'espace à l'écran (l'espace personnel est créé en coulisses ; contrôle automatique :
  `src/server/auth/email-code.test.ts`).
- [ ] Avec la clé : mettre dans `.env` une clé Resend (`RESEND_API_KEY`) et, si un domaine est vérifié chez Resend,
  `RESEND_FROM` (sinon l'expéditeur de test de Resend ne livre qu'à l'adresse du compte Resend : faire la recette
  avec celle-ci). Relancer `pnpm dev`, demander un code : l'e-mail « <6 chiffres> is your SLICE code » arrive dans
  la boîte, le terminal n'affiche pas le code, et ce code connecte.
- [ ] Refus : un envoi qui échoue affiche « Couldn't send the code, try again » et le champ « Code » n'apparaît pas.
  Pour le voir : mettre une clé invalide (`RESEND_API_KEY=re_invalide`), relancer `pnpm dev`, demander un code.
- [ ] Refus : un envoi en échec ne compte pas dans les plafonds de demandes (5 par heure par adresse, 10 par IP). Ce
  cas ne se joue pas à l'écran : passer d'une clé invalide à une clé valide oblige à relancer `pnpm dev`, ce qui remet
  les plafonds à zéro. Il est prouvé par les tests automatiques « leaves the address its five codes for the hour » et
  « leaves the IP its ten codes when one could not be sent » (`src/server/auth/email-code.test.ts`, WAT-99).

**Code faux, périmé, déjà servi, ou trop demandé (WAT-99)**

Préparer : `.env` sans `RESEND_API_KEY`, les codes se lisent dans le terminal de `pnpm dev`. Toutes les demandes faites
depuis le Mac comptent pour la même adresse IP (10 codes par heure) : **relancer `pnpm dev` avant chaque case** (les
plafonds vivent en mémoire et repartent de zéro), et prendre une adresse neuve à chaque case (`ada1@example.com`,
`ada2@example.com`…).

- [ ] Refus : demander un code, saisir `000000` (ou `111111` si le code reçu est `000000`), cliquer « Sign in » : on
  reste sur l'écran de connexion, avec le message « This code is wrong or was already used. »
- [ ] Refus : demander un code, saisir cinq fois un code faux, puis le bon : le bon est refusé avec le message « Too
  many wrong codes. Ask for a new one. », et le champ « Email » revient avec le bouton « Email me a code ». Demander
  un nouveau code et le saisir : on est connecté.
- [ ] Refus : demander un code, attendre 11 minutes, le saisir : refus avec le message « This code has expired. Ask
  for a new one. », et le champ « Email » revient. (La limite exacte, accepté à 9 min 59 s et refusé à 10 min 01 s,
  est prouvée par les tests automatiques de `src/server/auth/email-code.test.ts`.)
- [ ] Refus : un code qui a déjà connecté ne connecte plus. L'écran ne permet pas de ressaisir un code sans en
  redemander un (et un nouveau code remplace l'ancien) : ce cas est prouvé par le test automatique « is refused the
  second time and opens no session » (`src/server/auth/email-code.test.ts`). Le serveur y répond comme pour un code
  faux, et l'écran affiche le même message : « This code is wrong or was already used. »
- [ ] Refus : demander six codes pour la même adresse (cliquer « Email me a code », recharger la page, recommencer) :
  le terminal affiche cinq codes ; la sixième demande affiche « Too many codes asked for this address. Try again in
  an hour. », et aucun sixième code n'apparaît dans le terminal.
- [ ] Refus : demander onze codes, chacun pour une adresse différente (`ip1@example.com` … `ip11@example.com`) : le
  terminal affiche dix codes ; la onzième demande affiche « Too many codes asked from your network. Try again in an
  hour. », et aucun onzième code n'apparaît.

**Le menu de compte et la session de 7 jours (WAT-100)**

Préparer : se connecter par l'un des moyens ci-dessus (le plus simple : code par e-mail, sans clé Resend).

- [ ] Connecté, l'adresse e-mail du compte (par exemple `ada@example.com`) s'affiche en haut à droite, à droite du
  bouton « Reset ».
- [ ] Cliquer sur l'adresse : un menu s'ouvre avec « My MCPs », « Sign out » et « Delete account ». « My MCPs » mène à
  http://localhost:5173/mcps et « Delete account » à http://localhost:5173/account/delete ; les deux affichent
  l'accueil jusqu'aux livraisons 2 et 3.
- [ ] Revenu après 6 jours sans visite, on est toujours connecté. Ce cas ne se joue pas à l'écran sans attendre 6
  jours. Contrôle visible : dans les outils du navigateur (Application, puis Cookies, puis http://localhost:5173), le
  cookie `better-auth.session_token` expire 7 jours après le dernier chargement de page, et sa date avance à chaque
  rechargement. Le retour à J+6 (connecté, session repartie pour 7 jours) et le retour 6 j 22 h après une visite du
  premier jour sont prouvés par les tests automatiques de `src/server/auth/session-lifetime.test.ts`.
- [ ] Refus : après plus de 7 jours sans visite, l'écran « Sign in to SLICE » s'affiche. Prouvé par le test
  automatique « is refused seven days and one minute after the last visit » (`src/server/auth/session-lifetime.test.ts`).
- [ ] Refus : cliquer sur l'adresse, puis « Sign out » : l'écran « Sign in to SLICE » remplace l'application. Ouvrir
  ensuite http://localhost:5173/mcps : l'écran « Sign in to SLICE » s'affiche toujours. (L'ancien cookie de session
  n'ouvre plus rien, ni l'écran ni l'API : `src/server/auth/sign-out.test.ts`.)

**Connecté, je crée mes MCP comme avant, et l'API refuse sans compte (WAT-101)**

Préparer : se connecter (le plus simple : code par e-mail, sans clé Resend). `BETTER_AUTH_URL` peut rester vide dans
`.env` : hors production, SLICE prend `http://localhost:5173` par défaut. Pour les cases jouées au terminal, copier la
valeur du cookie `better-auth.session_token` (outils du navigateur : Application, puis Cookies, puis
http://localhost:5173).

- [ ] Connecté, déposer une description d'API (par exemple coller l'adresse
  `https://petstore3.swagger.io/api/v3/openapi.json`), cocher deux actions, continuer, choisir SLICE Cloud et cliquer
  « Deploy to SLICE Cloud » : l'écran 4 affiche l'adresse du MCP, comme avant. Recommencer avec le kit : le fichier
  `.zip` se télécharge, comme avant.
- [ ] Le MCP créé appartient à l'espace personnel du compte et garde le nom de l'API lu dans la description (ici
  « Swagger Petstore - OpenAPI 3.0 »). Rien ne le montre à l'écran avant la page « My MCPs » de la livraison 2 ;
  contrôle automatique : « puts a connector created from screen 4 in the signed-in account's workspace »
  (`src/server/routes/hosted-mcp.test.ts`).
- [ ] Une session expirée au clic mène à l'écran de connexion, sans MCP créé. Aller jusqu'au bouton « Deploy to SLICE
  Cloud » sans cliquer ; dans les outils du navigateur, supprimer le cookie `better-auth.session_token` (sans quitter
  l'onglet) ; cliquer « Deploy to SLICE Cloud » : l'écran « Sign in to SLICE » remplace l'application, et l'écran 4
  n'apparaît pas. Qu'aucun MCP n'est rangé est prouvé par le test automatique « is refused with 401 and stores
  nothing » (`src/server/routes/hosted-mcp.test.ts`).
- [ ] La base repart d'une migration unique régénérée : après suppression du dossier `data/` (voir « Préparer la
  recette »), `pnpm dev` démarre sans erreur, et un MCP créé avant cette livraison répond comme une adresse inconnue.
  Qu'un MCP sans propriétaire soit refusé par la base est prouvé par le test automatique « refuses a connector that
  belongs to no workspace » (`src/server/db/schema.test.ts`).
- [ ] Supprimer un compte efface son espace, ses MCP et leurs actions. L'écran de suppression arrive en livraison 3 ;
  contrôle automatique : « deletes its workspace, its connectors and their actions with it »
  (`src/server/db/schema.test.ts`).
- [ ] Refus : sans session, créer un MCP par l'API répond 401. Dans un terminal :
  `curl -i -X POST http://localhost:3001/api/host -H 'content-type: application/json' -d '{}'` affiche
  `HTTP/1.1 401` et `{"code":"UNAUTHORIZED","message":"Sign in to continue."}` ; rien n'est créé.
- [ ] Refus : sans session, lire une description d'API ou télécharger le kit par l'API répond 401.
  `curl -i -X POST http://localhost:3001/api/upload-url -H 'content-type: application/json' -d '{"url":"https://petstore3.swagger.io/api/v3/openapi.json"}'`
  et `curl -i -X POST http://localhost:3001/api/generate -H 'content-type: application/json' -d '{}'` affichent
  chacun `HTTP/1.1 401` et `{"code":"UNAUTHORIZED","message":"Sign in to continue."}`.
- [ ] Refus : une demande envoyée depuis un autre site avec ma session est refusée. Avec la valeur du cookie copiée :
  `curl -i -X POST http://localhost:3001/api/host -H 'Origin: https://evil.example' -H 'Cookie: better-auth.session_token=<valeur>' -H 'content-type: application/json' -d '{}'`
  affiche `HTTP/1.1 403` et `{"code":"FORBIDDEN","message":"SLICE takes orders from its own page only."}`. La même
  commande sans la ligne `Origin` répond `HTTP/1.1 400` et `INVALID_SPEC` : la session était bonne, seul l'autre site
  est refusé.

**Mon MCP ne périme plus (WAT-102)**

Préparer : se connecter (le plus simple : code par e-mail, sans clé Resend).

- [ ] Connecté, créer un MCP hébergé (« Deploy to SLICE Cloud ») : l'écran 4 affiche l'adresse du MCP, sans aucune
  date d'expiration (plus de phrase « This URL stays live until… ») ni lien « Get a permanent plan ».
- [ ] La réponse de création ne porte plus de date : dans les outils du navigateur (Réseau, requête `host`), la
  réponse vaut `{"id":"…","url":"…"}`, sans `expiresAt`.
- [ ] Un MCP répond encore au-delà de 72 h et de 30 jours, même avec `SLICE_HOSTED_TTL_HOURS=72`. Contrôle accéléré :
  arrêter `pnpm dev`, le relancer avec `SLICE_HOSTED_TTL_HOURS=0.01 pnpm dev` (36 secondes), créer un MCP hébergé,
  attendre une minute, puis dans un terminal, avec l'adresse affichée à l'écran 4 :
  `curl -s -X POST <adresse> -H 'content-type: application/json' -H 'accept: application/json, text/event-stream' -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}'`
  affiche la liste des actions (`"tools"`), et jamais « This MCP URL has expired ». Le cas à 73 h puis à 31 jours est
  prouvé par le test automatique « still serves its actions 73 h and 31 days after creation, with
  SLICE_HOSTED_TTL_HOURS=72 » (`src/server/routes/hosted-mcp.test.ts`).
- [ ] `CONTEXT.md` (entrée « Expiration »), `docs/configuration.md` et le README disent qu'un MCP n'expire pas ;
  `docs/configuration.md` indique que `SLICE_HOSTED_TTL_HOURS` est ignorée.
- [ ] Refus : aucun nettoyage ne supprime un MCP, ni au démarrage ni à l'heure. Ce cas ne se joue pas en temps réel ;
  il est prouvé par le test automatique « keeps at startup a connector created 40 days ago, with
  SLICE_HOSTED_TTL_HOURS=72 » (`src/server/index.test.ts`) : un MCP de 40 jours, que l'ancien nettoyage aurait
  supprimé, est toujours servi après le démarrage. Le nettoyage horaire partait de ce même démarrage : il n'est plus
  lancé du tout.

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

Remplacée par « Mon MCP ne périme plus (WAT-102) », dans la section « SLICE — Compte et liste de ses MCP » ci-dessus :
un MCP n'expire plus, son adresse ne répond jamais « expirée », et aucun nettoyage ne le supprime.

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

- [ ] `docs/configuration.md` et le README décrivent `DATABASE_URL` (obligatoire en production) et `SLICE_DATA_DIR`.
  (La conservation de 30 jours après expiration et le nettoyage horaire ont disparu avec WAT-102.)
- [ ] Dans `CLAUDE.md`, la ligne « Prochaine étape » liste `DATABASE_URL`, `SLICE_HOSTED_TTL_HOURS` et
  `NODE_ENV=production`.
- [ ] `docs/API.md` décrit le code `SERVICE_UNAVAILABLE` (503) de la création et la réponse 503 d'une adresse.
- [ ] Refus : chercher `SLICE_STORE_PATH` et `hosted.json` dans le dépôt (`git grep -n -e SLICE_STORE_PATH -e
  hosted.json`) : rien, hors l'historique `.workflow/` et le test qui vérifie
  que l'ancien fichier est ignoré (`src/server/index.test.ts`).
