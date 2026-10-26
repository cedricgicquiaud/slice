/**
 * The MCPs of an account, as its "My MCPs" page shows them (D9).
 */
import { and, count, desc, eq, isNotNull } from 'drizzle-orm';
import type { Database } from '../db/client';
import { connectorActions, connectorVersions, connectors } from '../db/schema';
import { apiNameOf, readMcpHistory, type McpHistory } from './mcp-versions';

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
  /**
   * Delete the MCP `id` of `workspaceId`, with its actions, at once (D10).
   * `false` when `workspaceId` has no such MCP, whoever else owns it (contract 17).
   */
  delete(workspaceId: string, id: string): Promise<boolean>;
  /** The versions of the MCP `id` of `workspaceId` (D8), or `undefined` when there is no such MCP. */
  history(workspaceId: string, id: string): Promise<McpHistory | undefined>;
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
        // The count is the active version's (D11).
        .leftJoin(
          connectorVersions,
          and(eq(connectorVersions.connectorId, connectors.id), isNotNull(connectorVersions.activeSince))
        )
        .leftJoin(
          connectorActions,
          and(
            eq(connectorActions.connectorId, connectorVersions.connectorId),
            eq(connectorActions.version, connectorVersions.number)
          )
        )
        .where(eq(connectors.workspaceId, workspaceId))
        .groupBy(connectors.id)
        .orderBy(desc(connectors.createdAt));
      return rows.map(({ id, apiName, baseUrl, actionCount, createdAt }) => ({
        id,
        apiName: apiNameOf({ apiName, baseUrl }),
        actionCount,
        createdAt: createdAt.toISOString(),
      }));
    },
    async delete(workspaceId, id) {
      const deleted = await db
        .delete(connectors)
        .where(and(eq(connectors.id, id), eq(connectors.workspaceId, workspaceId)))
        .returning();
      return deleted.length > 0;
    },
    history: (_workspaceId, id) => readMcpHistory(database, id),
  };
}
