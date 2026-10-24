# Configuration and deployment

This page covers the environment variables SLICE reads, how to run it in production, and how to run the MCP server
kit it generates. Everything here reflects what the code supports today.

## SLICE server

### Environment variables

The server reads its configuration from the process environment only. It does not load a `.env` file.

| Variable | Default | Effect |
|---|---|---|
| `PORT` | `3001` | HTTP port the server listens on. |
| `NODE_ENV` | `development` | `production` serves the built front end from `dist/client` (with a single-page-app fallback) and turns on the SSRF guard for hosted MCPs (`config.baseUrl` in `POST /api/host`, and every hosted tool call). Any other value leaves that guard off so a local upstream can be reached. The value is also reported by `GET /api/health`. `pnpm start` sets it to `production`. |
| `DATABASE_URL` | (none) | PostgreSQL connection string (`postgres://user:password@host:5432/database`) where hosted MCPs are stored. **Required when `NODE_ENV=production`**: without it the server refuses to start and says why. Elsewhere, leaving it unset uses the embedded database below. |
| `SLICE_DATA_DIR` | `./data` | Without `DATABASE_URL` only: folder of the embedded PostgreSQL (PGlite, nothing to install), kept in its `pglite/` subfolder. Resolved from the working directory; created if missing. |
| `SLICE_HOSTED_TTL_HOURS` | `72` | Lifetime of a hosted MCP URL, in hours. `0` disables expiry (useful for a private self-hosted instance). A negative or non-numeric value falls back to `72`. An expired MCP is kept 30 more days, then deleted (see [Persistent data](#persistent-data)). |
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
DATABASE_URL=postgres://… pnpm start   # NODE_ENV=production node dist/server/server/index.js
```

- Provide a PostgreSQL database through `DATABASE_URL`; the server refuses to start in production without one. Keep its
  password in the platform's secret settings, never in the repository.
- At startup the server creates or updates its tables before it accepts any request. The migrations run under a
  PostgreSQL lock, so several instances starting together migrate only once. If they fail, the server refuses to start
  and prints the database's reason.
- Run `pnpm start` from the repository root: the parse child process resolves from the working directory.
- `pnpm prod:smoke` builds the project, boots the compiled server on port 3099 (or `PORT`), runs a set of checks against
  the real production paths, and stops it. `SKIP_BUILD=1 pnpm prod:smoke` reuses an existing `dist/`. It starts the
  server in production mode, so it needs `DATABASE_URL` too. It creates a throwaway database on that server, runs the
  compiled server against it and drops it afterwards: the database user needs the right to create databases, and the
  smoke connector never lands in the database the URL names. A disposable local PostgreSQL works:
  `docker run --rm -d -p 54329:5432 -e POSTGRES_PASSWORD=smoke postgres:16`, then
  `DATABASE_URL=postgres://postgres:smoke@localhost:54329/postgres pnpm prod:smoke`.
- The repository ships no Dockerfile for SLICE itself.

### Persistent data

Hosted MCPs live in the database: one row per MCP in `connectors`, one row per selected endpoint in
`connector_actions`, both written in a single transaction. They hold no credentials and not the API description (see
[API.md](API.md#post-apihost) for what is stored). Several server instances can share the same database.

- **Production:** the PostgreSQL of `DATABASE_URL`. Hosted URLs survive restarts and redeploys.
- **Development and tests:** without `DATABASE_URL`, `pnpm dev` uses PGlite on disk under `SLICE_DATA_DIR`, and
  `pnpm test` uses a fresh in-memory PGlite per test file. Nothing to install.

Expiry and cleanup:

- An expired hosted URL answers `410` at every visit; its MCP stays in the database for **30 days** after expiring.
- A cleanup deletes the MCPs expired for more than 30 days, with their endpoints, even if their URL is never visited
  again. It runs at startup, then **every hour**. With `SLICE_HOSTED_TTL_HOURS=0`, nothing expires and nothing is deleted.

When the database is unreachable, the server stays up: creating a hosted MCP fails with `503 SERVICE_UNAVAILABLE`,
an existing hosted URL answers `503` (never "unknown"), and `GET /api/health` answers `503`. Everything works again as
soon as the database is back, without a restart.

### Running behind a reverse proxy

The app does not configure Express `trust proxy`. Behind a TLS-terminating reverse proxy this has two effects:

- The rate limit counts every client under the proxy's IP address, so all users share one 30 requests-per-minute budget.
- `POST /api/host` builds the returned URL from the request protocol and `Host` header, so it returns `http://` URLs
  even when the public site is served over HTTPS.

Account for both when exposing an instance publicly.

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
