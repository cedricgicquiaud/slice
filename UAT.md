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

### Livraison 2 — Je retrouve mes MCP sur « My MCPs » et j'en supprime un

**Préparer la recette**

- Lancer `pnpm dev`, ouvrir http://localhost:5173 et se connecter avec une adresse A (le plus simple : code par
  e-mail, sans clé Resend ; le code s'affiche dans le terminal de `pnpm dev`).
- Créer deux MCP hébergés (« Deploy to SLICE Cloud ») : l'un depuis l'adresse de description
  `https://petstore3.swagger.io/api/v3/openapi.json` en cochant 3 actions, l'autre depuis le fichier
  `fixtures/shopify-50.yaml` du dépôt en cochant 1 action. Noter l'adresse de chacun, affichée à l'écran 4.
- Ouvrir « My MCPs » depuis le menu de compte (l'adresse e-mail en haut à droite), ou directement
  http://localhost:5173/mcps.

**J'ouvre « My MCPs » et je retrouve mes MCP (WAT-103)**

- [ ] La page « My MCPs » liste les deux MCP, le plus récent en haut. Chacun montre le nom de l'API tel que lu dans sa
  description (par exemple « Swagger Petstore - OpenAPI 3.0 »), son nombre d'actions (« 3 actions », puis « 1 action »
  au singulier), sa date de création (par exemple « Created Oct 25, 2026 ») et son adresse en entier.
- [ ] Cliquer l'icône de copie à droite d'une adresse, puis coller (Cmd+V) dans un champ quelconque : c'est
  exactement l'adresse notée à l'écran 4.
- [ ] Recharger la page (Cmd+R) sur http://localhost:5173/mcps : la page « My MCPs » revient avec la même liste, et
  non l'accueil « Any API, in any agent, in 3 clicks ».
- [ ] Cliquer « Reset » en haut de la page : l'accueil s'affiche, à l'adresse http://localhost:5173/. Le bouton
  « Précédent » du navigateur ramène à « My MCPs ».
- [ ] Un MCP enregistré sans nom d'API s'affiche sous le domaine de son API (par exemple `api.acme.io`). SLICE donne
  aujourd'hui un nom à tout MCP créé (« Untitled API » à défaut de titre) : ce cas ne se joue pas à l'écran, il est
  prouvé par le test automatique « names an MCP without an API name after its API's domain (D9) »
  (`src/server/services/account-mcps.test.ts`).
- [ ] Se connecter avec une adresse B qui n'a jamais créé de MCP (en navigation privée) et ouvrir « My MCPs » : la
  page affiche « You have no MCP yet. »
- [ ] Se connecter par Google avec une adresse Gmail, créer un MCP, se déconnecter, puis se connecter par code reçu
  à cette même adresse : « My MCPs » montre le même MCP (même compte, mêmes MCP). Préparer `.env` comme pour WAT-97
  de la livraison 1.
- [ ] Refus : la page ne propose aucune modification d'un MCP. Chaque ligne n'offre que deux boutons, la copie de
  l'adresse et « Delete » ; aucun champ ne se saisit, aucun bouton « Edit » ou « Rename ».
  _Remplacée par « Modifier un MCP, même adresse », livraison 2 (WAT-144) : chaque ligne offre désormais « Edit
  actions », qui ne change que la sélection ; toujours aucun champ, aucun bouton « Rename »._
- [ ] Refus : connecté avec l'adresse B, « My MCPs » ne montre jamais les MCP de l'adresse A, et inversement.

**Je supprime un MCP (WAT-104)**

- [ ] Sur la ligne d'un MCP, cliquer « Delete » : une fenêtre s'ouvre, titrée « Delete <nom de l'API>? », qui
  prévient que l'adresse cesse de répondre tout de suite. Cliquer « Delete » dans la fenêtre : la fenêtre se ferme
  et la ligne disparaît de la liste aussitôt. Recharger la page : le MCP n'y revient pas.
- [ ] Supprimer le dernier MCP de la liste : la page affiche « You have no MCP yet. »
- [ ] Refus : cliquer « Delete » sur une ligne, puis « Cancel » dans la fenêtre (ou la touche Échap, ou la croix) :
  la fenêtre se ferme, la ligne reste là, et après rechargement le MCP est toujours listé.
- [ ] Refus : après suppression, l'adresse du MCP répond « Unknown MCP id ». Dans un terminal, avec l'adresse notée à
  l'écran 4 :
  `curl -i -X POST <adresse> -H 'content-type: application/json' -H 'accept: application/json, text/event-stream' -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}'`
  affiche `HTTP/1.1 404` et `{"error":"Unknown MCP id."}`. Un agent (Claude Desktop) branché sur cette adresse ne
  voit plus aucune action.

**Je ne peux pas toucher aux MCP d'un autre compte (WAT-105)**

Préparer : connecté avec l'adresse B, copier la valeur du cookie `better-auth.session_token` (outils du navigateur,
onglet Application ou Stockage, Cookies, `http://localhost:5173`). Prendre l'identifiant d'un MCP de l'adresse A : la
fin de son adresse, après `/m/`.

- [ ] Refus : supprimer par l'API le MCP de l'adresse A avec la session de B répond 404, comme pour un MCP qui
  n'existe pas.
  `curl -i -X DELETE http://localhost:3001/api/mcps/<identifiant> -H 'Cookie: better-auth.session_token=<valeur de B>'`
  affiche `HTTP/1.1 404` et `{"code":"NOT_FOUND","message":"Unknown MCP id."}`. Connecté avec l'adresse A, le MCP
  est toujours dans « My MCPs » et son adresse répond toujours.
- [ ] Refus : sans session, la liste et la suppression répondent 401.
  `curl -i http://localhost:3001/api/mcps` et
  `curl -i -X DELETE http://localhost:3001/api/mcps/<identifiant>` affichent chacun `HTTP/1.1 401` et
  `{"code":"UNAUTHORIZED","message":"Sign in to continue."}` ; le MCP est toujours là.
- [ ] `docs/API.md` décrit `GET /api/mcps` et `DELETE /api/mcps/:id` : la réponse, les champs, et les refus 401, 403,
  404 et 503.

### Livraison 3 — Je supprime mon compte

**Préparer la recette**

- Lancer `pnpm dev`, ouvrir http://localhost:5173 et se connecter avec une adresse C qui ne sert qu'à ce test (code
  par e-mail, le code s'affiche dans le terminal de `pnpm dev`). Se connecter juste avant : une session ouverte il y a
  plus d'un jour ne peut pas supprimer le compte (voir le dernier refus de WAT-106).
- Créer deux MCP hébergés (« Deploy to SLICE Cloud »), par exemple depuis l'adresse de description
  `https://petstore3.swagger.io/api/v3/openapi.json`, et noter l'adresse de chacun, affichée à l'écran 4.
- Dans une fenêtre de navigation privée (un « second appareil »), se connecter aussi avec l'adresse C : « My MCPs »
  y montre les deux MCP. Copier la valeur de son cookie `better-auth.session_token` (outils du navigateur, onglet
  Application ou Stockage, Cookies, `http://localhost:5173`).
- Revenir dans la fenêtre normale et ouvrir « Delete account » depuis le menu de compte (l'adresse e-mail en haut à
  droite), ou directement http://localhost:5173/account/delete.

**Je confirme la suppression de mon compte en tapant delete (WAT-106)**

- [ ] La page « Delete your account » s'affiche sans les étapes 1-2-3 en haut, et dit ce qui disparaît : « Your
  account and all its MCPs are deleted at once. Their addresses stop working for every agent that uses them. This
  can't be undone. » Recharger la page (Cmd+R) : la même page revient, et non l'accueil.
- [ ] Refus : le bouton « Delete my account » reste grisé et ne réagit pas au clic tant que le champ « Type delete to
  confirm » ne contient pas exactement `delete` : champ vide, `Delete` (majuscule), `delet`, `deletee`, ` delete`
  (espace devant) le laissent inactif.
- [ ] Taper exactement `delete` : le bouton s'active. Le cliquer : aucune autre confirmation n'est demandée, l'écran
  de connexion « Sign in to SLICE » s'affiche aussitôt, à l'adresse http://localhost:5173/.
- [ ] Refus : la page ne parle jamais d'espace. Aucun des mots « space » ou « workspace » n'y apparaît (Cmd+F
  « space »), avant comme après avoir tapé `delete`.
- [ ] Une session ouverte il y a plus d'un jour supprime aussi le compte (WAT-111). Ce cas demande d'attendre un
  jour : il est prouvé par le test automatique « deletes the account »
  (`src/server/auth/old-session-deletion.test.ts`), sur une session ouverte deux jours plus tôt.
- [ ] Double-cliquer « Delete my account » : le bouton se grise dès le premier clic, une seule suppression part
  (WAT-111 ; prouvé aussi par « sends one deletion only when the button is clicked twice »).

**Après suppression du compte, il ne reste rien (WAT-107)**

- [ ] Refus : les adresses des deux MCP répondent « Unknown MCP id ». Dans un terminal, pour chaque adresse notée :
  `curl -i -X POST <adresse> -H 'content-type: application/json' -H 'accept: application/json, text/event-stream' -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}'`
  affiche `HTTP/1.1 404` et `{"error":"Unknown MCP id."}`.
- [ ] Refus : la session du second appareil ne marche plus. Dans la fenêtre privée, recharger la page : l'écran de
  connexion s'affiche. Et `curl -i http://localhost:3001/api/mcps -H 'Cookie: better-auth.session_token=<valeur
  copiée>'` affiche `HTTP/1.1 401` et `{"code":"UNAUTHORIZED","message":"Sign in to continue."}`.
- [ ] Refus : se reconnecter avec l'adresse C (nouveau code par e-mail) ouvre un compte vide : « My MCPs » affiche
  « You have no MCP yet. »
- [ ] Refus : une demande de suppression venue d'un autre site est refusée. Connecté avec une adresse D, copier son
  cookie comme ci-dessus, puis
  `curl -i -X POST http://localhost:3001/api/auth/delete-user -H 'content-type: application/json' -H 'Origin: https://evil.example' -H 'Cookie: better-auth.session_token=<valeur de D>' -d '{}'`
  affiche `HTTP/1.1 403` et `"code":"INVALID_ORIGIN"` ; recharger SLICE : D est toujours connecté.
- [ ] Refus : sans session, la suppression répond 401.
  `curl -i -X POST http://localhost:3001/api/auth/delete-user -H 'content-type: application/json' -d '{}'` affiche
  `HTTP/1.1 401` ; rien n'est supprimé.
- [ ] `docs/API.md` décrit `POST /api/auth/delete-user` (section « Authentication ») : ce qu'elle efface, et les refus
  401 et 403.

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

## SLICE — Modifier un MCP, même adresse

_Feature P-WAT-41. Une section par livraison, ajoutée par chaque PR._

### Livraison 1 — Je vois l'historique de mon MCP

**Préparer la recette**

- Supprimer le dossier `data/` de la base de développement s'il existe : le schéma a changé (versions et liste complète
  des actions), et la base est recréée au premier lancement.
- Lancer `pnpm dev`, ouvrir http://localhost:5173 et se connecter avec une adresse A (code par e-mail ; sans clé
  Resend, le code s'affiche dans le terminal de `pnpm dev`).
- Créer un MCP hébergé (« Deploy to SLICE Cloud ») depuis le fichier `fixtures/uat-deprecated.yaml` du dépôt, en
  cochant 2 actions et en laissant les autres décochées. Noter les libellés des 2 actions cochées et l'adresse affichée
  à l'écran 4.
- Raccourci : l'amorce `.pilot/recette/amorce-history.js`, collée dans la console du navigateur sur
  http://localhost:5173, ouvre une session pour `recette@slice.local` et crée le MCP « Recette Notes » avec 2 actions
  cochées sur 3 (« List notes », « Create a note » ; « Delete a note » reste décochée). Recharger ensuite la page :
  elle s'ouvre sur l'historique de ce MCP.
- La modification d'un MCP (« Edit actions », « Save ») arrive en livraison 2 : aujourd'hui, chaque MCP n'a que sa
  version 1.

**Un MCP créé garde toute la liste des actions de son API, et sa sélection devient sa version 1 (WAT-141)**

- [ ] Sur « My MCPs » (http://localhost:5173/mcps), la ligne du MCP créé affiche « 2 actions » : le nombre d'actions
  cochées, et non celui de toute l'API.
- [ ] Brancher l'adresse du MCP dans un agent (Claude Desktop, snippet de l'écran 4), ou lister ses actions dans un
  terminal :
  `curl -s -X POST <adresse> -H 'content-type: application/json' -H 'accept: application/json, text/event-stream' -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}'`
  La réponse ne contient que les 2 actions cochées, jamais une action décochée.
- [ ] Ouvrir « History » sur la ligne du MCP : une seule version, « Version 1 », avec « 2 actions », la date du jour
  (« Created <date> ») et la marque « Active since <même date> ».
- [ ] La liste complète des actions de l'API (cochées ou non, avec nom, libellé, groupe, description, mention
  « deprecated », méthode, chemin et paramètres) est rangée sans se voir à l'écran : elle servira à « Edit actions »
  en livraison 2. Preuve : le test automatique « keeps every action of the connector's API, in order, with what the
  selection screen shows of it (D1) » (`src/server/services/hosted-store.test.ts`).
- [ ] Une seule version est active par MCP : la base refuse une deuxième version active (test automatique « refuses a
  second active version of a connector, never an inactive one (D4) », `src/server/db/schema.test.ts`). Quand une
  autre version devient active, l'adresse ne sert plus que ses actions, et « My MCPs » ne compte plus que les siennes
  (tests « serves the actions of its active version only (D4) », `src/server/routes/hosted-mcp.test.ts`, et « counts
  the actions of the active version, not those of the others (D11) », `src/server/services/account-mcps.test.ts`).
- [ ] Supprimer le MCP depuis « My MCPs » (« Delete », puis « Delete ») : il disparaît, avec ses versions et sa liste
  d'actions (test « deletes the versions and the full list of actions of a deleted connector (contract 13) »). Supprimer
  son compte (http://localhost:5173/account/delete) supprime aussi ses MCP, leurs versions et leurs listes (test
  « deletes its workspace, its connectors, their versions and their lists of actions with it (D11, contract 13) »,
  `src/server/db/schema.test.ts`).
- [ ] Refus : aucune version, aucune liste d'actions ne garde de clé, de jeton ni le fichier de description d'API.
  Preuve : le test « keeps no upstream key, no token and not the API description in the database, versions and lists
  included (contract 24) » (`src/server/routes/hosted-mcp.test.ts`), qui crée un MCP avec un jeton et une clé, puis
  fouille toutes les lignes rangées.
- [ ] Le schéma tient toujours en une seule migration : le dossier `src/server/db/migrations/` ne contient que
  `0000_init.sql` (et son dossier `meta/`).

**J'ouvre « History » depuis « My MCPs », et recharger la page me le rend (WAT-142)**

- [ ] Sur « My MCPs », chaque ligne montre un bouton « History » à côté de « Delete ».
- [ ] Cliquer « History » : l'adresse devient http://localhost:5173/mcps/<identifiant>/history. L'écran montre en
  haut le nom du MCP (le même que sur « My MCPs »), un lien « Back to My MCPs », et aucune étape 1-2-3.
- [ ] Recharger la page (Cmd+R) : le même écran « History » revient, sur le même MCP.
- [ ] Coller directement l'adresse http://localhost:5173/mcps/<identifiant>/history dans un nouvel onglet : l'écran
  s'ouvre de même.
- [ ] Chaque version montre son numéro (« Version 1 »), son nombre d'actions et sa date de création ; la version
  active porte « Active since <date> », qui est sa date de création tant qu'aucune version n'a été restaurée.
- [ ] Cliquer « Version 1 » : la liste des libellés de ses actions se déplie (par exemple « List notes » et « Create a
  note » avec l'amorce). Recliquer la replie.
- [ ] Les versions sont listées de la plus récente à la plus ancienne. Avec une seule version, cela ne se voit pas
  encore à l'écran : preuve par les tests « lists its versions newest first, each with its actions, the active one
  dated from its activation (D8) » (`src/server/services/mcp-versions.test.ts`) et « lists every version, newest
  first, with its number, creation date and action count (contract 8) » (`src/client/screens/history.test.tsx`).
- [ ] Cliquer « Back to My MCPs » : la page « My MCPs » revient.
- [ ] Refus : ouvrir http://localhost:5173/mcps/nexistepas/history : l'écran affiche « MCP not found » et « There is
  no MCP at this address in your account. », avec le lien « Back to My MCPs », et non un écran vide.

**Refus : l'historique d'un autre compte reste introuvable, et rien sans connexion (WAT-143)**

Préparer : se connecter avec une adresse B (en navigation privée) et copier la valeur du cookie
`better-auth.session_token` (outils du navigateur, onglet Application ou Stockage, Cookies,
`http://localhost:5173`). Prendre l'identifiant du MCP de l'adresse A : la fin de son adresse, après `/m/`.

- [ ] Connecté avec l'adresse A, `curl -i http://localhost:3001/api/mcps/<identifiant>/versions -H 'Cookie:
  better-auth.session_token=<valeur de A>'` affiche `HTTP/1.1 200` et les versions du MCP.
- [ ] Refus : avec la session de B, `curl -i http://localhost:3001/api/mcps/<identifiant>/versions -H 'Cookie:
  better-auth.session_token=<valeur de B>'` affiche `HTTP/1.1 404` et `{"code":"NOT_FOUND","message":"Unknown MCP
  id."}`.
- [ ] Refus : avec la session de B, la même commande sur un identifiant inventé (`.../api/mcps/nexistepas/versions`)
  affiche exactement la même réponse : `HTTP/1.1 404` et `{"code":"NOT_FOUND","message":"Unknown MCP id."}`.
- [ ] Refus : connecté avec l'adresse B, ouvrir http://localhost:5173/mcps/<identifiant de A>/history : l'écran
  affiche « MCP not found », comme pour un MCP inconnu. Le MCP de A est toujours dans « My MCPs » de A.
- [ ] Refus : sans session, `curl -i http://localhost:3001/api/mcps/<identifiant>/versions` affiche `HTTP/1.1 401` et
  `{"code":"UNAUTHORIZED","message":"Sign in to continue."}`.
- [ ] `docs/API.md` décrit `GET /api/mcps/:id/versions` (la réponse, ses champs, les refus 401, 404 et 503), la
  configuration rangée par `POST /api/host` (liste complète et version 1) et le nombre d'actions de `GET /api/mcps`
  (celui de la version active).

### Livraison 2 — Je change la sélection, l'adresse reste la même

**Préparer la recette**

- Lancer `pnpm dev`, ouvrir http://localhost:5173 et se connecter avec une adresse A (code par e-mail ; sans clé
  Resend, le code s'affiche dans le terminal de `pnpm dev`).
- Raccourci : l'amorce `.pilot/recette/amorce-edit.js`, collée dans la console du navigateur sur
  http://localhost:5173, ouvre une session pour `recette@slice.local`, reprend le MCP « Recette Notes » du compte (ou le
  crée) avec 2 actions cochées sur 3 (« List notes », « Create a note » ; « Delete a note » décochée), puis place la
  page sur son écran « Edit actions ». Recharger ensuite la page. Repasser l'amorce remet ces 2 actions cochées si un
  passage précédent les a changées (une version de plus dans « History »).
- Sans l'amorce : créer un MCP hébergé (« Deploy to SLICE Cloud ») depuis `fixtures/uat-deprecated.yaml` en cochant 2
  actions. Noter son adresse (écran 4 ou « My MCPs »).
- Pour les vérifications en terminal : copier la valeur du cookie `better-auth.session_token` (outils du navigateur,
  onglet Application ou Stockage, Cookies, `http://localhost:5173`) et l'identifiant du MCP, la fin de son adresse
  après `/m/`.

**J'ouvre « Edit actions » : l'étape 2 revient, les actions de la version active cochées (WAT-144)**

- [ ] Sur « My MCPs » (http://localhost:5173/mcps), chaque ligne montre un bouton « Edit actions », à côté de
  « History » et « Delete ».
- [ ] Cliquer « Edit actions » : l'adresse devient http://localhost:5173/mcps/<identifiant>/edit. Recharger la page
  (Cmd+R), ou coller cette adresse dans un nouvel onglet : le même écran revient, sur la version active.
- [ ] L'écran montre toutes les actions de l'API, cochées ou non, comme à l'étape 2 : les groupes à gauche (avec
  « All »), les libellés, et le compteur « Selected 2 / 3 » en bas à gauche (avec l'amorce).
- [ ] Les actions de la version active sont cochées (« List notes » et « Create a note » avec l'amorce), les autres non
  (« Delete a note »). Cliquer « All » à gauche pour les voir toutes.
- [ ] L'écran ne montre pas les étapes 1-2-3 en haut : il montre le nom du MCP (le même que sur « My MCPs ») et un
  lien « Back to My MCPs », qui ramène à la liste.
- [ ] Refus : ouvrir http://localhost:5173/mcps/nexistepas/edit : l'écran affiche « MCP not found » et « There is no
  MCP at this address in your account. », sans aucune action ni bouton « Save ».
- [ ] Refus : connecté avec une adresse B (en navigation privée), ouvrir http://localhost:5173/mcps/<identifiant de
  A>/edit : l'écran affiche « MCP not found », comme pour un MCP inconnu.

**J'enregistre : une nouvelle version, même adresse, que l'agent voit à sa prochaine conversation (WAT-145)**

- [ ] Refus : à l'ouverture d'« Edit actions », « Save » (en bas à droite) est grisé : la sélection est celle de la
  version active. Cocher puis décocher « Delete a note » : « Save » redevient grisé.
- [ ] Refus : décocher toutes les actions : « Save » est grisé.
- [ ] Cocher « Delete a note », puis cliquer « Save » : sous le nom du MCP s'affiche « Saved as version 2. Your agent
  sees the new actions in its next conversation, with nothing to paste again. » « Save » redevient grisé.
- [ ] Refus : double-cliquer « Save » après avoir changé une case : « Save » se grise dès le premier clic, et
  « History » ne montre qu'une seule version de plus.
- [ ] Ouvrir « History » : « Version 2 » est en tête, avec « 3 actions » et « Active since <date du jour> » ;
  « Version 1 » n'a plus de marque « Active since ». La version suivante porte toujours le numéro qui suit le plus
  grand (3 après 2, etc.).
- [ ] Sur « My MCPs », la ligne du MCP affiche « 3 actions », et son adresse est identique à celle notée avant.
- [ ] Lister les actions à l'adresse, dans un terminal :
  `curl -s -X POST <adresse> -H 'content-type: application/json' -H 'accept: application/json, text/event-stream' -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}'`
  La réponse contient exactement les 3 actions de la version 2 (`list_notes`, `create_note`, `delete_a_note` avec
  l'amorce). Dans Claude Desktop, une nouvelle conversation montre les nouvelles actions sans recoller l'adresse.
- [ ] Revenir à la sélection de la version 1 (décocher « Delete a note »), puis « Save » : « Saved as version 3… »
  s'affiche ; « History » montre une version 3 active, et non le retour de la version 1.

**Refus : le serveur n'accepte que la sélection d'actions de mon MCP, à jour (WAT-146)**

Dans les commandes ci-dessous, remplacer `<id>` par l'identifiant du MCP, `<A>` par la valeur du cookie de l'adresse A
(propriétaire du MCP), `<B>` par celle d'une adresse B, et `<n>` par le numéro de la version active (« History »).
Après chaque refus, « History » ne montre aucune version de plus.

- [ ] Refus : une sélection vide.
  `curl -i -X POST http://localhost:3001/api/mcps/<id>/versions -H 'content-type: application/json' -H 'Cookie: better-auth.session_token=<A>' -d '{"fromVersion":<n>,"selectedIds":[]}'`
  affiche `HTTP/1.1 400` et `{"code":"INVALID_SELECTION","message":"Pick at least one action."}`.
- [ ] Refus : une action étrangère à l'API, avec `-d '{"fromVersion":<n>,"selectedIds":["GET /notes","GET /admin/users"]}'`,
  affiche `HTTP/1.1 400` et `{"code":"INVALID_SELECTION","message":"This MCP's API has no such action."}`.
- [ ] Refus : un nom, une adresse d'API ou un accès amont dans la demande, avec par exemple
  `-d '{"fromVersion":<n>,"selectedIds":["GET /notes"],"baseUrl":"https://evil.example.com"}'` (puis avec
  `"mcpName":"autre-nom"`, puis avec `"upstreamAuth":{"type":"none"}`), affiche `HTTP/1.1 400` et
  `{"code":"INVALID_SELECTION","message":"Only the selection of actions can be changed."}`. La sélection
  `["GET /notes"]` n'est pas enregistrée non plus.
- [ ] Refus : la sélection de la version active, renvoyée telle quelle, affiche `HTTP/1.1 400` et
  `{"code":"INVALID_SELECTION","message":"This selection is already the active version."}`.
- [ ] Refus : la même demande valide avec le cookie de B (`-H 'Cookie: better-auth.session_token=<B>'`) affiche
  `HTTP/1.1 404` et `{"code":"NOT_FOUND","message":"Unknown MCP id."}`, exactement comme sur un identifiant inventé
  (`.../api/mcps/nexistepas/versions`). Le MCP de A ne change pas.
- [ ] Refus : la même demande sans cookie affiche `HTTP/1.1 401` et
  `{"code":"UNAUTHORIZED","message":"Sign in to continue."}`.
- [ ] Refus, deux onglets : ouvrir « Edit actions » du même MCP dans deux onglets. Dans le premier, changer une case et
  « Save ». Dans le second, changer une case et « Save » : l'écran affiche « This MCP changed in the meantime. Reload
  to see its current actions. », et « History » ne montre que la version du premier onglet. Recharger le second
  onglet : « Edit actions » revient, avec les cases de la version enregistrée par le premier.

**Un agent qui appelle une action retirée est invité à ouvrir une nouvelle conversation (WAT-147)**

- [ ] Partir d'un MCP dont la version active contient « List notes » et « Create a note », puis enregistrer une
  version qui ne garde que « List notes ». Appeler l'action retirée à l'adresse :
  `curl -s -X POST <adresse> -H 'content-type: application/json' -H 'accept: application/json, text/event-stream' -d '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"create_note","arguments":{}}}'`
  La réponse porte `"isError":true` et le texte « This action is no longer available in this MCP. Start a new
  conversation to get the current list of actions. »
- [ ] Le même message revient pour un nom qui n'a jamais existé (`"name":"drop_everything"`).
- [ ] Refus : l'API d'origine n'est pas appelée pour cette action. Preuve : le test « asks an agent calling an action
  the active version lacks to start a new conversation, without calling the API (contract 18, D7) »
  (`src/server/routes/hosted-mcp.test.ts`), qui branche un vrai client MCP sur une API simulée et vérifie qu'elle ne
  reçoit que l'appel de l'action gardée.
- [ ] Un appel de « List notes » (`"name":"list_notes"`) part normalement vers l'API (avec l'amorce, l'API
  `api.example.com` n'existe pas : l'erreur qui revient vient de l'appel réseau, pas du message ci-dessus).
- [ ] `docs/API.md` décrit `GET /api/mcps/:id/selection`, `POST /api/mcps/:id/versions` (la demande, la réponse, les
  refus 400, 401, 403, 404, 409 et 503) et le message d'une action retirée sous `ANY /m/:id` ; il ne dit plus
  qu'aucune modification n'est possible.

### Livraison 3 — Je reviens à une version précédente en un clic

**Préparer la recette**

- Lancer `pnpm dev`, ouvrir http://localhost:5173 et se connecter avec une adresse A (code par e-mail ; sans clé
  Resend, le code s'affiche dans le terminal de `pnpm dev`).
- Raccourci : l'amorce `.pilot/recette/amorce-restore.js`, collée dans la console du navigateur sur
  http://localhost:5173, ouvre une session pour `recette@slice.local`, reprend le MCP « Recette Notes » du compte (ou
  le crée), et s'assure qu'il a au moins deux versions dont la plus récente est l'active. Pour un MCP neuf : la
  version 1 coche « List notes » et « Create a note », la version 2 (active) « List notes » seule. Elle place la page
  sur son écran « History ». Recharger ensuite la page.
- Sans l'amorce : créer un MCP hébergé (« Deploy to SLICE Cloud ») depuis `fixtures/uat-deprecated.yaml` en cochant 2
  actions, puis « Edit actions » sur sa ligne de « My MCPs » : décocher l'une des deux et « Save ». Il a alors une
  version 1 (2 actions) et une version 2 active (1 action).
- Noter l'adresse du MCP (« My MCPs ») et, pour les vérifications en terminal, copier la valeur du cookie
  `better-auth.session_token` (outils du navigateur, onglet Application ou Stockage, Cookies, `http://localhost:5173`)
  et l'identifiant du MCP, la fin de son adresse après `/m/`.

Les exemples ci-dessous supposent un MCP neuf de l'amorce : version 2 active (1 action, « List notes »), version 1 de
2 actions. Avec un MCP passé plusieurs fois par l'amorce, remplacer « version 1 » par une version non active et
« version 2 » par la version active.

**Je restaure une version : elle redevient active, et l'agent la voit à sa prochaine conversation (WAT-148)**

- [ ] Sur « History », la version active (en tête, marquée « Active since <date> ») n'a pas de bouton « Restore ».
  Chaque autre version a le sien, à droite de sa ligne.
- [ ] Cliquer « Restore » sur « Version 1 » : sous le nom du MCP s'affiche exactement « Version 1 restored. Your agent
  sees these actions in its next conversation, with nothing to paste again. »
- [ ] Juste après : « Version 1 » porte « Active since <date du jour> » et n'a plus de bouton « Restore » ; « Version
  2 » n'a plus de marque « Active since » et montre à son tour « Restore ».
- [ ] Refus : aucune version n'est créée. « History » montre toujours le même nombre de versions, avec les mêmes
  numéros (« Version 2 » puis « Version 1 »). Recharger la page (Cmd+R) : même liste, « Version 1 » toujours active
  depuis la date du jour.
- [ ] Sur « My MCPs », la ligne du MCP affiche le nombre d'actions de la version 1 (« 2 actions » avec l'amorce), et
  son adresse est identique à celle notée avant.
- [ ] Lister les actions à l'adresse, dans un terminal :
  `curl -s -X POST <adresse> -H 'content-type: application/json' -H 'accept: application/json, text/event-stream' -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}'`
  La réponse contient exactement les actions de la version 1 (`list_notes` et `create_note` avec l'amorce), rien de
  plus. Dans Claude Desktop, une nouvelle conversation montre ces actions sans recoller l'adresse.
- [ ] Après la restauration de la version 1, ouvrir « Edit actions » : les cases cochées sont celles de la version 1
  (« List notes » et « Create a note »). Cocher « Delete a note » et « Save » : « Saved as version 3… » s'affiche. Dans
  « History », « Version 3 » est en tête, active, avec 3 actions : les 2 de la version 1 plus « Delete a note ».
- [ ] Refus : cliquer « Restore » sur la version déjà active est impossible (pas de bouton). Par l'API, la restaurer
  réussit sans rien changer : `curl -i -X POST http://localhost:3001/api/mcps/<identifiant>/versions/<numéro de la
  version active>/restore -H 'Cookie: better-auth.session_token=<valeur de A>'` affiche `HTTP/1.1 200` et
  `{"number":<numéro>,"activeSince":"<date>"}`, où la date est celle déjà affichée par « Active since » (et non
  l'heure de la commande). « History » ne montre aucune version de plus.
- [ ] Refus : double-cliquer « Restore » sur une version non active : le bouton se grise dès le premier clic, et une
  seule restauration part (un seul message « Version N restored… »). Preuve aussi par le test automatique « greys
  "Restore" during the call: a double click restores once (contract 25) » (`src/client/screens/history.test.tsx`).
- [ ] Un « Restore » et un « Save » envoyés au même instant ne laissent jamais deux versions actives : preuve par le
  test « never leaves two active versions when a "Restore" and a "Save" of the same MCP run at once »
  (`src/server/services/mcp-versions.test.ts`), qui tourne sur un vrai PostgreSQL dans la CI.

**Refus : on ne restaure qu'une version existante de son propre MCP (WAT-149)**

Dans les commandes ci-dessous, remplacer `<id>` par l'identifiant du MCP, `<A>` par la valeur du cookie de l'adresse A
(propriétaire du MCP), `<B>` par celle d'une adresse B (connectée en navigation privée). Après chaque refus,
« History » de A montre la même version active qu'avant, avec la même date.

- [ ] Le propriétaire restaure une version existante : `curl -i -X POST http://localhost:3001/api/mcps/<id>/versions/1/restore -H 'Cookie: better-auth.session_token=<A>'`
  affiche `HTTP/1.1 200` et `{"number":1,"activeSince":"<date>"}`.
- [ ] Refus : une version que le MCP n'a pas, par exemple `.../versions/99/restore` avec le cookie de A, affiche
  `HTTP/1.1 404` et `{"code":"NOT_FOUND","message":"Unknown version of this MCP."}`. De même pour
  `.../versions/latest/restore`.
- [ ] Refus : la même demande sur la version 1 avec le cookie de B (`-H 'Cookie: better-auth.session_token=<B>'`)
  affiche `HTTP/1.1 404` et `{"code":"NOT_FOUND","message":"Unknown MCP id."}`, exactement comme sur un identifiant
  inventé (`.../api/mcps/nexistepas/versions/1/restore`). Le MCP de A ne change pas.
- [ ] Refus : la même demande sans cookie affiche `HTTP/1.1 401` et
  `{"code":"UNAUTHORIZED","message":"Sign in to continue."}`.
- [ ] Refus : la même demande avec le cookie de A et `-H 'Origin: https://evil.example'` affiche `HTTP/1.1 403` et
  `{"code":"FORBIDDEN","message":"SLICE takes orders from its own page only."}`.
- [ ] `docs/API.md` décrit `POST /api/mcps/:id/versions/:number/restore` : l'absence de corps, la réponse et ses
  champs, la restauration de la version active qui ne change rien, et les refus 401, 403, 404 et 503.
