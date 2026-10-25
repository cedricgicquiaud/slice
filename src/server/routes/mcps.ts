/**
 * The signed-in account's MCPs: `GET /api/mcps` lists those of its workspace
 * (D9), `DELETE /api/mcps/:id` deletes one at once (D10). Mounted under the
 * session guard, which sets `res.locals.workspaceId`: another workspace's
 * MCPs are out of reach.
 */
import { Router } from 'express';
import type { AccountMcps } from '../services/account-mcps';

export function createMcpsRouter(accountMcps: AccountMcps): Router {
  const router = Router();

  router.get('/', async (req, res) => {
    const mcps = await accountMcps.list(res.locals.workspaceId);
    const origin = `${req.protocol}://${req.get('host')}`;
    res.json({ mcps: mcps.map((mcp) => ({ ...mcp, url: `${origin}/m/${mcp.id}` })) });
  });

  router.delete('/:id', async (req, res) => {
    await accountMcps.delete(res.locals.workspaceId, req.params.id);
    res.status(204).end();
  });

  return router;
}
