// Amorce de recette « API key », état « none » — à évaluer dans la page de l'application lancée par
// `pnpm dev` (http://localhost:5173). Ouvre une session pour recette@slice.local (POST
// /api/dev/sign-in, route montée seulement si NODE_ENV vaut development ou test), prend le MCP
// « Recette Public » du compte, ou le crée s'il n'existe pas, comme amorce-api-key.js. Ce MCP est sans
// accès : la page montre « This MCP needs no API key. », sans champ ni bouton. Place enfin la page sur
// /mcps/<id>/api- key. Au plus 3 appels, sous la limite de 30 requêtes par minute de /api/*. L'outil
// de passe visuelle (--amorce) recharge ensuite la page : elle rouvre « API key ».
// À la main : coller ce code dans la console du navigateur, puis recharger la page.
const TITLE = 'Recette Public';
const UPSTREAM_AUTH = { type: 'none' };

const signIn = await fetch('/api/dev/sign-in', { method: 'POST' });
if (!signIn.ok) throw new Error(`Recette session refused (HTTP ${signIn.status})`);

const listed = await fetch('/api/mcps');
if (!listed.ok) throw new Error(`Recette list refused (HTTP ${listed.status})`);
const { mcps } = await listed.json();

/** One hosted MCP of a single action, reaching its API as `upstreamAuth` says. */
async function createMcp(title, upstreamAuth) {
  const rawSpec = `openapi: 3.0.3
info: { title: ${title}, version: "1.0" }
servers: [{ url: https://api.example.com/v1 }]
paths:
  /notes:
    get:
      operationId: listNotes
      summary: List notes
      responses: { '200': { description: ok } }
`;
  const host = await fetch('/api/host', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      parsedSpec: {},
      rawSpec,
      selectedIds: ['GET /notes'],
      config: {
        mcpName: title.toLowerCase().replaceAll(' ', '-'),
        baseUrl: 'https://api.example.com/v1',
        upstreamAuth,
        hosting: 'cloud',
        mode: 'remote',
        includeParamDescriptions: false,
        retryOnServerError: false,
      },
    }),
  });
  if (!host.ok) throw new Error(`Recette MCP ${title} refused (HTTP ${host.status})`);
  return (await host.json()).id;
}

const existing = mcps.find((mcp) => mcp.apiName === TITLE);
const id = existing?.id ?? (await createMcp(TITLE, UPSTREAM_AUTH));

window.history.replaceState({}, '', `/mcps/${id}/api-key`);
