// Amorce de recette « Edit actions » — à évaluer dans la page de l'application lancée par `pnpm dev`
// (http://localhost:5173). Ouvre une session pour recette@slice.local (POST /api/dev/sign-in,
// route montée seulement si NODE_ENV vaut development ou test), puis prend le MCP « Recette Notes »
// du compte, ou le crée s'il n'existe pas : trois actions, dont deux cochées (List notes,
// Create a note). Un MCP déjà présent est réutilisé, pour ne pas buter sur la limite de débit
// au fil des passages ; si un passage précédent a changé sa sélection, elle est ramenée à ces deux
// actions (une version de plus dans son historique). Place enfin la page sur /mcps/<id>/edit.
// L'outil de passe visuelle (--amorce) recharge ensuite la page : elle rouvre « Edit actions ».
// À la main : coller ce code dans la console du navigateur, puis recharger la page.
const STARTING_SELECTION = ['GET /notes', 'POST /notes'];

const signIn = await fetch('/api/dev/sign-in', { method: 'POST' });
if (!signIn.ok) throw new Error(`Recette session refused (HTTP ${signIn.status})`);

const listed = await fetch('/api/mcps');
if (!listed.ok) throw new Error(`Recette list refused (HTTP ${listed.status})`);
const { mcps } = await listed.json();
let id = mcps.find((mcp) => mcp.apiName === 'Recette Notes')?.id;

if (!id) {
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
      selectedIds: STARTING_SELECTION,
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
  ({ id } = await host.json());
} else {
  const read = await fetch(`/api/mcps/${id}/selection`);
  if (!read.ok) throw new Error(`Recette selection refused (HTTP ${read.status})`);
  const { version, selectedIds } = await read.json();
  const sameSelection =
    selectedIds.length === STARTING_SELECTION.length && STARTING_SELECTION.every((one) => selectedIds.includes(one));
  if (!sameSelection) {
    const saved = await fetch(`/api/mcps/${id}/versions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ fromVersion: version, selectedIds: STARTING_SELECTION }),
    });
    if (!saved.ok) throw new Error(`Recette reset refused (HTTP ${saved.status})`);
  }
}

window.history.replaceState({}, '', `/mcps/${id}/edit`);
