// Amorce de recette « API key » — à évaluer dans la page de l'application lancée par `pnpm dev`
// (http://localhost:5173). Ouvre une session pour recette@slice.local (POST /api/dev/sign-in,
// route montée seulement si NODE_ENV vaut development ou test), puis prend, ou crée s'il n'existe
// pas, un MCP hébergé par état que la page « API key » sait afficher :
// - « Recette Key Empty » : à clé d'API, sans clé (la page montre le champ vide) ;
// - « Recette Key Saved » : à clé d'API, clé enregistrée (« Saved on <date> ») ;
// - « Recette Token Unreadable » : à jeton, clé enregistrée puis rendue illisible par la route de
//   recette POST /api/dev/mcps/:id/api-key/garble (« This key can no longer be read. Replace it. ») ;
// - « Recette OAuth2 » : en OAuth2 (« This MCP gets its access from your agent on every call. ») ;
// - « Recette Public » : sans accès (« This MCP needs no API key. »).
// Sur « My MCPs », les deux premiers et le MCP à jeton ont le bouton « API key », les deux autres non.
// Un MCP déjà présent est réutilisé, et son état de clé remis : au plus 11 appels, sous la limite
// de 30 requêtes par minute de /api/*.
// Place enfin la page sur /mcps. L'outil de passe visuelle (--amorce) la recharge ensuite.
// À la main : coller ce code dans la console du navigateur, puis recharger la page.
// Une amorce par état ouvre ensuite la page de ce MCP : amorce-api-key-<état>.js.
const RECETTE_KEY = 'slice-recette-key-0123456789abcdefghijkl';

/** The five MCPs, by the API's name as the page shows it. */
const RECETTE_MCPS = [
  { title: 'Recette Key Empty', upstreamAuth: { type: 'apiKey', headerName: 'X-API-Key' }, key: 'none' },
  { title: 'Recette Key Saved', upstreamAuth: { type: 'apiKey', headerName: 'X-API-Key' }, key: 'saved' },
  { title: 'Recette Token Unreadable', upstreamAuth: { type: 'bearer' }, key: 'unreadable' },
  {
    title: 'Recette OAuth2',
    upstreamAuth: { type: 'oauth2', tokenUrl: 'https://auth.example.com/token' },
    key: null,
  },
  { title: 'Recette Public', upstreamAuth: { type: 'none' }, key: null },
];

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

/** An order on a key, at `url`: refused, it stops the primer with its HTTP status. */
async function keyOrder(url, init) {
  const res = await fetch(url, init);
  if (!res.ok) throw new Error(`Recette order ${init.method} ${url} refused (HTTP ${res.status})`);
}

for (const { title, upstreamAuth, key } of RECETTE_MCPS) {
  const id = mcps.find((mcp) => mcp.apiName === title)?.id ?? (await createMcp(title, upstreamAuth));
  if (key === 'none') await keyOrder(`/api/mcps/${id}/api-key`, { method: 'DELETE' });
  if (key === 'saved' || key === 'unreadable') {
    await keyOrder(`/api/mcps/${id}/api-key`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ apiKey: RECETTE_KEY }),
    });
  }
  if (key === 'unreadable') await keyOrder(`/api/dev/mcps/${id}/api-key/garble`, { method: 'POST' });
}

window.history.replaceState({}, '', '/mcps');
