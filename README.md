# SLICE

**Turn any API description into an MCP server that exposes only the endpoints your AI agent is allowed to call.**

[![Project Status: WIP](https://www.repostatus.org/badges/latest/wip.svg)](https://www.repostatus.org/#wip)
[![CI](https://github.com/cedricgicquiaud/slice/actions/workflows/ci.yml/badge.svg)](https://github.com/cedricgicquiaud/slice/actions/workflows/ci.yml)
[![License: FSL-1.1-MIT](https://img.shields.io/badge/license-FSL--1.1--MIT-blue.svg)](LICENSE.md)

![Endpoint selection: tick what the agent may call](docs/screenshots/2-select.png)

## Overview

AI agents (Claude, Cursor, n8n…) reach external APIs through MCP connectors. Exposing a whole API to an agent
grants it too much power and floods its context: an agent that only reads orders has no reason to be able to
delete them. Existing generators target developers (CLI, config files).

SLICE is a web service: upload an API description, tick the endpoints the agent may call, and get a connector.
Anything left unticked does not exist for the agent.

| Upload | Configure |
|---|---|
| ![Upload an API description](docs/screenshots/1-upload.png) | ![Name, upstream auth and hosting, with the context saved](docs/screenshots/3-configure.png) |

## Features

- **Least privilege by construction** — the generated server exposes the selected endpoints only.
- **Three input formats**, detected automatically:

  | Format | Versions | Handling |
  |---|---|---|
  | OpenAPI | 3.0, 3.1 | Used as is |
  | Swagger | 2.0 | Converted to OpenAPI 3.0 |
  | Postman Collection | v2.x | Converted to OpenAPI 3.0 |

- **Two delivery modes** — download the generated TypeScript server, or use a hosted URL to paste into the agent.
- **Upstream authentication** — OAuth2 client credentials, bearer token, API key. In hosted mode the user's token
  is relayed, never stored.
- **Works with any MCP client** — stdio and Streamable HTTP transports.

## Getting started

Requires Node.js 22+ and pnpm 9+. No API key needed.

```bash
git clone https://github.com/cedricgicquiaud/slice.git
cd slice && pnpm install
pnpm dev        # http://localhost:5173
```

`pnpm test` runs the test suite; `pnpm build && pnpm start` runs the production build.

No database to install for development: without `DATABASE_URL`, hosted connectors are kept in an embedded PostgreSQL
(PGlite) under `./data` (`SLICE_DATA_DIR`), and each test file gets its own in-memory one. In production
(`NODE_ENV=production`), `DATABASE_URL` must point to a PostgreSQL database; the server refuses to start without it.

A free hosted URL expires after 72 hours (`SLICE_HOSTED_TTL_HOURS`, `0` = never) and then answers "expired". Its
connector is kept 30 more days, then a cleanup that runs at startup and every hour deletes it. All variables:
[docs/configuration.md](docs/configuration.md).

## Architecture

![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white)
![React 19](https://img.shields.io/badge/React_19-20232A?logo=react&logoColor=61DAFB)
![Vite](https://img.shields.io/badge/Vite-646CFF?logo=vite&logoColor=white)
![Tailwind CSS v4](https://img.shields.io/badge/Tailwind_CSS_v4-06B6D4?logo=tailwindcss&logoColor=white)
![Express 5](https://img.shields.io/badge/Express_5-000000?logo=express&logoColor=white)
![Zod](https://img.shields.io/badge/Zod-3E67B1?logo=zod&logoColor=white)
![MCP SDK](https://img.shields.io/badge/MCP_SDK-1F1F1F)
![Vitest](https://img.shields.io/badge/Vitest-6E9F18?logo=vitest&logoColor=white)
![Docker](https://img.shields.io/badge/Docker-2496ED?logo=docker&logoColor=white)

A single Express server serves the React UI and the API. Generated servers are rendered from Handlebars templates on
top of `@modelcontextprotocol/sdk`.

```mermaid
flowchart LR
    A[API description<br/>file or URL] --> B[Format detection<br/>and conversion]
    B --> C[Parser<br/>isolated child process]
    C --> D[Endpoint selection<br/>in the UI]
    D --> E{Delivery}
    E -->|download| F[Ready-to-run kit<br/>TypeScript + Docker]
    E -->|hosted| G[Hosted MCP URL<br/>token relayed, never stored]
```

Key decisions:
- **Isolated parsing.** Some specs exhaust memory. Parsing runs in a child process with a timeout, a memory cap and
  a concurrency limit: a malicious spec returns a clean error and the server stays up.
- **Server-side re-parse.** The server never trusts the parsed spec sent back by the browser; it re-parses the raw
  spec and filters the selection against its own result.
- **Hosted mode over a desktop binary.** The first plan shipped an executable; unsigned binaries are blocked by
  macOS Gatekeeper. The hosted mode serves several agent sessions in parallel instead.
- **External data is JSON-encoded in generated code.** Rule adopted after a review found two code-injection paths
  (token URL, OAuth scopes), both fixed.

<details>
<summary><strong>Project structure</strong></summary>

```
src/
├── client/            React UI
│   ├── screens/       Upload, Select, Configure, Done
│   └── components/    UI components; ui/ holds shadcn/ui primitives
├── server/            Express API and hosted MCP runtime
│   ├── db/            PostgreSQL schema, connection and versioned migrations (Drizzle)
│   ├── routes/        upload, generate, host, hosted MCP endpoint
│   ├── services/      parsing, format conversion, SSRF guard, generation, hosted store
│   └── templates/     Handlebars templates of the generated server
└── shared/            Types and Zod schemas shared by client and server
scripts/               Real-world corpus check, token calibration, production smoke test
docs/                  Reference documentation
```

</details>

## Documentation

| Document | Content |
|---|---|
| [API reference](docs/API.md) | Every route, request and response shapes, error codes, limits |
| [Configuration](docs/configuration.md) | Environment variables, production run, self-hosting the generated kit |
| [Generated server](docs/mcp-template.md) | How a selection becomes an MCP server: templates, tool naming, input schemas |
| [Token estimator](docs/token-estimator.md) | How the context cost is computed and calibrated |

## Status

Functional, not yet deployed.

- Automated tests, strict typing, CI on every pull request (against a real PostgreSQL).
- 500 real public API descriptions run through the pipeline: 412 converted, 83 rejected cleanly, 5 too large,
  0 crashes (`corpus` workflow, on demand).
- Verified end to end in Claude Desktop against the Notion API.

Next: public hosted instance.


## License

[Functional Source License 1.1, MIT Future License](LICENSE.md): free to read, use internally, modify and
redistribute for any purpose other than a competing commercial product or service. Each version becomes MIT two
years after its release.
