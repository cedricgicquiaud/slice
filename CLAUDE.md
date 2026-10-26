# SLICE — Curated MCP Servers for AI Agents

Générateur web de serveurs MCP (Model Context Protocol) sur-mesure depuis une spec OpenAPI.

## État du projet

**Pivot SLICE Cloud livré (2026-06-01)** — Le modèle "binaire double-clic" est abandonné (Gatekeeper). Modèle retenu et **implémenté** : SLICE héberge les MCP, livrable = **URL + snippet à coller dans l'agent**, token relayé (jamais stocké).

**Mergé sur main** : phases 01 → 10 (PR #1-13), hotfix #14, PR #15 (hyphenated params), puis **Pivots 1 → 4** :
- Pivot-1/2 — Track C self-host (écran 3 choix d'hébergement, bundle Docker).
- Pivot-3 — mode relai d'auth dans le code généré (`MCP_AUTH_MODE=relay`).
- **Pivot-4 (PR #20) — runtime MCP hébergé / SLICE Cloud** : `POST /api/host` range une config + renvoie une URL ; `ALL /m/:id` sert le MCP **stateless** (multi-session) et relaie le token. Guard SSRF. Front « Deploy to SLICE Cloud » → écran 4 URL + snippets mode URL. **Validé bout-en-bout dans Claude Desktop contre la vraie API Notion.**
- LEARN Pivot-4 : PR #21 (REVIEW + règle relai E2E).

**Body forwarding livré (PR #23, mergé 2026-06-01)** : le parser aplatit `requestBody` en params `in:'body'`, runtime hébergé + kit réassemblent et envoient le corps JSON (objets free-form transmis intacts via passthrough). **Recherche/création Notion validées en live.** 446 tests verts.

**Validation prod — corpus check (PR #23)** : `scripts/corpus-check.ts` passe N vraies specs d'APIs.guru dans le pipeline. Run 500 API : **412 ok, 83 rejets gracieux (62 OAuth), 5 too-big, 0 bug**. A surfacé 2 bugs corrigés (`\r` dans descriptions) + 1 finding PROD-CRITIQUE (OOM parser).

**Isolation mémoire du parsing livrée (PR #24, mergé 2026-06-01, D004)** : `parseSpec` tourne dans un **child_process** (timeout-kill primaire + cap mémoire + sémaphore de concurrence). Une spec « bombe »/DocuSign → erreur typée `PARSE_TOO_COMPLEX`/`PARSE_TIMEOUT` (422/504), **le serveur survit**. Saturation → 429 `PARSE_BUSY`. Le spike ORIENT a écarté worker_threads (résolution module cassée sous tsx). 459 tests verts.

**Build prod réparé (PR #26, mergé 2026-06-01)** — le binaire compilé ne démarrait jamais (4 bugs en cascade : imports ESM sans `.js` + alias `@shared`, route Express 5 `'*'`, `clientDist` faux, `typecheck` clobbant `dist`). Fix : `tsc` + `tsc-alias` (`tsconfig.server.build.json`, tests exclus) + `noEmit` au typecheck. **Garde-fou ajouté : `pnpm prod:smoke`** (boot du binaire compilé + health + statique + fallback SPA + upload réel via `parse-child.js` compilé). 459 tests verts. Détail : `.workflow/phases/fix-prod-build/REVIEW.md`.

**CI pré-release livrée (PR #28, mergé 2026-06-02)** — `ci.yml` = gate sur chaque PR + push main (corepack pnpm figé → install --frozen-lockfile → typecheck → test → `prod:smoke`, déterministe, zéro réseau). `corpus.yml` = corpus-check en `workflow_dispatch` à la demande (réseau/lent, hors flux PR ; `corpus-check` sort `exit(1)` sur vrai bug). pnpm figé : `packageManager: pnpm@9.13.2` + `engines.node >=22`. **Le gate a immédiatement attrapé un test non-CI-safe** (`mcp-generator.snapshot.test.ts` via `pnpm exec tsc` → install implicite cassant les symlinks ; fix : binaire `tsc` direct). 463 tests verts. Détail : `.workflow/phases/ci-pre-release/REVIEW.md`.

**OAuth amont (client_credentials) LIVRÉ — chantier complet mergé (PR #30/#32/#33/#34, 2026-06-02)**. SPEC : `.workflow/SPEC-OAUTH-UPSTREAM.md` ; REVIEW : `.workflow/phases/oauth/REVIEW.md` ; décision test : D005.
- **1a** — specs oauth2/OIDC acceptées (plus de `UNSUPPORTED_AUTH`) ; détection `client_credentials` → variant `oauth2 {tokenUrl, scopes}` ; autres flows + OIDC → `bearer` ; basic/digest seuls rejetés.
- **1b** — kit self-host : obtention/cache (marge 30s, TTL repli 300s)/refresh/retry-401 du token via client_secret_basic. **2 RCE HIGH** (injection via tokenUrl/scopes dans le code généré) trouvées en security-review et corrigées (JSON-encode + rejet Zod).
- **1c** — runtime hébergé : oauth2 relayé comme bearer (jamais de secret/token côté cloud).
- **1d** — affichage config + mesure corpus (**0 rejet OAuth** ; Stripe & co passent).
- Pattern promu (`01-conventions.md`) : données externes → `JSON.stringify` dans le code généré.

**Correctifs pré-lancement livrés (PR #37, mergé 2026-06-06)** : store hébergé persistant (fichier JSON sur disque, remplacé depuis par PostgreSQL — WAT-62) + snippet Claude Desktop au format `mcp-remote` via npx. 488 tests verts.

**Upload par URL (PR #38) et rapport fail-loud (PR #39) livrés (2026-06-06)** : coller une URL https de spec (SSRF-safe, `url-fetcher.ts`) ; approximations détectées par le normalizer (`schema_fallback`/`non_json_body`/`cookie_param`) et affichées à l'écran 3 (`GenerationReport`).

**Repositionnement produit (2026-07-22, PR #42/#43/#44)** : « l'hébergement est le produit » — voir la section datée de `.workflow/POSITIONING.md`. Pitch « Any API, in any agent, in 3 clicks » ; curation revendue **moindre privilège côté serveur** ; compteur de contexte rétrogradé en bonus (« Agent scope » en principal) ; self-host rétrogradé en option discrète (kit conservé) ; **expiration des URLs hébergées gratuites** (`SLICE_HOSTED_TTL_HOURS`, défaut 72 h, 0 = désactivé — self-host) : 410 + purge sur `/m/:id`, `expiresAt` dans `/api/host`, CTA mailto « Get a permanent plan » à l'écran 4. Pas de billing tant que la demande n'est pas validée par de vrais contacts. Au passage : restauration du `GenerationReport` supprimé par accident par la refonte ui-polish. 548 tests verts.

**Comptes (PR #63, mergé 2026-10-25)** : connexion obligatoire pour tout SLICE (Google, Microsoft ou code e-mail, Better Auth, aucun mot de passe) ; chaque MCP appartient à un compte. **L'expiration ci-dessus est débranchée** : aucun MCP ne périme tant qu'il n'y a pas de facturation (code gardé, `SLICE_HOSTED_TTL_HOURS` ignorée). En production, `BETTER_AUTH_SECRET` et `BETTER_AUTH_URL` sont obligatoires.

**Prochaine étape** : mise en ligne sur VPS Coolify (env : `DATABASE_URL` — PostgreSQL, obligatoire en production —, `SLICE_HOSTED_TTL_HOURS`, `NODE_ENV=production`).

**Outils** : `scripts/try-hosted.ts` (tester un MCP hébergé en CLI) ; `scripts/corpus-check.ts [N]` (stress N specs réelles — aussi en CI via `corpus.yml` à la demande).

**Dette ouverte (BACKLOG, par impact prod)** : 1) **OAuth amont** (plus gros levier de couverture API), 2) matrice de features (levier A), 3) rapport fail-loud (levier C), unification contrat d'erreur, cache McpServer (perf), DNS-rebinding, persistance store, snippet Claude Desktop.

**Anciens jalons (à re-prioriser)** : `.workflow/phases/11-security-backend/`, `12-a11y-responsive/`, `13-polish-docs/`.

Détails sessions précédentes : `.workflow/sessions/`.

Roadmap globale : `.workflow/phases/COVERAGE.md` (à mettre à jour pendant la phase SPEC).
Positionnement marché : `.workflow/POSITIONING.md` (Speakeasy = concurrent #1, différenciateur = UX non-tech).
Détails sessions précédentes : `.workflow/sessions/`.

## Stack

### Frontend
- **React 18+** avec **Vite** (build rapide, HMR)
- **TypeScript** (strict mode)
- **Tailwind CSS** (styling, prérequis shadcn)
- **shadcn/ui** (composants UI — copiés dans le repo, basés sur Radix UI)
- **react-dropzone** (upload de fichiers)
- **Zod** (validation des formulaires)
- **Lucide React** (icônes, livré nativement avec shadcn)
- **react-hook-form** (gestion des formulaires, recommandé avec shadcn + Zod)

### Backend
- **Node.js** (LTS) + **TypeScript** (strict mode)
- **Express** (framework HTTP, monolithe qui sert front statique + API)
- **swagger-parser** (parsing OpenAPI safe)
- **handlebars** (templating du code généré — décision D001)
- **swagger2openapi** (conversion auto Swagger 2.0 → OpenAPI 3.0)
- **postman-to-openapi** (conversion auto Postman Collection v2 → OpenAPI 3.0)
- **archiver** (création des ZIP)
- **express-rate-limit** (protection upload/generate)

### Code MCP généré
- **@modelcontextprotocol/sdk** (SDK Node officiel)
- **zod** (validation des inputs des tools)
- Transports supportés : **stdio** (Claude Desktop, Cursor, Windsurf) + **HTTP Streamable** (n8n, Airia)

### Tests
- **Vitest** (unit + integration)
- Tests E2E à arbitrer en SPEC si nécessaires

### Build & deploy
- **pnpm** (package manager)
- Déploiement : à trancher en SPEC (Vercel/Netlify serverless vs Coolify/VPS)

## Decisions (issues du PRD FIND validé)

### Produit
- **MVP = UI web seule**. Pas de CLI, SDK ou API publique au lancement. Roadmap V1.5+.
- **3 étapes maximum** dans le flux utilisateur (upload → sélection → configuration + génération).
- **Vocabulaire humain obligatoire** dans l'UI (pas de jargon technique visible). Tooltips pour les power users.
- **Auto-détection prioritaire** : tout ce qui peut être deviné depuis la spec OpenAPI (nom, URL de base, type d'auth) doit l'être.

### Technique
- **Langage du MCP généré : TypeScript only en MVP**. Python prévu en V1.5.
- **Transports : stdio + HTTP Streamable** dès le MVP (non négociable, Airia/n8n l'exigent).
- **Auth descendante (agent → MCP HTTP)** : Bearer token simple via variable d'env `MCP_SERVER_TOKEN`.
- **Auth amont (MCP → API)** : None / API Key / Bearer en MVP. Basic Auth et OAuth2 reportés en V1.5.
- **Architecture monolithe Express** en MVP (sert front + API). Refactor API-first en V1.5.
- **Pas de base de données**. Stateless, stockage éphémère uniquement.
- **Compteur de contexte économisé** affiché dans l'UI (sert de critère de succès mesurable + argument visible).

### Sécurité
- Limite upload stricte 10MB
- Parsing OpenAPI safe (pas de `$ref` externes, timeout 5s, limite de profondeur)
- Parser YAML safe (pas d'évaluation de tags arbitraires)
- Rate limiting `/api/upload` et `/api/generate` (30 req/min/IP)
- Pas de stockage des specs uploadées au-delà de la génération
- Pas d'exécution de code depuis la spec

### Business
- **Modèle économique pressenti : open core**. SLICE gratuit pour générer + télécharger. Monétisation via offre "SLICE Hosted" (héberge les MCPs générés pour l'utilisateur). À valider en SPEC.
- **Pas de moteur IA dans le MVP**. IA en option payante envisagée en V2+ (suggestion d'endpoints, amélioration de descriptions).

### Positionnement marché
- UX premium de sélection + dual transport (stdio + HTTP) out-of-the-box + pensé pour workflows agents cloud (n8n, Airia).
- Pas de bataille frontale sur le multi-langage (terrain Stainless racheté par Anthropic en mai 2026).

## Commandes

```bash
# Développement (front + back en parallèle)
pnpm dev

# Front seul (Vite, port 5173)
pnpm dev:client

# Back seul (Express, port 3001)
pnpm dev:server

# Build de production
pnpm build              # front + back
pnpm build:client       # front seul
pnpm build:server       # back seul

# Production (après build)
pnpm start

# Tests
pnpm test               # une fois
pnpm test:watch         # mode watch
pnpm test:ui            # interface graphique

# TypeScript check
pnpm typecheck

# Ajouter un composant shadcn
pnpm dlx shadcn@latest add <component>
```

## Structure

```
SLICE/
├── src/
│   ├── client/              # Frontend React
│   │   ├── components/ui/   # Composants shadcn/ui
│   │   ├── hooks/           # Custom React hooks
│   │   ├── lib/             # Utils (cn pour shadcn)
│   │   ├── App.tsx
│   │   ├── main.tsx
│   │   ├── index.css        # Tailwind v4 + thème shadcn
│   │   ├── test-setup.ts    # Setup Vitest
│   │   └── vite-env.d.ts    # Types Vite + déclarations CSS
│   ├── server/              # Backend Express
│   │   ├── routes/          # Route handlers (upload, generate)
│   │   ├── services/        # Logique métier (parser, generator)
│   │   ├── templates/       # Templates Handlebars (code MCP généré)
│   │   └── index.ts         # Entrée serveur Express
│   └── shared/              # Code partagé front/back (types, schémas Zod)
├── public/                  # Assets statiques
├── docs/                    # Documentation interne (API.md)
├── .workflow/               # Documents projet (PRD, SPEC, historique des phases)
│   └── visuals/             # Références visuelles fournies en SPEC
├── dist/                    # Output de build (gitignored)
│   ├── client/              # Build front
│   └── server/              # Build back
├── components.json          # Config shadcn/ui
├── vite.config.ts           # Config Vite (front)
├── vitest.config.ts         # Config Vitest (tests)
├── tsconfig.json            # Config TS racine (références)
├── tsconfig.app.json        # Config TS client
├── tsconfig.server.json     # Config TS server
├── tsconfig.node.json       # Config TS pour vite.config.ts
├── index.html               # Entry HTML Vite
├── package.json
└── pnpm-lock.yaml
```

## Architecture

- **Monolithe Express** : un seul serveur qui sert le front statique (en prod) et expose l'API
- **En dev** : Vite (port 5173) + Express (port 3001) en parallèle, proxy Vite `/api/*` → Express
- **En prod** : Express sert `dist/client/` + ses propres routes `/api/*`
- **Aliases TypeScript** : `@/*` → `src/client/*`, `@shared/*` → `src/shared/*`

## Liens utiles

- Documentation publique : `docs/` (la spec MVP de mai 2026 est dans l historique git)
- PRD validé : [.workflow/PRD.md](.workflow/PRD.md)
- Règles projet : `.claude/rules/` (workflow FORGE retiré le 2026-08-27 ; circuit de développement : dépôt `AlanZien/pilot`)

## Pilot

_Configuration de ce projet. Les règles de la méthode vivent dans la skill `pilot` ; ici,_
_seulement ce qui est propre à ce dépôt._

**Posé par `init`** (23/10/2026)

- Workspace Linear : `gm5` (connexion MCP `linear` ; clé `~/.config/pilot/linear-gm5.env`)
- Team : `WATIDO` — clé `WAT` — id `0d728832-ef31-4986-8655-1c0b068624e7`.
  SLICE n'a pas sa propre team (plan gratuit limité à 2) : ses features sont des projets
  Linear de WATIDO, préfixés « SLICE — ».
- Agents en parallèle : `1`
- Barème et capacité : `.pilot/calibration.md`
- PRD : `.pilot/PRD.md` (fait foi sur les sections « État du projet » et « Decisions »
  ci-dessus, en partie périmées) ; vocabulaire : `CONTEXT.md`
- Cahier de recette : `UAT.md` à la racine, lié depuis chaque feature
- Direction visuelle : `.pilot/design.md` (système existant, `src/client/index.css`)

**Selon le projet**

- Lancer l'app : `pnpm dev` (front http://localhost:5173, API http://localhost:3001)
- Testeur : `passe visuelle automatisée`
- Amorce de recette : `.pilot/amorce-recette.js` — ouvre une session pour `recette@slice.local` par `POST /api/dev/sign-in` (route montée seulement si `NODE_ENV` vaut `development` ou `test`) ; l'outil recharge ensuite la page (à la main : console du navigateur, puis recharger)
- Échéance : 2027-01-15 — date de la certification de développeur

**Le contrat de ce projet** : aucun développement sans fiche Linear ; rien n'est créé dans
Linear sans liste validée. Dépôt public : aucune idée stratégique ni secret dans le dépôt.

## Idiomes de code

_Leçons des audits, ajoutées par `sync` après validation. Chaque agent les applique._

- **503 `SERVICE_UNAVAILABLE` seulement pour une base injoignable** (erreurs de connexion
  `pg` 57P01 / 08xxx, `ECONNREFUSED`, `ETIMEDOUT`). Toute autre erreur de stockage part en
  500 via `next(err)` : un bug ne doit pas se faire passer pour une panne. *(audit PR #58)*
- **Un test qui démarre le serveur le lance depuis la racine du dépôt** (`cwd`), comme
  `pnpm dev` : ailleurs, le processus enfant d'analyse ne trouve pas `tsx`. *(PR #58)*
- **Tant que rien n'est en ligne, le schéma tient en une seule migration** : on régénère
  la migration au lieu d'en empiler une par contrainte. Une fois déployé, on n'en réécrit
  plus aucune. *(PR #58)*
- **`/api/auth/*` ne passe pas par `requireSameOrigin`** : ces routes (Better Auth) sont
  montées avant la garde dans `app.ts`. Leur protection d'origine est celle de Better Auth,
  forcée en production (WAT-112) mais éteinte ailleurs sous `NODE_ENV=test` ou `TEST`
  posée — donc dans Vitest. Une route d'écriture neuve sous `/api/auth` se prouve contre une
  origine étrangère avec `nodeEnv: 'production'` (`auth/origin-check.test.ts`). *(audit PR #65)*
- **Un bouton qui déclenche une action définitive se grise pendant l'appel** (suppression,
  envoi) : un double clic ne doit envoyer qu'une demande. *(audit PR #65)*
- **Un fichier de test qui démarre une base appelle `vi.setConfig(DATABASE_TEST_TIMEOUTS)`**
  (30 s pour les tests et les hooks, `db/test-database.ts`) : sous charge, les 5 s par
  défaut sautent au hasard. `db/test-timeouts.test.ts` refuse un fichier qui l'oublie.
  *(audit PR #65, WAT-113)*
- **Un test qui démarre un programme (le serveur, un MCP généré) passe par
  `startTestProcess` / `stopTestProcess`** (`test-processes.ts`), jamais par `spawn` : `tsx`
  lance le vrai programme dans un enfant à lui, et l'arrêter seul laisse cet enfant tourner
  sans parent (624 le 26/10, qui ralentissaient la machine et faisaient expirer les tests).
  `test-spawn-guard.test.ts` refuse un fichier qui appelle `spawn`. *(WAT-152)*
- **Une liste d'actions s'écrit en base par paquets de 1 000 lignes, ou en un seul
  `insert … select` quand les lignes viennent déjà de la base** : PostgreSQL refuse plus de
  65 535 paramètres par requête. *(audit PR #70 et #71)*

## Idiomes d'interface

_Remarques visuelles faites au merge, ajoutées par `sync` après validation._

- **Une page hors du parcours en 3 étapes** (« My MCPs », suppression du compte)
  **n'affiche pas les étapes en haut** : `Topbar` reçoit `current={null}`. *(merge PR #64)*
- **SLICE se conçoit pour l'ordinateur ; le téléphone n'est pas une cible.** Générer un MCP
  ne se fait pas au téléphone : la passe visuelle ne relève pas les défauts à 375 px.
  *(décision du 2026-10-26, merge PR #71)*
