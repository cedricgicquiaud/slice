/**
 * Dev only — POST /api/dev/mcps/:id/api-key/garble makes the key of an MCP
 * unreadable, as a changed SLICE_ENCRYPTION_KEY would, so the recette primer
 * shows the "API key" page in that state (D17). `createApp` mounts it only where
 * NODE_ENV says development or test: never in production, nor without NODE_ENV.
 */
import { randomBytes } from 'node:crypto';
import type { RequestHandler } from 'express';
import type { McpApiKeys } from '../services/mcp-api-key';

/**
 * `underAnotherKey` writes to the same keys, sealed under another encryption key:
 * the key saved through it is one `apiKeys` can no longer read.
 */
export function devGarbleApiKey(apiKeys: McpApiKeys, underAnotherKey: McpApiKeys): RequestHandler {
  return async (req, res) => {
    const id = String(req.params.id);
    const state = await apiKeys.stateOf(id);
    // The date stays the saving's: only the encryption key changed (D3).
    await underAnotherKey.save(id, randomBytes(30).toString('base64url'), state!.savedAt);
    res.status(204).end();
  };
}
