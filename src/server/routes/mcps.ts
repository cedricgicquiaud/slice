/**
 * The signed-in account's MCPs: `GET /api/mcps` lists those of its workspace
 * (D9), `GET /api/mcps/:id/versions` reads the versions of one (D8),
 * `DELETE /api/mcps/:id` deletes one at once (D10). Mounted under the
 * session guard, which sets `res.locals.workspaceId`: another workspace's
 * MCPs are out of reach.
 */
import { Router } from 'express';
import type { ApiErrorPayload } from '@shared/types';
import { mcpSelectionChangeSchema } from '@shared/config-schema';
import type { AccountMcps } from '../services/account-mcps';
import type { SaveRefusal } from '../services/mcp-selection';

const UNKNOWN_MCP: ApiErrorPayload = { code: 'NOT_FOUND', message: 'Unknown MCP id.' };

function invalidSelection(message: string): ApiErrorPayload {
  return { code: 'INVALID_SELECTION', message };
}

/** How each refusal of a "Save" is answered: nothing is saved in any case. */
const SAVE_REFUSALS: Record<SaveRefusal, { status: number; payload: ApiErrorPayload }> = {
  // Another account's MCP answers like a missing one (D12).
  'unknown-mcp': { status: 404, payload: UNKNOWN_MCP },
  // Another tab replaced the version the screen started from (D13).
  'changed-meanwhile': {
    status: 409,
    payload: { code: 'CONFLICT', message: 'This MCP changed in the meantime. Reload to see its current actions.' },
  },
  'unknown-action': { status: 400, payload: invalidSelection("This MCP's API has no such action.") },
  unchanged: { status: 400, payload: invalidSelection('This selection is already the active version.') },
};

export function createMcpsRouter(accountMcps: AccountMcps): Router {
  const router = Router();

  router.get('/', async (req, res) => {
    const mcps = await accountMcps.list(res.locals.workspaceId);
    const origin = `${req.protocol}://${req.get('host')}`;
    res.json({ mcps: mcps.map((mcp) => ({ ...mcp, url: `${origin}/m/${mcp.id}` })) });
  });

  router.get('/:id/versions', async (req, res) => {
    const history = await accountMcps.history(res.locals.workspaceId, req.params.id);
    if (!history) {
      res.status(404).json(UNKNOWN_MCP);
      return;
    }
    res.json(history);
  });

  router.get('/:id/selection', async (req, res) => {
    const selection = await accountMcps.selection(res.locals.workspaceId, req.params.id);
    if (!selection) {
      res.status(404).json(UNKNOWN_MCP);
      return;
    }
    res.json(selection);
  });

  router.post('/:id/versions', async (req, res) => {
    // Only the selection changes (D3): anything else refuses the whole change, before anything is saved.
    const change = mcpSelectionChangeSchema.safeParse(req.body);
    if (!change.success) {
      res.status(400).json(invalidSelection(change.error.issues[0]?.message ?? 'Invalid selection.'));
      return;
    }
    const outcome = await accountMcps.saveSelection(res.locals.workspaceId, req.params.id, change.data);
    if ('refused' in outcome) {
      const { status, payload } = SAVE_REFUSALS[outcome.refused];
      res.status(status).json(payload);
      return;
    }
    res.status(201).json({ number: outcome.version });
  });

  router.delete('/:id', async (req, res) => {
    if (!(await accountMcps.delete(res.locals.workspaceId, req.params.id))) {
      // Another account's MCP answers like a missing one: an id reveals nothing (contract 17).
      res.status(404).json(UNKNOWN_MCP);
      return;
    }
    res.status(204).end();
  });

  return router;
}
