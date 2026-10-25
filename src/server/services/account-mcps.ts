/**
 * The MCPs of an account, as its "My MCPs" page shows them (D9).
 */
import { count, desc, eq } from 'drizzle-orm';
import type { Database } from '../db/client';
import { connectorActions, connectors } from '../db/schema';

/** One line of the list. */
export interface AccountMcp {
  id: string;
  /** The API's name as read in its description, else its domain. */
  apiName: string;
  actionCount: number;
  /** ISO creation date. */
  createdAt: string;
}

export interface AccountMcps {
  /** The MCPs of `workspaceId`, newest first. */
  list(workspaceId: string): Promise<AccountMcp[]>;
  /** Delete the MCP `id` of `workspaceId`, with its actions, at once (D10). */
  delete(workspaceId: string, id: string): Promise<void>;
}

export function createAccountMcps(database: Database): AccountMcps {
  const { db } = database;
  return {
    async list(workspaceId) {
      const rows = await db
        .select({
          id: connectors.id,
          apiName: connectors.apiName,
          baseUrl: connectors.baseUrl,
          createdAt: connectors.createdAt,
          actionCount: count(connectorActions.position),
        })
        .from(connectors)
        .leftJoin(connectorActions, eq(connectorActions.connectorId, connectors.id))
        .where(eq(connectors.workspaceId, workspaceId))
        .groupBy(connectors.id)
        .orderBy(desc(connectors.createdAt));
      return rows.map(({ id, apiName, baseUrl, actionCount, createdAt }) => ({
        id,
        apiName: apiName ?? new URL(baseUrl).hostname,
        actionCount,
        createdAt: createdAt.toISOString(),
      }));
    },
    async delete(_workspaceId, id) {
      await db.delete(connectors).where(eq(connectors.id, id));
    },
  };
}
