# SLICE HTTP API

Reference for the HTTP interface exposed by the SLICE server (Express, `src/server/`).
The browser front end uses the `/api/*` routes; AI agents use the hosted runtime under `/m/:id`.

## Overview

| Method | Path | Purpose | Rate-limited |
|---|---|---|---|
| `GET` | `/api/health` | Liveness and database probe | No |
| `POST` | `/api/upload` | Parse an uploaded API description file | Yes |
| `POST` | `/api/upload-url` | Fetch an API description from a public HTTPS URL, then parse it | Yes |
| `POST` | `/api/generate` | Build a self-hostable MCP server and stream it as a ZIP | Yes |
| `POST` | `/api/host` | Store a hosted MCP configuration and return its URL | Yes |
| any | `/m/:id` | Hosted MCP runtime (MCP Streamable HTTP, stateless) | No |

In production (`NODE_ENV=production`) the server also serves the built front end from `dist/client`,
with a single-page-app fallback: any other `GET` returns `index.html`.

## Conventions

### Base URL

- Development: `http://localhost:3001` (the Vite dev server on port 5173 proxies `/api` to it).
- Production: the same origin as the front end (single process serving both).

### Authentication

Every `/api/*` route needs the session cookie of a SLICE account, except `GET /api/health`, the sign-in routes of
Better Auth under `/api/auth/*`, and, outside production only, `POST /api/dev/sign-in` (opens a session for the recette
account `recette@slice.local`; used by the visual test pass). Without a live session the answer is
`401 { "code": "UNAUTHORIZED", "message": "Sign in to continue." }`; while the database is unreachable,
`503 SERVICE_UNAVAILABLE`.
The hosted runtime `/m/:id` is protected by the unguessable id in its URL (see [Hosted runtime](#any-mid)).

### CORS

CORS is enabled for all origins (`cors()` with default options).

### Request body limits

| Route | Limit | Over the limit |
|---|---|---|
| `POST /api/upload` | 10 MB file (multipart) | `413 PAYLOAD_TOO_LARGE` |
| `POST /api/generate`, `POST /api/host` | 15 MB JSON body | `413 PAYLOAD_TOO_LARGE` |
| Every other route (including `/m/:id`) | 10 MB JSON body | `413` from the Express body parser |

Independently of the body limit, any API description is capped at 10 MB before it is parsed.

### Rate limiting

- 30 requests per minute per client IP on every path under `/api/`, except `GET /api/health`.
- The hosted runtime `/m/:id` is not rate-limited.
- Responses carry the standard `RateLimit-Policy`, `RateLimit-Limit`, `RateLimit-Remaining` and `RateLimit-Reset` headers.
- Over the limit: `429` with body `{ "error": "Too many requests, please try again in a minute." }`.

The limiter keys on `req.ip`. The app does not set Express `trust proxy`, so behind a reverse proxy
every client is counted under the proxy's address (see [configuration.md](configuration.md#running-behind-a-reverse-proxy)).

### Error format

`/api/*` routes return errors as JSON:

```json
{ "code": "INVALID_SPEC", "message": "Human-readable explanation." }
```

The HTTP status is fixed per code; the tables below list them. Two exceptions use `{ "error": "..." }`
instead of `{ code, message }`: the rate limiter (`429`) and the hosted runtime (`/m/:id`).

## Parsing pipeline

`/api/upload`, `/api/upload-url`, `/api/generate` and `/api/host` all parse the API description
with the same pipeline. The hosted runtime never parses a spec.

### Accepted formats

The format is detected from the content, not from the file name.

| Source format | Detection marker | Handling |
|---|---|---|
| OpenAPI 3.0 / 3.1 | `openapi: "3.0.x"` or `"3.1.x"` | Parsed as is |
| Swagger 2.0 | `swagger: "2.0"` | Converted to OpenAPI 3.0 (`swagger2openapi`), then parsed |
| Postman Collection v2.x | `info.schema` matches `schema.getpostman.com/json/collection/v2.*` | Converted to OpenAPI 3.0 (`postman-to-openapi`), then parsed |
| OpenAPI 3.2 or later | `openapi: "3.2..."` | Rejected, `UNSUPPORTED_VERSION` |
| Anything else (GraphQL SDL, Swagger 1.x, XML, plain text) | No known marker | Rejected, `UNSUPPORTED_FORMAT` |

### Steps

1. Size check: more than 10 MB is rejected (`PAYLOAD_TOO_LARGE`) before anything else runs.
2. Concurrency gate: at most 3 parses run at once and 12 wait in a queue (both configurable).
   A request arriving when the queue is full gets `429 PARSE_BUSY`.
3. Isolated parse in a child process (see [Security guarantees](#security-guarantees)):
   - load the document with the safe YAML schema (JSON is accepted as YAML);
   - reject any external `$ref`, both in the original document and after conversion;
   - convert Swagger 2.0 or Postman to OpenAPI 3.0;
   - check the OpenAPI version (3.0 or 3.1);
   - refuse documents with more than 200 000 nodes;
   - normalise the casing of IANA HTTP auth scheme names (for example `Bearer` to `bearer`), and nothing else;
   - validate the document (`@apidevtools/swagger-parser`);
   - reject the spec if every security scheme its endpoints reference is HTTP Basic or Digest;
   - require at least one path;
   - normalise the result into a `ParsedSpec` (below).

### Normalisation rules

- Only `GET`, `POST`, `PUT`, `PATCH` and `DELETE` operations are kept (`HEAD`, `OPTIONS`, `TRACE` are ignored).
- Endpoint id: `"<METHOD> <path>"`, for example `"GET /products/{id}"`.
- Label: `summary`, else the first line of `description`, else a generated label
  (`List <noun>`, `Create a <noun>`, `Update a <noun>`, `Delete a <noun>`, where `<noun>` is the last non-parameter path segment).
- An operation with no `operationId`, no `summary` and no `description` is dropped and counted in `excludedCount`.
- Group: the operation's first tag, else `"Other"`.
- Parameters: path, query, header and cookie parameters are flattened; path parameters are always required.
- A JSON `requestBody` that is an object with declared properties is flattened into one `in: "body"` parameter per
  top-level property (`wireName` holds the real field name; the parameter is renamed `<name>_body` if it clashes with another parameter).
  Any other JSON body becomes a single whole-body parameter (`body`, or `requestBody` on a name clash).
  A non-JSON body (multipart, form) produces no body parameter and is flagged `non_json_body`.
- `deprecated: true` operations are flagged.
- `approximations` lists silent degradations per endpoint: `non_json_body`, `cookie_param`, `schema_fallback`.
- `defaultConfig` pre-fills the configuration screen: a slugified `mcpName` from `info.title`, `baseUrl` from `servers[0].url`,
  the detected upstream auth, and a fresh random 32-hex `mcpServerToken`.

### `ParsedSpec` shape

```json
{
  "apiName": "Shopify Sample",
  "apiVersion": "2024-04",
  "baseUrl": "https://example.myshopify.com/admin/api/2024-04",
  "authType": "apiKey",
  "authHeader": "X-Shopify-Access-Token",
  "excludedCount": 0,
  "groups": [
    {
      "tag": "products",
      "endpoints": [
        {
          "id": "GET /products",
          "method": "GET",
          "path": "/products",
          "label": "List products",
          "description": "Retrieve a list of products.",
          "params": [
            { "name": "limit", "in": "query", "type": "integer", "required": false }
          ]
        }
      ]
    }
  ],
  "defaultConfig": {
    "mcpName": "shopify-sample",
    "baseUrl": "https://example.myshopify.com/admin/api/2024-04",
    "upstreamAuth": { "type": "apiKey", "headerName": "X-Shopify-Access-Token" },
    "mcpServerToken": "<32 hex characters>"
  }
}
```

`authType` is one of `none`, `apiKey`, `bearer`, `oauth2`. Optional endpoint fields: `description`,
`deprecated`, `approximations`. Optional param fields: `type`, `description`, `schema` (nested shape of a body field), `wireName`.

### Parse error codes

| HTTP | `code` | Cause |
|---|---|---|
| 400 | `INVALID_SPEC` | Empty input, not parseable as JSON/YAML, no OpenAPI version marker, invalid OpenAPI structure, or an external `$ref` |
| 400 | `EMPTY_SPEC` | The document has no `paths` |
| 400 | `UNSUPPORTED_VERSION` | OpenAPI version other than 3.0 or 3.1 |
| 400 | `UNSUPPORTED_AUTH` | Every referenced security scheme is HTTP Basic or HTTP Digest |
| 400 | `SWAGGER2_CONVERSION_FAILED` | The Swagger 2.0 document could not be converted |
| 400 | `POSTMAN_CONVERSION_FAILED` | The Postman collection could not be converted, or converted to an empty document |
| 400 | `PARSE_DEPTH_EXCEEDED` | More than 200 000 nodes (the name is historical; there is no depth limit) |
| 413 | `PAYLOAD_TOO_LARGE` | More than 10 MB |
| 415 | `UNSUPPORTED_FORMAT` | Not a recognised format (see the table above) |
| 422 | `PARSE_TOO_COMPLEX` | The parse process crashed or ran out of memory (for example a `$ref` explosion), or produced more than 32 MB of output |
| 429 | `PARSE_BUSY` | Too many parses in flight and the queue is full; retry shortly |
| 504 | `PARSE_TIMEOUT` | The parse process was killed after 8 seconds |

`/api/generate` and `/api/host` report parse failures differently; see their sections.

---

## `GET /api/health`

Liveness probe, which also checks that the database answers. Not rate-limited, so monitors behind a shared NAT can
poll it freely.

**Response `200`**

```json
{
  "ok": true,
  "status": "ok",
  "env": "production",
  "timestamp": "2026-10-05T17:30:00.000Z"
}
```

`env` is the server's `NODE_ENV` (default `development`).

**Response `503`** while the database is unreachable (it returns to `200` by itself once the database is back):

```json
{
  "ok": false,
  "status": "database unreachable",
  "env": "production",
  "timestamp": "2026-10-05T17:30:00.000Z"
}
```

---

## `POST /api/upload`

Parses an uploaded API description and returns a `ParsedSpec`.

**Request:** `multipart/form-data`

| Field | Required | Description |
|---|---|---|
| `file` | Yes | The API description. Extension `.json`, `.yaml` or `.yml`; at most 10 MB; exactly one file. |

Other multipart fields are ignored. The file is held in memory only and never written to disk.

**Response `200`:** `application/json`, a [`ParsedSpec`](#parsedspec-shape).

**Errors:** all [parse error codes](#parse-error-codes), plus:

| HTTP | `code` | Cause |
|---|---|---|
| 400 | `NO_FILE` | No file under the `file` field, a file under another field name, or more than one file |
| 400 | `INVALID_SPEC` | The multipart body could not be read |
| 415 | `UNSUPPORTED_FORMAT` | File extension other than `.json`, `.yaml`, `.yml` |
| 429 | (none) | Rate limit exceeded |

---

## `POST /api/upload-url`

Fetches an API description from a public HTTPS URL, then parses it. When the URL returns an HTML page
(a documentation portal, Swagger UI), the server looks for the spec behind it.

**Request:** `application/json`

```json
{ "url": "https://petstore3.swagger.io/api/v3/openapi.json" }
```

**Response `200`**

```json
{
  "parsed": { "...": "ParsedSpec" },
  "raw": "<the spec text that was parsed>"
}
```

The client sends `raw` back as `rawSpec` to `/api/generate` or `/api/host`.

**Fetch rules**

- The submitted URL must be absolute and use `https://`.
- Every URL fetched, including each redirect target, must resolve only to public addresses (SSRF guard, below).
- Redirects are followed manually, at most 3.
- Timeout: 5 seconds per fetch. Body cap: 10 MB (checked on `Content-Length` and while streaming).
- Requests are sent with `User-Agent: SLICE/1.0`.

**HTML discovery** (when the response is `text/html` or `application/xhtml+xml`), in order:

1. A spec inlined in `<script type="application/json">` or `<script type="application/yaml">` containing an `openapi` or `swagger` key.
2. Up to 10 candidate URLs, tried in order: spec-looking links in `<a href>` and `<link href>`, then well-known paths
   on the same origin (`/openapi.json`, `/openapi.yaml`, `/openapi.yml`, `/swagger.json`, `/swagger.yaml`,
   `/api/openapi.json`, `/api/openapi.yaml`, `/api-docs`, `/v2/api-docs`, `/v3/api-docs`).
   The first candidate that returns a non-HTML response is used.
3. Otherwise the HTML body itself goes to the parser, which rejects it if it is not a spec.

**Errors:** all [parse error codes](#parse-error-codes), plus:

| HTTP | `code` | Cause |
|---|---|---|
| 400 | `URL_INVALID` | `url` missing or empty, not a valid URL, or not `https://` |
| 400 | `URL_PRIVATE_IP_BLOCKED` | The host (or a redirect target or candidate) resolves to a non-public address |
| 400 | `URL_FETCH_FAILED` | Network error, non-2xx status, more than 3 redirects, or a redirect without `Location` |
| 413 | `URL_TOO_LARGE` | Response larger than 10 MB |
| 504 | `URL_TIMEOUT` | No response within 5 seconds |
| 429 | (none) | Rate limit exceeded |

---

## `POST /api/generate`

Generates a self-hostable TypeScript MCP server for the selected endpoints and streams it as a ZIP.
The archive is built in memory and piped into the response: nothing is written to disk and no download URL is created.

**Request:** `application/json`, at most 15 MB.

```json
{
  "parsedSpec": { "...": "ParsedSpec returned by /api/upload" },
  "rawSpec": "openapi: \"3.0.3\"\ninfo: ...\npaths: ...",
  "selectedIds": ["GET /products", "GET /products/{id}"],
  "config": {
    "mcpName": "shopify-mcp",
    "baseUrl": "https://example.myshopify.com/admin/api/2024-04",
    "upstreamAuth": { "type": "apiKey", "headerName": "X-Shopify-Access-Token" },
    "hosting": "self",
    "mode": "remote",
    "mcpServerToken": "<32 hex characters>",
    "includeParamDescriptions": true,
    "retryOnServerError": false
  }
}
```

| Field | Rule |
|---|---|
| `parsedSpec` | Any object. Not trusted: the server ignores it for generation and re-parses `rawSpec`. |
| `rawSpec` | Non-empty string: the original spec text. |
| `selectedIds` | At least one endpoint id (`"<METHOD> <path>"`). |
| `config.mcpName` | 3 to 40 characters, lowercase letters, digits and dashes only. |
| `config.baseUrl` | Absolute `http://` or `https://` URL. |
| `config.upstreamAuth` | One of `{ "type": "none" }`, `{ "type": "apiKey", "headerName": "<non-empty>" }`, `{ "type": "bearer" }`, `{ "type": "oauth2", "tokenUrl": "<https URL>", "scopes": ["..."] }` (`scopes` optional). `tokenUrl` and scopes reject quotes, backslashes, whitespace and control characters. |
| `config.hosting` | `"cloud"` or `"self"`. Required. Not used by the generator. |
| `config.mode` | `"local"` (stdio), `"remote"` (HTTP) or `"both"`. Drives the transports in the bundle. The web UI sends `"remote"`. |
| `config.mcpServerToken` | Optional, 32 hexadecimal characters. Written to the bundle's `.env.example` unless `mode` is `"local"`. |
| `config.includeParamDescriptions` | Boolean. When true, parameter descriptions are added to the tool input schemas. |
| `config.retryOnServerError` | Boolean. Required by the schema; currently has no effect on the generated code. |

**Why `rawSpec` as well as `parsedSpec`:** the server trusts only its own parser. It re-parses `rawSpec`
with the full [parsing pipeline](#parsing-pipeline), then keeps only the `selectedIds` that exist in the re-parsed result.

**Response `200`**

- `Content-Type: application/zip`
- `Content-Disposition: attachment; filename="<mcpName>.zip"`
- Body: the MCP server bundle, 12 files, plus `src/oauth-token.ts` for an OAuth2 upstream.
  See [mcp-template.md](mcp-template.md).

**Errors**

| HTTP | `code` | Cause |
|---|---|---|
| 400 | `INVALID_SPEC` | The body fails schema validation, or `rawSpec` fails to re-parse (the specific parse code is not exposed, except the ones below) |
| 400 | `NO_ENDPOINT_SELECTED` | None of `selectedIds` exists in the re-parsed spec |
| 413 | `PAYLOAD_TOO_LARGE` | Body larger than 15 MB |
| 422 | `PARSE_TOO_COMPLEX` | The re-parse crashed or ran out of memory |
| 429 | `PARSE_BUSY` | Too many parses in flight; retry shortly |
| 429 | (none) | Rate limit exceeded |
| 500 | `GENERATION_FAILED` | Template rendering failed |
| 504 | `TIMEOUT` | The re-parse timed out, or the whole pipeline (re-parse, generation, start of streaming) took more than 30 seconds |

If a failure happens after the ZIP has started streaming, the server closes the connection; the client sees a truncated download.

---

## `POST /api/host`

Creates a hosted MCP: stores a configuration and returns the URL agents connect to. No code is generated and no secret is stored.

**Request:** identical to [`POST /api/generate`](#post-apigenerate) (same schema, same 15 MB limit).
The server re-parses `rawSpec` and filters `selectedIds` in the same way.

**Stored configuration:** the MCP name, `baseUrl`, `upstreamAuth` (type, plus header name, token URL and scopes when relevant),
and for each selected endpoint its tool name, one-line description, method, path and parameters, plus a creation date.
The raw spec, `mcpServerToken` and any upstream credential are not stored.

**SSRF check:** when the server runs with `NODE_ENV=production`, `config.baseUrl` must resolve only to public addresses;
otherwise the request fails with `BLOCKED_HOST`. In development this check is off so a local upstream can be used.

**Response `200`**

```json
{
  "id": "Q2xhdWRlIGlzIG5vdCBoZXJl",
  "url": "https://slice.example.com/m/Q2xhdWRlIGlzIG5vdCBoZXJl",
  "expiresAt": "2026-10-08T17:30:00.000Z"
}
```

| Field | Description |
|---|---|
| `id` | 16 random bytes, base64url-encoded (22 characters, about 128 bits of entropy) |
| `url` | `<request protocol>://<Host header>/m/<id>` |
| `expiresAt` | Creation time plus the TTL (`SLICE_HOSTED_TTL_HOURS`, default 72 h), or `null` when expiry is disabled (TTL `0`) |

**Errors**

| HTTP | `code` | Cause |
|---|---|---|
| 400 | `INVALID_SPEC` | The body fails schema validation, or `rawSpec` fails to re-parse |
| 400 | `NO_ENDPOINT_SELECTED` | None of `selectedIds` exists in the re-parsed spec |
| 400 | `BLOCKED_HOST` | `config.baseUrl` points to a non-public host (production only) |
| 413 | `PAYLOAD_TOO_LARGE` | Body larger than 15 MB |
| 422 | `PARSE_TOO_COMPLEX` | The re-parse crashed or ran out of memory |
| 429 | `PARSE_BUSY` | Too many parses in flight; retry shortly |
| 429 | (none) | Rate limit exceeded |
| 503 | `SERVICE_UNAVAILABLE` | The database is unreachable, so nothing could be stored. Message: "Hosting is unavailable for the moment. Try again in a few minutes." Retry later; the server recovers by itself |
| 504 | `TIMEOUT` | The re-parse timed out |

---

## `ANY /m/:id`

The hosted MCP runtime. One generic engine serves every hosted MCP: on each request it loads the stored
configuration for `:id` and builds an MCP server in memory whose tools call the upstream API.

**Transport:** MCP Streamable HTTP in stateless mode, through the official MCP TypeScript SDK.
A new server and transport are created for each HTTP request; there is no session id and no shared state between requests.
Clients send JSON-RPC over `POST` with `Accept: application/json, text/event-stream`, as any Streamable HTTP MCP client does.

**Access control:** the URL is the credential. Anyone holding it can list and call the tools. SLICE itself checks no token.

**Credential relay:** the agent sends its own upstream credential as `Authorization: Bearer <token>`.
For each tool call the runtime forwards it to the upstream API, then forgets it:

| `upstreamAuth.type` | Header sent upstream |
|---|---|
| `bearer` | `Authorization: Bearer <token>` |
| `oauth2` | `Authorization: Bearer <token>` (the agent's own access token; the hosted runtime never runs an OAuth flow) |
| `apiKey` | `<headerName>: <token>` |
| `none` | Nothing |

The token must be printable ASCII without spaces (`0x21`–`0x7E`). A missing or malformed header means the upstream call
goes out without a credential, and the upstream API's own error comes back to the agent.

**Tool calls**

- Tools are named after the endpoint label in snake_case, as in the downloadable kit (see [mcp-template.md](mcp-template.md#tool-name-convention)).
- Path parameters are URL-encoded into the path; query parameters are appended when provided.
- `in: "header"` parameters (for example `Notion-Version`) are sent as request headers. The relayed credential is applied after them, so a header parameter cannot overwrite it.
- Body parameters are reassembled into a JSON body. No body is sent on `GET`.
- Requests are sent with `Accept: application/json` and `Content-Type: application/json`.
- A non-2xx upstream response becomes a tool error carrying the upstream status and response body.
- A JSON response is returned as pretty-printed JSON text; anything else is returned as text.

**Expiry:** a configuration older than the TTL (`SLICE_HOSTED_TTL_HOURS`, default 72 hours, `0` for no expiry)
gets `410` at every request. It is kept 30 days after expiring, then a cleanup that runs at startup and every hour
deletes it; its id then gets `404`.

**Responses outside the MCP protocol**

| HTTP | Body | Cause |
|---|---|---|
| 404 | `{ "error": "Unknown MCP id." }` | No configuration under this id |
| 410 | `{ "error": "This MCP URL has expired. Generate it again on SLICE, or ask for a permanent plan." }` | The configuration has expired (kept 30 days, then deleted) |
| 500 | `{ "error": "Internal error." }` | The MCP transport failed before sending a response |
| 503 | `{ "error": "This MCP is unavailable for the moment. Try again in a few minutes." }` | The database is unreachable; the id may well exist, so it is never reported unknown |

Protocol-level errors (wrong `Accept` header, unsupported method, invalid JSON-RPC) are returned by the MCP SDK.

---

## Security guarantees

| Guarantee | How |
|---|---|
| Safe YAML | Specs are loaded with js-yaml `CORE_SCHEMA`: JSON-compatible types only, no custom tags (`!!js/function`, `!!binary` and similar are rejected). |
| No external `$ref` | Any `$ref` not starting with `#` (`http://`, `https://`, `file://`, relative files) is rejected with `INVALID_SPEC`, in the original document and again after conversion. The spec can never make the server fetch or read anything. |
| Bounded work | 10 MB size cap, 200 000-node cap, concurrency gate (3 running, 12 queued by default). |
| Parse isolation | Every parse runs in a separate Node.js child process with a 512 MB heap cap and an 8-second wall-clock limit enforced by the parent with `SIGKILL`. A pathological spec kills only that child; the server keeps running. The child receives no server secrets: its environment is limited to `PATH`, `HOME`, `NODE_ENV`, and an empty `NODE_OPTIONS`. Its output is capped at 32 MB. |
| Client parse not trusted | `/api/generate` and `/api/host` re-parse `rawSpec` server-side and keep only selected ids that exist in that result. |
| SSRF guard | Outbound URLs must be `http(s)` and resolve only to public addresses. Blocked: `0.0.0.0/8`, `127.0.0.0/8`, `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`, `169.254.0.0/16` (including cloud metadata `169.254.169.254`), `100.64.0.0/10`, IPv6 `::`, `::1`, `fe80::/10`, `fc00::/7`, and IPv4-mapped IPv6 forms of the above. Applied to `/api/upload-url` (always, on every redirect and candidate), to `config.baseUrl` in `/api/host`, and again before every hosted tool call (both production only). |
| Token relayed, never stored | The hosted runtime reads the caller's `Authorization` header per request (Node.js `AsyncLocalStorage`), forwards it upstream, and keeps nothing. Stored configurations contain no credential. |
| Unguessable hosted URLs | Ids are 128-bit random values. |
| Hosted URL expiry | Configurations expire after `SLICE_HOSTED_TTL_HOURS` (default 72), and are deleted 30 days later. |
| No disk writes for uploads and bundles | Uploads use in-memory storage; ZIPs are built in memory and streamed. Hosted configurations live in the database (PostgreSQL, or the embedded PGlite files under `SLICE_DATA_DIR` outside production). |
| Header-injection safe download name | The `Content-Disposition` file name is reduced to `[a-z0-9-]` before use. |

**Known limitation:** the SSRF guard checks DNS resolution before the request, not the connection itself.
A hostname that resolves to a public address at check time and to a private one at request time (DNS rebinding) is not blocked.
