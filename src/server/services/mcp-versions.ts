/**
 * The versions of an MCP, as its "History" page shows them (D8).
 */
import { and, asc, desc, eq } from 'drizzle-orm';
import type { Database } from '../db/client';
import { connectorActions, connectorVersions, connectors } from '../db/schema';

/** One version of an MCP: a numbered, dated selection (D4). */
export interface McpVersion {
  number: number;
  /** ISO creation date. */
  createdAt: string;
  /** ISO date the version last became the active one (D8), `null` while it is not. */
  activeSince: string | null;
  /** The labels of its actions, in their order. */
  actionLabels: string[];
}

export interface McpHistory {
  /** The API's name as read in its description, else its domain. */
  apiName: string;
  /** Newest first. */
  versions: McpVersion[];
}

/** The name an MCP goes by: its API's name as read in its description, else its API's domain (D9). */
export function apiNameOf(connector: { apiName: string | null; baseUrl: string }): string {
  return connector.apiName ?? new URL(connector.baseUrl).hostname;
}

/**
 * The history of the MCP `id` of `workspaceId`, or `undefined` when `workspaceId`
 * has no such MCP, whoever else owns it (D12).
 */
export async function readMcpHistory(
  database: Database,
  workspaceId: string,
  id: string
): Promise<McpHistory | undefined> {
  const { db } = database;
  const [connector] = await db
    .select({ apiName: connectors.apiName, baseUrl: connectors.baseUrl })
    .from(connectors)
    .where(and(eq(connectors.id, id), eq(connectors.workspaceId, workspaceId)));
  if (!connector) return undefined;
  const versions = await db
    .select()
    .from(connectorVersions)
    .where(eq(connectorVersions.connectorId, id))
    .orderBy(desc(connectorVersions.number));
  const actions = await db
    .select({ version: connectorActions.version, label: connectorActions.label })
    .from(connectorActions)
    .where(eq(connectorActions.connectorId, id))
    .orderBy(asc(connectorActions.position));
  return {
    apiName: apiNameOf(connector),
    versions: versions.map((version) => ({
      number: version.number,
      createdAt: version.createdAt.toISOString(),
      activeSince: version.activeSince?.toISOString() ?? null,
      actionLabels: actions.filter((action) => action.version === version.number).map((action) => action.label),
    })),
  };
}
