// Amorce de recette « History » — à évaluer dans la page de l'application lancée par `pnpm dev`
// (http://localhost:5173). Ouvre une session pour recette@slice.local (POST /api/dev/sign-in,
// route montée seulement si NODE_ENV vaut development ou test), crée un MCP hébergé dont la
// version 1 coche deux actions sur trois, puis place la page sur /mcps/<id>/history.
// L'outil de passe visuelle (--amorce) recharge ensuite la page : elle rouvre « History ».
// À la main : coller ce code dans la console du navigateur, puis recharger la page.
const signIn = await fetch('/api/dev/sign-in', { method: 'POST' });
if (!signIn.ok) throw new Error(`Recette session refused (HTTP ${signIn.status})`);

const rawSpec = `openapi: 3.0.3
info: { title: Recette Notes, version: "1.0" }
servers: [{ url: https://api.example.com/v1 }]
paths:
  /notes:
    get:
      operationId: listNotes
      summary: List notes
      responses: { '200': { description: ok } }
    post:
      operationId: createNote
      summary: Create a note
      responses: { '201': { description: created } }
  /notes/{id}:
    delete:
      operationId: deleteNote
      summary: Delete a note
      parameters: [{ name: id, in: path, required: true, schema: { type: string } }]
      responses: { '204': { description: deleted } }
`;

const host = await fetch('/api/host', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({
    parsedSpec: {},
    rawSpec,
    selectedIds: ['GET /notes', 'POST /notes'],
    config: {
      mcpName: 'recette-notes',
      baseUrl: 'https://api.example.com/v1',
      upstreamAuth: { type: 'bearer' },
      hosting: 'cloud',
      mode: 'remote',
      includeParamDescriptions: false,
      retryOnServerError: false,
    },
  }),
});
if (!host.ok) throw new Error(`Recette MCP refused (HTTP ${host.status})`);
const { id } = await host.json();
window.history.replaceState({}, '', `/mcps/${id}/history`);
