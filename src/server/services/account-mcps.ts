/**
 * The MCPs of an account, as its "My MCPs" page shows them (D9).
 */
import { count, desc, eq } from 'drizzle-orm';
import type { Database } from '../db/client';
import { connectorActions, connectors } from '../db/schema';

/** One line of the list. */
export interface AccountMcp {
  id: string;
  /** The API's name as read in its description. */
  apiName: string | null;
  actionCount: number;
  /** ISO creation date. */
  createdAt: string;
}

export interface AccountMcps {
  /** The MCPs of `workspaceId`, newest first. */
  list(workspaceId: string): Promise<AccountMcp[]>;
}

export function createAccountMcps(database: Database): AccountMcps {
  const { db } = database;
  return {
    async list(workspaceId) {
      const rows = await db
        .select({
          id: connectors.id,
          apiName: connectors.apiName,
          createdAt: connectors.createdAt,
          actionCount: count(connectorActions.position),
        })
        .from(connectors)
        .leftJoin(connectorActions, eq(connectorActions.connectorId, connectors.id))
        .where(eq(connectors.workspaceId, workspaceId))
        .groupBy(connectors.id)
        .orderBy(desc(connectors.createdAt));
      return rows.map((row) => ({ ...row, createdAt: row.createdAt.toISOString() }));
    },
  };
}
