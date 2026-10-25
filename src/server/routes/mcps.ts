/**
 * The signed-in account's MCPs (D9): `GET /api/mcps` lists those of its
 * workspace. Mounted under the session guard, which sets
 * `res.locals.workspaceId`: another workspace's MCPs are out of reach.
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

  return router;
}
