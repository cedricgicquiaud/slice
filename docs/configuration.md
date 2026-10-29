# Configuration and deployment

This page covers the environment variables SLICE reads, how to run it in production, and how to run the MCP server
kit it generates. Everything here reflects what the code supports today.

## SLICE server

### Environment variables

The server reads its configuration from the process environment. In development, `pnpm dev` (through
`pnpm dev:server`) also reads a `.env` file at the repository root when there is one: copy `.env.example`, which
lists the variables without values, and fill in what you need. A variable already set in the environment wins over
`.env`, and an empty one keeps its default. `.env` is never committed. `pnpm start` and the tests never read it:
in production, set the variables in the platform's settings.

| Variable | Default | Effect |
|---|---|---|
| `PORT` | `3001` | HTTP port the server listens on. |
| `NODE_ENV` | `development` | `production` serves the built front end from `dist/client` (with a single-page-app fallback) and turns on the SSRF guard for hosted MCPs (`config.baseUrl` in `POST /api/host`, and every hosted tool call). Any other value leaves that guard off so a local upstream can be reached. The value is also reported by `GET /api/health`. `pnpm start` sets it to `production`. |
| `DATABASE_URL` | (none) | PostgreSQL connection string (`postgres://user:password@host:5432/database`) where hosted MCPs are stored. **Required when `NODE_ENV=production`**: without it the server refuses to start and says why. Elsewhere, leaving it unset uses the embedded database below. |
| `BETTER_AUTH_SECRET` | (none) | Signs the session cookies of SLICE accounts. **Required when `NODE_ENV=production`**: without it the server refuses to start and says why. Use a long random value (`openssl rand -hex 32`), kept in the platform's secret settings. Elsewhere, Better Auth falls back to a public development secret. |
| `BETTER_AUTH_URL` | `http://localhost:5173` outside production; (none) in production | SLICE's public address (`https://slice.example.com`, or the Vite page in development). Better Auth builds its sign-in links from it, and the API takes writes only from a page at this address or at the address the request reached (`403 FORBIDDEN` otherwise, see [API.md](API.md#authentication)). **Required when `NODE_ENV=production`**: without it the server refuses to start and says why, since behind a proxy that ends HTTPS the server sees `http://` requests and would refuse the `https://` page. In production it must also start with `https://`: an `http://` one stops the server at start-up, since the MCPs' addresses start with it. An `https://` address makes the session cookie `Secure`. |
| `SLICE_ENCRYPTION_KEY` | (none) | Encrypts the API keys saved for MCPs (AES-256-GCM) before they reach the database. **Required whatever `NODE_ENV`**, development included: without it, or with a value that is not 32 bytes in base64, the server refuses to start and names it. Generate one with `openssl rand -base64 32` and keep it in the platform's secret settings; the repository holds none, and the tests draw their own at random. Changing it makes every saved key unreadable: SLICE never decrypts one into a wrong value. |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | (none) | The Google application SLICE signs in with ([oauth-apps.md](oauth-apps.md)). With both set, "Continue with Google" works; without them, the server offers no Google sign-in. |
| `MICROSOFT_CLIENT_ID`, `MICROSOFT_CLIENT_SECRET` | (none) | The Microsoft application SLICE signs in with, personal and work or school accounts ([oauth-apps.md](oauth-apps.md)). Same rule as Google. |
| `RESEND_API_KEY` | (none) | Sends the sign-in codes by email through [Resend](https://resend.com). Without it, the code of each request is printed in the server's terminal (`Sign-in code for <address>: <code>`) and no email leaves: fine on a developer's machine, not for real users. |
| `RESEND_FROM` | `SLICE <onboarding@resend.dev>` | Sender of the sign-in emails, on a domain verified with Resend (`SLICE <codes@example.com>`). Resend's default test sender only delivers to the Resend account's own address. |
| `SLICE_DATA_DIR` | `./data` | Without `DATABASE_URL` only: folder of the embedded PostgreSQL (PGlite, nothing to install), kept in its `pglite/` subfolder. Resolved from the working directory; created if missing. |
| `SLICE_HOSTED_TTL_HOURS` | (ignored) | Ignored: a hosted MCP never expires, whatever this value (see [Persistent data](#persistent-data)). |
| `PARSE_MAX_CONCURRENT` | `3` | Maximum number of spec parses running at the same time (minimum 1). Each parse is a child process with a 512 MB heap cap, so peak parse memory is about this value × 512 MB. |
| `PARSE_MAX_QUEUE` | `12` | Maximum number of parses waiting for a slot (minimum 0). Requests beyond it get `429 PARSE_BUSY`. |

The SSRF guard on `POST /api/upload-url` is always on, whatever `NODE_ENV` is.

The parse child process does not inherit the server environment. It receives only `PATH`, `HOME`, `NODE_ENV` and an
empty `NODE_OPTIONS`, so a `NODE_OPTIONS` set for the server (for example `--max-old-space-size`) does not affect parsing.

Fixed limits that are not configurable: 10 MB per API description, 15 MB request body for `/api/generate` and
`/api/host`, 200 000 nodes per spec, 8-second parse timeout, 30-second generation timeout,
30 requests per minute per IP on `/api/*`. See [API.md](API.md).

### Running in production

Requirements: Node.js 22 or later, pnpm 9.

```bash
pnpm install          # full install: the build tools and the MCP SDK used by the hosted runtime are devDependencies
pnpm build            # front end to dist/client, server to dist/server/server (templates and migrations copied alongside)
DATABASE_URL=postgres://… BETTER_AUTH_SECRET=… BETTER_AUTH_URL=https://… SLICE_ENCRYPTION_KEY=… pnpm start   # NODE_ENV=production node dist/server/server/index.js
```

- Provide a PostgreSQL database through `DATABASE_URL`; the server refuses to start in production without one. Keep its
  password in the platform's secret settings, never in the repository. Same for `BETTER_AUTH_SECRET` and
  `SLICE_ENCRYPTION_KEY`.
- At startup the server creates or updates its tables before it accepts any request. The migrations run under a
  PostgreSQL lock, so several instances starting together migrate only once. If they fail, the server refuses to start
  and prints the database's reason.
- Run `pnpm start` from the repository root: the parse child process resolves from the working directory.
- `pnpm prod:smoke` builds the project, boots the compiled server on port 3099 (or `PORT`), runs a set of checks against
  the real production paths, and stops it. `SKIP_BUILD=1 pnpm prod:smoke` reuses an existing `dist/`. It starts the
  server in production mode, so it needs `DATABASE_URL` too. It creates a throwaway database on that server, runs the
  compiled server against it and drops it afterwards: the database user needs the right to create databases, and the
  smoke connector never lands in the database the URL names. It signs a throwaway account in on that database, since
  the API answers nothing without a session, and hands the server a `SLICE_ENCRYPTION_KEY` drawn at random. A disposable local PostgreSQL works:
  `docker run --rm -d -p 54329:5432 -e POSTGRES_PASSWORD=smoke postgres:16`, then
  `DATABASE_URL=postgres://postgres:smoke@localhost:54329/postgres pnpm prod:smoke`.
- The repository's `Dockerfile` builds SLICE like `pnpm build` and starts it like `pnpm start`, listening on 3001. It
  holds no secret and needs no build argument: `DATABASE_URL`, `BETTER_AUTH_SECRET`, `SLICE_ENCRYPTION_KEY` and the
  other settings are given when the container starts.

### Persistent data

Hosted MCPs live in the database: one row per MCP in `connectors`, one row per selected endpoint in
`connector_actions`, both written in a single transaction. They hold no credentials and not the API description (see
[API.md](API.md#post-apihost) for what is stored). Several server instances can share the same database.

- **Production:** the PostgreSQL of `DATABASE_URL`. Hosted URLs survive restarts and redeploys.
- **Development and tests:** without `DATABASE_URL`, `pnpm dev` uses PGlite on disk under `SLICE_DATA_DIR`, and
  `pnpm test` uses a fresh in-memory PGlite per test file. Nothing to install.

No expiry: a hosted MCP is served whatever its age, and no cleanup deletes it, neither at startup nor later.

Accounts and their sessions live in the same database (`users`, `sessions`, `accounts`, `verifications`, managed by
Better Auth; no password column). An account rests on a verified email address: a Google or Microsoft address the provider did not verify creates no account and opens none. One verified address is one account, whichever way its owner signs in. Every `/api/*` route except `GET /api/health`, Better Auth's own `/api/auth/*` and,
when `NODE_ENV` is `development` or `test`, `POST /api/dev/sign-in` answers `401 UNAUTHORIZED` without a live session.

When the database is unreachable, the server stays up: every API call that checks the session fails with
`503 SERVICE_UNAVAILABLE`, creating a hosted MCP fails with `503 SERVICE_UNAVAILABLE`,
an existing hosted URL answers `503` (never "unknown"), and `GET /api/health` answers `503`. Everything works again as
soon as the database is back, without a restart.

### Running behind a reverse proxy

SLICE expects **one** reverse proxy in front of it (in production, Coolify's), which ends HTTPS and forwards plain
`http` requests. It trusts that proxy, and that proxy only (Express `trust proxy` set to one hop):

- **Each visitor is counted on their own address**, for the 30 requests a minute on `/api/*` and for the ten sign-in
  codes an hour per IP. That address is the **last** one of `X-Forwarded-For`, the one the proxy adds. Whatever the
  visitor wrote in that header before it is ignored: a forged `X-Forwarded-For` neither frees a visitor from their
  quotas nor spends another visitor's. The proxy must add the client's address at the end of the header (append) or
  replace the header with it; either way the last address is the client's.
- **The address of a hosted MCP starts with `BETTER_AUTH_URL`**: `POST /api/host` returns, and `GET /api/mcps`
  lists, `https://slice.example.com/m/<id>` for `BETTER_AUTH_URL=https://slice.example.com` (a trailing slash in it
  is dropped). Neither the `http` the proxy forwards nor a `Host` header written by the visitor changes it. Outside
  production, with `BETTER_AUTH_URL` unset, it starts with the address the request reached.

Without a proxy, or behind two, the last address of `X-Forwarded-For` is not one the proxy wrote: a visitor reaching
SLICE directly writes it themselves. Do not publish SLICE's port; let the one proxy be the only way in.

In development, the Vite page relays `/m/<id>` to the API server as it relays `/api`: an MCP address on
`http://localhost:5173` answers.

### Development scripts

These variables are read only by the helper scripts in `scripts/`, not by the server.

| Variable | Script | Default | Effect |
|---|---|---|---|
| `PORT` | `scripts/prod-smoke.ts` | `3099` | Port for the compiled server under test. |
| `SKIP_BUILD` | `scripts/prod-smoke.ts` | unset | `1` skips `pnpm build` and reuses `dist/`. |
| `CORPUS_MAX_BYTES` | `scripts/corpus-check.ts` | 10 MB | Skips corpus specs larger than this size. |
| `NOTION_TOKEN`, `API_TOKEN` | `scripts/try-hosted.ts` | unset | Upstream token sent as `Authorization: Bearer` to a hosted MCP (the first one set wins). |

## Generated kit

`POST /api/generate` returns a TypeScript MCP server for self-hosting. Its file list is in
[mcp-template.md](mcp-template.md#bundle-contents).

### Environment variables

The kit loads `.env` at startup (`dotenv`). `.env.example` contains only the variables relevant to the chosen
auth type and mode.

| Variable | Default | Effect |
|---|---|---|
| `UPSTREAM_BASE_URL` | (none) | Required. Base URL of the upstream API; pre-filled in `.env.example`. The server refuses to start without it. |
| `MCP_AUTH_MODE` | `env` | `env`: the upstream credential comes from the variables below, and HTTP clients must present `MCP_SERVER_TOKEN`. `relay`: the HTTP caller's own `Authorization: Bearer <token>` is forwarded to the upstream API for that request and never stored; no `MCP_SERVER_TOKEN` is checked. |
| `UPSTREAM_API_KEY` | (none) | API-key upstreams. Sent in the header chosen at generation time. Required in `env` mode. |
| `UPSTREAM_BEARER_TOKEN` | (none) | Bearer upstreams. Sent as `Authorization: Bearer <value>`. Required in `env` mode. |
| `UPSTREAM_OAUTH_CLIENT_ID`, `UPSTREAM_OAUTH_CLIENT_SECRET` | (none) | OAuth2 upstreams. Used for the client_credentials grant against the token URL chosen at generation time. Required in `env` mode. |
| `MCP_SERVER_TOKEN` | Pre-filled in `.env.example` | HTTP transport, `env` mode: agents must send `Authorization: Bearer <value>`, otherwise `401`. Required in that case. |
| `MCP_HTTP_PORT` | `8787` | Port of the HTTP transport. |
| `MCP_TRANSPORT` | `stdio` | Only for bundles generated with `mode: "both"`: `http` starts the HTTP transport instead of stdio. |

To create a new `MCP_SERVER_TOKEN`, any long random string works; for example `openssl rand -hex 16`.

In `relay` mode the kit's HTTP endpoint has no access control of its own. Only expose it where the URL itself is
kept private, or behind your own authentication.

### Running the kit

With Node.js (the kit's README uses pnpm; npm works the same way):

```bash
cp .env.example .env   # then fill in the credentials
npm install
npm run build
npm start              # node dist/index.js
```

With Docker:

```bash
cp .env.example .env   # then fill in the credentials
docker compose up -d   # builds the image and listens on port 8787
```

The image is a two-stage `node:20-alpine` build that runs `node dist/index.js` with production dependencies only.
To deploy on a platform that builds from a Dockerfile (Coolify, Railway, Render and similar), point it at the
bundle's `Dockerfile` and set the same variables in the platform instead of a `.env` file.

Notes:

- `docker-compose.yml` maps port `8787:8787`. If you change `MCP_HTTP_PORT`, change the port mapping too.
- A bundle generated with `mode: "both"` starts on stdio unless `MCP_TRANSPORT=http` is set, which a container
  usually needs. Bundles generated from the web UI use `mode: "remote"` (HTTP only).
- Agents connect over MCP Streamable HTTP to `http://<host>:8787` and, in `env` mode, send `Authorization: Bearer <MCP_SERVER_TOKEN>`.
