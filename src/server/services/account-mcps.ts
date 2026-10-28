/**
 * The MCPs of an account, as its "My MCPs" page shows them (D9).
 */
import { and, count, desc, eq, isNotNull } from 'drizzle-orm';
import type { McpSelectionChange, UpstreamAuthType } from '@shared/types';
import type { Database } from '../db/client';
import { connectorActions, connectorVersions, connectors } from '../db/schema';
import { apiNameOf, readMcpHistory, restoreMcpVersion, type McpHistory, type RestoreOutcome } from './mcp-versions';
import { readMcpSelection, saveMcpSelection, type McpSelection, type SaveOutcome } from './mcp-selection';
import { readMcpUsage, type McpUsage } from './mcp-usage';

/** One line of the list. */
export interface AccountMcp {
  id: string;
  /** The API's name as read in its description, else its domain. */
  apiName: string;
  actionCount: number;
  /** How the MCP reaches its API: only an API key or a bearer token takes a saved key (D8). */
  upstreamAuthType: UpstreamAuthType;
  /** ISO creation date. */
  createdAt: string;
}

export interface AccountMcps {
  /** The MCPs of `workspaceId`, newest first. */
  list(workspaceId: string): Promise<AccountMcp[]>;
  /**
   * Delete the MCP `id` of `workspaceId`, with its versions and its list of actions, at once (D10).
   * `false` when `workspaceId` has no such MCP, whoever else owns it (contract 17).
   */
  delete(workspaceId: string, id: string): Promise<boolean>;
  /** Whether `workspaceId` has the MCP `id`: `false` for an unknown id as for another account's MCP. */
  owns(workspaceId: string, id: string): Promise<boolean>;
  /** The versions of the MCP `id` of `workspaceId` (D8), or `undefined` when there is no such MCP. */
  history(workspaceId: string, id: string): Promise<McpHistory | undefined>;
  /** The selection of the MCP `id` of `workspaceId`, for "Edit actions" (D2), or `undefined` when there is no such MCP. */
  selection(workspaceId: string, id: string): Promise<McpSelection | undefined>;
  /** Save `change` as the next version of the MCP `id` of `workspaceId`, active at once (D4). */
  saveSelection(workspaceId: string, id: string, change: McpSelectionChange): Promise<SaveOutcome>;
  /** Make version `number` of the MCP `id` of `workspaceId` the active one again, from now (D9). */
  restore(workspaceId: string, id: string, number: number): Promise<RestoreOutcome>;
  /** The usage of the MCP `id` of `workspaceId` over the last 30 days (D10), or `undefined` when there is no such MCP. */
  usage(workspaceId: string, id: string): Promise<McpUsage | undefined>;
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
          upstreamAuthType: connectors.upstreamAuthType,
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
      return rows.map(({ id, apiName, baseUrl, actionCount, upstreamAuthType, createdAt }) => ({
        id,
        apiName: apiNameOf({ apiName, baseUrl }),
        actionCount,
        upstreamAuthType,
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
    async owns(workspaceId, id) {
      const [owned] = await db
        .select({ id: connectors.id })
        .from(connectors)
        .where(and(eq(connectors.id, id), eq(connectors.workspaceId, workspaceId)));
      return owned !== undefined;
    },
    history: (workspaceId, id) => readMcpHistory(database, workspaceId, id),
    selection: (workspaceId, id) => readMcpSelection(database, workspaceId, id),
    saveSelection: (workspaceId, id, change) => saveMcpSelection(database, workspaceId, id, change, new Date()),
    restore: (workspaceId, id, number) => restoreMcpVersion(database, workspaceId, id, number, new Date()),
    usage: (workspaceId, id) => readMcpUsage(database, workspaceId, id, new Date()),
  };
}
