// Amorce de recette « Usage » — à évaluer dans la page de l'application lancée par `pnpm dev`
// (http://localhost:5173). Ouvre une session pour recette@slice.local (POST /api/dev/sign-in,
// route montée seulement si NODE_ENV vaut development ou test), crée le MCP « Recette Notes »
// dont l'adresse d'API est celle de SLICE lui-même, http://localhost:3001/api (la garde SSRF est
// éteinte hors production), puis l'appelle comme un agent, par de vrais `tools/call` :
// « Read health » (GET /api/health, 200 sans session) est noté « Succeeded », « Read a missing
// page » (GET /api/auth/no-such-page, que Better Auth refuse en 404) est noté « Failed (404) »,
// « Create a note », hors de la version 1, est noté « Not available ».
// Elle place enfin la page sur /mcps/<id>/usage. Une seule création de MCP par passage : le
// serveur limite /api/* à 30 requêtes par minute.
// L'outil de passe visuelle (--amorce) recharge ensuite la page : elle rouvre « Usage ».
// À la main : coller ce code dans la console du navigateur, puis recharger la page.
const signIn = await fetch('/api/dev/sign-in', { method: 'POST' });
if (!signIn.ok) throw new Error(`Recette session refused (HTTP ${signIn.status})`);

const api = 'http://localhost:3001/api';
const rawSpec = `openapi: 3.0.3
info: { title: Recette Notes, version: "1.0" }
servers: [{ url: ${api} }]
paths:
  /health:
    get:
      operationId: readHealth
      summary: Read health
      responses: { '200': { description: ok } }
  /auth/no-such-page:
    get:
      operationId: readMissingPage
      summary: Read a missing page
      responses: { '404': { description: not found } }
  /notes:
    post:
      operationId: createNote
      summary: Create a note
      responses: { '201': { description: created } }
`;

const host = await fetch('/api/host', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({
    parsedSpec: {},
    rawSpec,
    selectedIds: ['GET /health', 'GET /auth/no-such-page'],
    config: {
      mcpName: 'recette-notes',
      baseUrl: api,
      upstreamAuth: { type: 'none' },
      hosting: 'cloud',
      mode: 'remote',
      includeParamDescriptions: false,
      retryOnServerError: false,
    },
  }),
});
if (!host.ok) throw new Error(`Recette MCP refused (HTTP ${host.status})`);
// The address is SLICE's own (http://localhost:3001/m/<id>): Vite relays /api only, and /m answers any origin.
const { id, url } = await host.json();

/** One action call, as an agent makes it at the MCP's address. */
async function callAction(name, rpcId) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream' },
    body: JSON.stringify({ jsonrpc: '2.0', id: rpcId, method: 'tools/call', params: { name, arguments: {} } }),
  });
  if (!res.ok) throw new Error(`Recette call of ${name} refused (HTTP ${res.status})`);
  await res.text();
}

await callAction('read_health', 1);
await callAction('read_a_missing_page', 2);
await callAction('create_note', 3);
window.history.replaceState({}, '', `/mcps/${id}/usage`);
