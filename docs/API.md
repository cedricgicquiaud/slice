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
| `GET` | `/api/mcps` | List the signed-in account's hosted MCPs | Yes |
| `GET` | `/api/mcps/:id/versions` | Read the versions of one of the signed-in account's hosted MCPs | Yes |
| `POST` | `/api/mcps/:id/versions` | Save a new selection of actions as the next version, active at once | Yes |
| `POST` | `/api/mcps/:id/versions/:number/restore` | Make an existing version the active one again | Yes |
| `GET` | `/api/mcps/:id/selection` | Read every action of an MCP's API and those of its active version | Yes |
| `GET` | `/api/mcps/:id/usage` | Read what agents did with one of the signed-in account's hosted MCPs over the last 30 days | Yes |
| `GET` | `/api/mcps/:id/api-key` | Tell whether an MCP has a saved API key, and since when, never the key | Yes |
| `PUT` | `/api/mcps/:id/api-key` | Save the API key of an MCP, encrypted, replacing the one before | Yes |
| `DELETE` | `/api/mcps/:id/api-key` | Remove the API key of an MCP | Yes |
| `DELETE` | `/api/mcps/:id` | Delete one of the signed-in account's hosted MCPs | Yes |
| any | `/m/:id` | Hosted MCP runtime (MCP Streamable HTTP, stateless) | No |

In production (`NODE_ENV=production`) the server also serves the built front end from `dist/client`,
with a single-page-app fallback: any other `GET` returns `index.html`.

## Conventions

### Base URL

- Development: `http://localhost:3001` (the Vite dev server on port 5173 proxies `/api` to it).
- Production: the same origin as the front end (single process serving both).

### Authentication

Every `/api/*` route needs the session cookie of a SLICE account, except `GET /api/health`, the sign-in routes of
Better Auth under `/api/auth/*`, and, only when `NODE_ENV` is `development` or `test`, `POST /api/dev/sign-in` (opens a
session for the recette account `recette@slice.local`; used by the visual test pass). Without a live session the answer is
`401 { "code": "UNAUTHORIZED", "message": "Sign in to continue." }`; while the database is unreachable,
`503 SERVICE_UNAVAILABLE`.

SLICE takes an account's orders from its own page only. A write (any method but `GET`, `HEAD`, `OPTIONS`) to `/api/*`
whose `Origin` header is neither the address the request reached nor SLICE's public address (`BETTER_AUTH_URL`; in
development, `http://localhost:5173` by default — see [configuration.md](configuration.md)) is refused, session or
not: `403 { "code": "FORBIDDEN", "message": "SLICE takes orders from its own page only." }`. A request without
`Origin` (a script, an agent, `curl`) is not concerned: browsers always send it on a write from another site.

Google and Microsoft sign-in (Better Auth's social sign-in): `POST /api/auth/sign-in/social` with
`{ "provider": "google" | "microsoft", "callbackURL": "/", "errorCallbackURL": "/" }` answers `{ "url" }`, the
provider's sign-in page. The provider sends the person back to `/api/auth/callback/<provider>`, which sets the session
cookie and redirects to `callbackURL`. When the provider did not verify the email address, no session opens, no
account is created, and the redirect goes to `errorCallbackURL` with `?error=email_not_verified` (new address) or
`?error=account_not_linked` (address of an existing account). A provider without its application
([oauth-apps.md](oauth-apps.md)) is not offered.

Sign-in with a code by email (Better Auth's email OTP): `POST /api/auth/email-otp/send-verification-otp` with
`{ "email": "<address>", "type": "sign-in" }` sends a 6-digit code to the address and answers `{ "success": true }`
(by Resend with `RESEND_API_KEY`, otherwise printed in the server's terminal — see
[configuration.md](configuration.md)). When the email could not be sent, the answer is
`502 { "code": "code_not_sent", "message": "Couldn't send the code, try again." }`. Then
`POST /api/auth/sign-in/email-otp` with `{ "email", "otp" }` sets the session cookie; the first code of an unknown
address creates its account (and its personal workspace, never shown).

A code lives 10 minutes, signs in once, and takes 5 tries:

| Status | `code` | When |
|---|---|---|
| 400 | `INVALID_OTP` | Wrong code, or a code already used |
| 403 | `TOO_MANY_ATTEMPTS` | Sixth try of a code, even the right one; only a new code signs in |
| 400 | `OTP_EXPIRED` | Code older than 10 minutes |
| 429 | `too_many_codes_for_address` | Sixth code within the hour for the address; no email sent |
| 429 | `too_many_codes_from_ip` | Eleventh code within the hour from the IP (`x-forwarded-for`), any address; no email sent |

Only codes that left count in the two hourly quotas: a `code_not_sent` spends nothing. The quotas live in the server's
memory, so a restart gives them back. In production, Better Auth also limits each of the two routes to 3 calls a minute
per IP (`429` without `code`).

Account deletion (Better Auth's delete user): `POST /api/auth/delete-user` with `{}` and the session cookie erases
the signed-in account at once and answers `{ "success": true, "message": "User deleted" }`. Its sessions go with it on
every device, and so do its personal workspace and every MCP in it: their URLs answer
`404 { "error": "Unknown MCP id." }` from then on (see [`ANY /m/:id`](#any-mid)). There is no undo and no grace
period. Any live session deletes, however long ago it was opened (Better Auth's `freshAge` is 0: with no password
to retype, a "fresh session" rule would guard nothing). Signing in again with the same address opens a new, empty account. The page `/account/delete` sends this call
once `delete` is typed.

| Status | `code` | When |
|---|---|---|
| 401 | `UNAUTHORIZED` | No live session; nothing is deleted |
| 403 | `INVALID_ORIGIN` | Sent from another site than SLICE's page (`BETTER_AUTH_URL`); nothing is deleted |
| 403 | `MISSING_OR_NULL_ORIGIN` | The session cookie without any `Origin` header (a script, `curl`): send `Origin: <BETTER_AUTH_URL>` |

This route is under `/api/auth/*`, so SLICE's own origin guard above does not see it: Better Auth's origin check
refuses foreign writes instead, and stricter, since it also wants the `Origin` header whenever a session cookie comes
along. That check is off under `NODE_ENV=test` or `TEST=true`.

Only when `NODE_ENV` is `development` or `test`, `POST /api/dev/mcps/:id/api-key/garble`, with the session cookie, makes
the saved key of one of the account's MCPs unreadable, as a changed `SLICE_ENCRYPTION_KEY` would, its date kept: the
recette primer shows the "API key" page in that state. It answers `204`, or `404 NOT_FOUND` for an MCP of another account
("Unknown MCP id.") or without a key ("This MCP has no API key."). In production the route does not exist.

The hosted runtime `/m/:id` is protected by the unguessable id in its URL (see [Hosted runtime](#any-mid)).

### CORS

CORS is enabled for all origins on the hosted runtime `/m/:id` only, so an agent can call a hosted MCP from any site.
`/api/*` sends no CORS header: only SLICE's own page, on the same origin, reads its answers.

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
a creation date, the API's name as read in the spec (`info.title`, else `Untitled API`) and the personal workspace of the
signed-in account, which owns the MCP. Alongside it:

- **the full list of the API's actions**, checked or not, as the selection screen shows them: tool name, label, group (tag),
  description, `deprecated` mark, method, path and parameters;
- **version 1**, the selection: for each selected endpoint its tool name, label, one-line description, method, path and
  parameters. It is created and made active at the creation date. An MCP has one active version at a time, and its URL
  serves that version's actions only (see [`GET /api/mcps/:id/versions`](#get-apimcpsidversions)).

The raw spec, `mcpServerToken` and any upstream credential are not stored, in the MCP, its versions or its list.

**SSRF check:** when the server runs with `NODE_ENV=production`, `config.baseUrl` must resolve only to public addresses;
otherwise the request fails with `BLOCKED_HOST`. In development this check is off so a local upstream can be used.

**Response `200`**

```json
{
  "id": "Q2xhdWRlIGlzIG5vdCBoZXJl",
  "url": "https://slice.example.com/m/Q2xhdWRlIGlzIG5vdCBoZXJl"
}
```

| Field | Description |
|---|---|
| `id` | 16 random bytes, base64url-encoded (22 characters, about 128 bits of entropy) |
| `url` | `<request protocol>://<Host header>/m/<id>` |

A hosted MCP has no expiry date: its URL keeps working until the MCP is deleted.

**Errors**

| HTTP | `code` | Cause |
|---|---|---|
| 400 | `INVALID_SPEC` | The body fails schema validation, or `rawSpec` fails to re-parse |
| 400 | `NO_ENDPOINT_SELECTED` | None of `selectedIds` exists in the re-parsed spec |
| 400 | `BLOCKED_HOST` | `config.baseUrl` points to a non-public host (production only) |
| 401 | `UNAUTHORIZED` | No live session; nothing is stored |
| 403 | `FORBIDDEN` | Sent from another site than SLICE's page; nothing is stored |
| 413 | `PAYLOAD_TOO_LARGE` | Body larger than 15 MB |
| 422 | `PARSE_TOO_COMPLEX` | The re-parse crashed or ran out of memory |
| 429 | `PARSE_BUSY` | Too many parses in flight; retry shortly |
| 429 | (none) | Rate limit exceeded |
| 503 | `SERVICE_UNAVAILABLE` | The database is unreachable, so nothing could be stored. Message: "Hosting is unavailable for the moment. Try again in a few minutes." Retry later; the server recovers by itself |
| 504 | `TIMEOUT` | The re-parse timed out |

---

## `GET /api/mcps`

Lists the hosted MCPs of the signed-in account's personal workspace, newest first. MCPs of any other account never
appear. An MCP is created by [`POST /api/host`](#post-apihost), its versions are read by
[`GET /api/mcps/:id/versions`](#get-apimcpsidversions), its selection of actions is changed by
[`POST /api/mcps/:id/versions`](#post-apimcpsidversions), an older version is made active again by
[`POST /api/mcps/:id/versions/:number/restore`](#post-apimcpsidversionsnumberrestore), its API key is saved by
[`PUT /api/mcps/:id/api-key`](#put-apimcpsidapi-key), and it is deleted by [`DELETE /api/mcps/:id`](#delete-apimcpsid).
Only its selection of actions can change: its name, the API's address and its upstream access stay those of its creation.

**Response `200`**

```json
{
  "mcps": [
    {
      "id": "Q2xhdWRlIGlzIG5vdCBoZXJl",
      "apiName": "Notion API",
      "actionCount": 2,
      "upstreamAuthType": "bearer",
      "createdAt": "2026-10-21T10:15:00.000Z",
      "url": "https://slice.example.com/m/Q2xhdWRlIGlzIG5vdCBoZXJl"
    }
  ]
}
```

| Field | Description |
|---|---|
| `id` | The MCP's id, as returned by `POST /api/host` |
| `apiName` | The API's name as read in its description; for an MCP stored without one, the host name of its `baseUrl` (for example `api.acme.io`) |
| `actionCount` | Number of actions (tools) the MCP exposes: those of its active version, not the API's full list |
| `upstreamAuthType` | How the MCP reaches its API, set at its creation: `none`, `apiKey` (a key in a header), `bearer` (`Authorization: Bearer`) or `oauth2` (client_credentials) |
| `createdAt` | Creation date, ISO 8601 |
| `url` | `<request protocol>://<Host header>/m/<id>`, the address to paste into the agent |

An account without any MCP gets `{ "mcps": [] }`.

**Errors**

| HTTP | `code` | Cause |
|---|---|---|
| 401 | `UNAUTHORIZED` | No live session |
| 429 | (none) | Rate limit exceeded |
| 503 | `SERVICE_UNAVAILABLE` | The database is unreachable |

---

## `GET /api/mcps/:id/versions`

Reads the versions of one hosted MCP of the signed-in account, newest first. A version is a selection of actions,
numbered from 1 and dated; one version is active at a time, and the MCP's URL serves it.

**Response `200`**

```json
{
  "apiName": "Notion API",
  "versions": [
    {
      "number": 1,
      "createdAt": "2026-10-21T10:15:00.000Z",
      "activeSince": "2026-10-21T10:15:00.000Z",
      "actionLabels": ["Search", "Get a page"]
    }
  ]
}
```

| Field | Description |
|---|---|
| `apiName` | The MCP's name, as [`GET /api/mcps`](#get-apimcps) gives it |
| `versions[].number` | 1 for the selection made at creation, then 2, 3… |
| `versions[].createdAt` | Creation date of the version, ISO 8601 |
| `versions[].activeSince` | Date the version last became the active one, ISO 8601; `null` for every other version. For version 1 of a new MCP, its creation date; for a restored version, the date of its restoration |
| `versions[].actionLabels` | The labels of the version's actions, in their order |

**Errors**

| HTTP | `code` | Cause |
|---|---|---|
| 401 | `UNAUTHORIZED` | No live session |
| 404 | `NOT_FOUND` | No MCP under this id in the account's workspace. Message: "Unknown MCP id." The answer is the same whether the id does not exist or belongs to another account, so an id reveals nothing |
| 429 | (none) | Rate limit exceeded |
| 503 | `SERVICE_UNAVAILABLE` | The database is unreachable |

---

## `POST /api/mcps/:id/versions`

Saves a new selection of one hosted MCP of the signed-in account as its next version, numbered after the highest
existing one, and makes it the active version at once. The MCP's URL does not change: from the agent's next
conversation, it lists the new version's actions. A selection identical to an older, inactive version still makes a
new version. Only the selection changes; the MCP's name, `baseUrl` and `upstreamAuth` stay those of its creation.

**Request**

```json
{
  "fromVersion": 1,
  "selectedIds": ["GET /notes", "POST /notes", "DELETE /trash"]
}
```

| Field | Description |
|---|---|
| `fromVersion` | The number of the version that was active when the selection was read (see [`GET /api/mcps/:id/selection`](#get-apimcpsidselection)) |
| `selectedIds` | The ids of the actions to keep, `<METHOD> <path>`, all taken from the MCP's API; at least one |

No other field is accepted.

**Response `201`**

```json
{ "number": 2 }
```

| Field | Description |
|---|---|
| `number` | The new version's number |

**Errors** — in every case, nothing is saved.

| HTTP | `code` | Cause |
|---|---|---|
| 400 | `INVALID_SELECTION` | The body holds another field than `fromVersion` and `selectedIds` (a name, an API address, an upstream access…). Message: "Only the selection of actions can be changed." |
| 400 | `INVALID_SELECTION` | `selectedIds` is empty. Message: "Pick at least one action." |
| 400 | `INVALID_SELECTION` | An id is not one of the MCP's API's actions. Message: "This MCP's API has no such action." |
| 400 | `INVALID_SELECTION` | The selection is the active version's, in any order. Message: "This selection is already the active version." |
| 401 | `UNAUTHORIZED` | No live session |
| 403 | `FORBIDDEN` | Sent from another site than SLICE's page |
| 404 | `NOT_FOUND` | No MCP under this id in the account's workspace. Message: "Unknown MCP id." The answer is the same whether the id does not exist or belongs to another account; the other account's MCP is left untouched |
| 409 | `CONFLICT` | `fromVersion` is no longer the active version: another change was saved meanwhile, from another tab for instance. Message: "This MCP changed in the meantime. Reload to see its current actions." |
| 429 | (none) | Rate limit exceeded |
| 503 | `SERVICE_UNAVAILABLE` | The database is unreachable |

---

## `POST /api/mcps/:id/versions/:number/restore`

Makes version `:number` of one hosted MCP of the signed-in account the active one again, dated from now. No version
is created, and the version that was active is no longer. The MCP's URL does not change: from the agent's next
conversation, it lists the restored version's actions, and `actionCount` in [`GET /api/mcps`](#get-apimcps) counts
them. The next change saved by [`POST /api/mcps/:id/versions`](#post-apimcpsidversions) starts from the restored
version and is numbered after the highest existing one (3 after restoring version 1 of an MCP that has a version 2).

Restoring the version that is already active succeeds and changes nothing, not even its `activeSince` date.

The request has no body.

**Response `200`**

```json
{ "number": 1, "activeSince": "2026-10-26T15:00:00.000Z" }
```

| Field | Description |
|---|---|
| `number` | The restored version's number |
| `activeSince` | Date the version is active since, ISO 8601: now, or its earlier date when it was already the active one |

**Errors** — in every case, nothing changes.

| HTTP | `code` | Cause |
|---|---|---|
| 401 | `UNAUTHORIZED` | No live session |
| 403 | `FORBIDDEN` | Sent from another site than SLICE's page |
| 404 | `NOT_FOUND` | No MCP under this id in the account's workspace. Message: "Unknown MCP id." The answer is the same whether the id does not exist or belongs to another account; the other account's MCP is left untouched |
| 404 | `NOT_FOUND` | The MCP has no version `:number` (or `:number` is not a version number). Message: "Unknown version of this MCP." |
| 429 | (none) | Rate limit exceeded |
| 503 | `SERVICE_UNAVAILABLE` | The database is unreachable |

---

## `GET /api/mcps/:id/selection`

Reads, for "Edit actions", every action of one hosted MCP's API — kept at its creation, checked or not — and those of
its active version.

**Response `200`**

```json
{
  "apiName": "Notes API",
  "version": 1,
  "groups": [
    {
      "tag": "Notes",
      "endpoints": [
        { "id": "GET /notes", "method": "GET", "path": "/notes", "label": "List notes", "deprecated": false, "params": [] },
        { "id": "POST /notes", "method": "POST", "path": "/notes", "label": "Create a note", "deprecated": false, "params": [] }
      ]
    },
    {
      "tag": "Trash",
      "endpoints": [
        { "id": "DELETE /trash", "method": "DELETE", "path": "/trash", "label": "Empty the trash", "deprecated": false, "params": [] }
      ]
    }
  ],
  "selectedIds": ["GET /notes", "POST /notes"]
}
```

| Field | Description |
|---|---|
| `apiName` | The MCP's name, as [`GET /api/mcps`](#get-apimcps) gives it |
| `version` | The active version's number; send it back as `fromVersion` when saving |
| `groups` | Every action of the API, by group (tag), in the order of its description, with the fields of [`ParsedSpec`](#parsedspec-shape) endpoints (`description` when the API gives one) |
| `selectedIds` | The ids of the active version's actions |

**Errors**

| HTTP | `code` | Cause |
|---|---|---|
| 401 | `UNAUTHORIZED` | No live session |
| 404 | `NOT_FOUND` | No MCP under this id in the account's workspace. Message: "Unknown MCP id." The same answer whether the id does not exist or belongs to another account |
| 429 | (none) | Rate limit exceeded |
| 503 | `SERVICE_UNAVAILABLE` | The database is unreachable |

---

## `GET /api/mcps/:id/usage`

Reads what agents did with one hosted MCP of the signed-in account over the last 30 days (the 30 × 24 hours before
the request), from the notes of its action calls (see [`ANY /m/:id`](#any-mid)). A call older than that counts nowhere.
The notes keep neither the values the agent sent, nor the API's response, nor the token: the answer holds none either.
There is no other period, and nothing updates by itself: reading again gives the latest calls.

**Response `200`**

```json
{
  "apiName": "Notes API",
  "actions": [
    {
      "name": "list_notes",
      "label": "List notes",
      "available": true,
      "calls": 3,
      "succeeded": 2,
      "averageDurationMs": 300,
      "lastCalledAt": "2026-10-26T12:00:00.000Z"
    },
    {
      "name": "create_note",
      "label": "Create a note",
      "available": true,
      "calls": 0,
      "succeeded": 0,
      "averageDurationMs": null,
      "lastCalledAt": null
    },
    {
      "name": "empty_trash",
      "label": "Empty the trash",
      "available": false,
      "calls": 1,
      "succeeded": 0,
      "averageDurationMs": null,
      "lastCalledAt": "2026-10-26T09:00:00.000Z"
    }
  ],
  "cappedDays": [],
  "recentCalls": [
    {
      "calledAt": "2026-10-26T12:00:00.000Z",
      "action": "list_notes",
      "label": "List notes",
      "result": { "kind": "succeeded" },
      "durationMs": 400,
      "version": 1
    },
    {
      "calledAt": "2026-10-26T09:00:00.000Z",
      "action": "empty_trash",
      "label": "Empty the trash",
      "result": { "kind": "not_available" },
      "durationMs": 3,
      "version": 1
    }
  ]
}
```

| Field | Description |
|---|---|
| `apiName` | The MCP's name, as [`GET /api/mcps`](#get-apimcps) gives it |
| `actions` | One line per action of the active version, in its order, called or not; then one line per other action of the API called in the period, in the order of the API's description |
| `actions[].name` | The action's tool name |
| `actions[].label` | The action's label |
| `actions[].available` | `true` for an action of the active version; `false` for another action of the API, which the MCP's URL no longer serves |
| `actions[].calls` | The number of calls in the period, whatever their result |
| `actions[].succeeded` | The number of those whose result is `succeeded` |
| `actions[].averageDurationMs` | The average duration of the succeeded calls, in milliseconds, rounded; `null` without any |
| `actions[].lastCalledAt` | Date of the last call in the period, ISO 8601; `null` without any |
| `cappedDays` | The days of the period (`YYYY-MM-DD`, days of UTC) on which 10,000 calls of the MCP were noted, oldest first. At most 10,000 calls are noted per MCP and per day: the later calls of such a day count nowhere |
| `recentCalls` | The 50 most recent calls of the period, newest first; empty without any call |
| `recentCalls[].calledAt` | Date the call arrived at SLICE, ISO 8601 |
| `recentCalls[].action` | The action's tool name |
| `recentCalls[].label` | The action's label, else its tool name |
| `recentCalls[].result` | `{ "kind": … }`, one of the six results of [`ANY /m/:id`](#any-mid); a `failed` result also carries the API's `status` code, for example `{ "kind": "failed", "status": 404 }` |
| `recentCalls[].durationMs` | The call's duration in milliseconds, from its arrival to the end of its handling by SLICE |
| `recentCalls[].version` | The number of the version active when the call arrived |

**Errors**

| HTTP | `code` | Cause |
|---|---|---|
| 401 | `UNAUTHORIZED` | No live session |
| 404 | `NOT_FOUND` | No MCP under this id in the account's workspace. Message: "Unknown MCP id." The same answer whether the id does not exist or belongs to another account, so an id reveals nothing |
| 429 | (none) | Rate limit exceeded |
| 503 | `SERVICE_UNAVAILABLE` | The database is unreachable |

---

## `GET /api/mcps/:id/api-key`

Tells whether one hosted MCP of the signed-in account has a saved API key, since when, and whether SLICE can still read
it. No answer of SLICE's API ever holds the key, even in part.

**Response `200`**

```json
{ "apiKey": { "savedAt": "2026-10-28T09:30:00.000Z", "readable": true } }
```

| Field | Description |
|---|---|
| `apiKey` | `null` when the MCP has no saved key |
| `apiKey.savedAt` | Date of the last save or replacement, ISO 8601 |
| `apiKey.readable` | `false` when the key was encrypted under another `SLICE_ENCRYPTION_KEY` than the server's: SLICE can no longer read it, and never reads it as another text. Replace it |

**Errors**

| HTTP | `code` | Cause |
|---|---|---|
| 401 | `UNAUTHORIZED` | No live session |
| 404 | `NOT_FOUND` | No MCP under this id in the account's workspace. Message: "Unknown MCP id." The same answer whether the id does not exist or belongs to another account, so an id reveals nothing |
| 429 | (none) | Rate limit exceeded |
| 503 | `SERVICE_UNAVAILABLE` | The database is unreachable |

---

## `PUT /api/mcps/:id/api-key`

Saves the API key of one hosted MCP of the signed-in account. It is encrypted with `SLICE_ENCRYPTION_KEY` (AES-256-GCM)
before it reaches the database, and never written to the server's logs. An MCP has one key at most: saving again
replaces the key before, which is erased. The key is not tried on the API: a wrong key shows at the first call.

**Request**

```json
{ "apiKey": "<the key>" }
```

The spaces and line breaks at the ends of `apiKey` are dropped first (a copy-paste often leaves a final line break);
the key saved is what remains. Only an MCP whose `upstreamAuthType` is `apiKey` or `bearer` takes a key.

**Response `200`** — the state of the key, as [`GET /api/mcps/:id/api-key`](#get-apimcpsidapi-key) tells it:

```json
{ "apiKey": { "savedAt": "2026-10-28T09:30:00.000Z", "readable": true } }
```

**Errors** — in every case, nothing is saved and the key before stays.

| HTTP | `code` | Cause |
|---|---|---|
| 400 | `INVALID_KEY` | `apiKey` is missing or is not a text. Message: "This key can't be used: it is not a text." |
| 400 | `INVALID_KEY` | `apiKey` is empty, or made of spaces and line breaks only. Message: "This key can't be used: it is empty." |
| 400 | `INVALID_KEY` | `apiKey` is longer than 4,096 characters, its ends dropped. Message: "This key can't be used: it is longer than 4,096 characters." |
| 400 | `INVALID_KEY` | `apiKey` holds a character outside printable ASCII (a line break in the middle, "€", an emoji…), which an HTTP header cannot carry. Message: "This key can't be used: it contains a character an API can't receive." |
| 400 | `INVALID_KEY` | The MCP reaches its API without access (`none`) or through OAuth2 (`oauth2`). Message: "This MCP takes no API key." |
| 401 | `UNAUTHORIZED` | No live session |
| 403 | `FORBIDDEN` | Sent from another site than SLICE's page |
| 404 | `NOT_FOUND` | No MCP under this id in the account's workspace. Message: "Unknown MCP id." The same answer whether the id does not exist or belongs to another account; the other account's key is left untouched |
| 429 | (none) | Rate limit exceeded |
| 503 | `SERVICE_UNAVAILABLE` | The database is unreachable |

---

## `DELETE /api/mcps/:id/api-key`

Removes the API key of one hosted MCP of the signed-in account: it is erased from the database. An MCP without a key
answers the same.

**Response `204`**, with no body.

**Errors** — in every case, the key stays.

| HTTP | `code` | Cause |
|---|---|---|
| 401 | `UNAUTHORIZED` | No live session |
| 403 | `FORBIDDEN` | Sent from another site than SLICE's page |
| 404 | `NOT_FOUND` | No MCP under this id in the account's workspace. Message: "Unknown MCP id." The same answer whether the id does not exist or belongs to another account; the other account's key is left untouched |
| 429 | (none) | Rate limit exceeded |
| 503 | `SERVICE_UNAVAILABLE` | The database is unreachable |

---

## `DELETE /api/mcps/:id`

Deletes one hosted MCP of the signed-in account, with its actions, its versions, the list of its API's actions and its API key, at once. From then on its URL answers
`404 { "error": "Unknown MCP id." }` (see [`ANY /m/:id`](#any-mid)). There is no undo.

**Response `204`**, with no body.

**Errors**

| HTTP | `code` | Cause |
|---|---|---|
| 401 | `UNAUTHORIZED` | No live session; nothing is deleted |
| 403 | `FORBIDDEN` | Sent from another site than SLICE's page; nothing is deleted |
| 404 | `NOT_FOUND` | No MCP under this id in the account's workspace. Message: "Unknown MCP id." The answer is the same whether the id does not exist or belongs to another account, so an id reveals nothing; the other account's MCP is left untouched |
| 429 | (none) | Rate limit exceeded |
| 503 | `SERVICE_UNAVAILABLE` | The database is unreachable; nothing is deleted |

---

## `ANY /m/:id`

The hosted MCP runtime. One generic engine serves every hosted MCP: on each request it loads the stored
configuration for `:id` and builds an MCP server in memory whose tools call the upstream API. The tools are the
actions of the MCP's active version, never the rest of the API's full list.

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
- A call of a tool the active version lacks — removed by a later version, or never part of the MCP — is answered with a
  tool error, and the upstream API is not called: "This action is no longer available in this MCP. Start a new
  conversation to get the current list of actions." The same holds for each call of a JSON-RPC batch (several
  messages in one request): the others are served. An agent connected before a change keeps its old list until its
  next conversation; SLICE does not notify it.
- An upstream call waits at most 30 seconds for the API, its response body included. Past that it is abandoned, its
  request to the API closed, and the agent reads a tool error: "The API did not answer within 30 seconds."
- A non-2xx upstream response becomes a tool error carrying the upstream status and response body.
- A JSON response is returned as pretty-printed JSON text; anything else is returned as text.

**Notes of action calls:** each `tools/call` whose tool is one of the actions of the MCP's API (the full list kept at
its creation) leaves a note in the database: the action, the number of the version active when the call arrived, the
date of its arrival, its result and its duration in milliseconds, from its arrival to the end of its handling by SLICE.
Nothing else is kept: neither the values the agent sent, nor the API's response or error message, nor the token.
`initialize`, `tools/list`, notifications, a tool name the API does not have and a call at an unknown address are not
noted. The result is one of:

| Result | When |
|---|---|
| `succeeded` | The API answered with a 2xx code |
| `failed` | The API answered with another code, kept with the note (for example 404) |
| `api_unreachable` | The API did not answer within 30 seconds, or not at all: network failure, or its address refused by the SSRF guard at the time of the call |
| `invalid_request` | The call was refused before the API: values the action's schema refuses, or a request the MCP protocol refuses |
| `not_available` | The action is not in the active version (answered with the message above) |
| `slice_error` | SLICE itself failed during the call; the API is never blamed for it |

The note is written after the response has left: the agent never waits for it, and a note the database refuses only
reaches the server's log (`[hosted-mcp] noting calls failed:`), never the agent. An agent that leaves before the answer
gets its call noted with the result it would have read. A note still unwritten when the server stops is lost. Deleting
an MCP, or the account that owns it, deletes its notes. The downloadable kit notes nothing.

At most 10,000 calls are noted per MCP and per day (a day of UTC, as `cappedDays` of
[`GET /api/mcps/:id/usage`](#get-apimcpsidusage) reads it). Past that, the calls are served as usual but not noted until
midnight UTC; the other MCPs of the account are noted as before. Two requests noted at the same moment never go past
the limit.

The notes are kept 30 days. A cleanup, run when the server starts and then every hour, deletes the notes of the calls
that arrived more than 30 days before. A cleanup that fails (database out of reach) only reaches the server's log
(`[mcp-calls] cleanup failed:`); the next one tries again.

**No expiry:** a configuration is served whatever its age, and no cleanup deletes it. `SLICE_HOSTED_TTL_HOURS` is
ignored.

**Responses outside the MCP protocol**

| HTTP | Body | Cause |
|---|---|---|
| 404 | `{ "error": "Unknown MCP id." }` | No configuration under this id, including a deleted MCP |
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
| No disk writes for uploads and bundles | Uploads use in-memory storage; ZIPs are built in memory and streamed. Hosted configurations live in the database (PostgreSQL, or the embedded PGlite files under `SLICE_DATA_DIR` outside production). |
| Header-injection safe download name | The `Content-Disposition` file name is reduced to `[a-z0-9-]` before use. |

**Known limitation:** the SSRF guard checks DNS resolution before the request, not the connection itself.
A hostname that resolves to a public address at check time and to a private one at request time (DNS rebinding) is not blocked.
