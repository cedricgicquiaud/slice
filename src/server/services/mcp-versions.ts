/**
 * The versions of an MCP, as its "History" page shows them (D8), and "Restore",
 * which makes one of them the active one again (D9).
 */
import { and, asc, desc, eq, isNotNull } from 'drizzle-orm';
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
  // One statement, so one moment: a "Save" or a deletion running alongside is seen whole or not at all.
  const rows = await database.db
    .select({
      apiName: connectors.apiName,
      baseUrl: connectors.baseUrl,
      number: connectorVersions.number,
      createdAt: connectorVersions.createdAt,
      activeSince: connectorVersions.activeSince,
      label: connectorActions.label,
    })
    .from(connectors)
    .innerJoin(connectorVersions, eq(connectorVersions.connectorId, connectors.id))
    .leftJoin(
      connectorActions,
      and(eq(connectorActions.connectorId, connectorVersions.connectorId), eq(connectorActions.version, connectorVersions.number))
    )
    .where(and(eq(connectors.id, id), eq(connectors.workspaceId, workspaceId)))
    .orderBy(desc(connectorVersions.number), asc(connectorActions.position));
  const [first] = rows;
  if (!first) return undefined;
  const versions: McpVersion[] = [];
  for (const row of rows) {
    let version = versions.at(-1);
    if (version?.number !== row.number) {
      version = {
        number: row.number,
        createdAt: row.createdAt.toISOString(),
        activeSince: row.activeSince?.toISOString() ?? null,
        actionLabels: [],
      };
      versions.push(version);
    }
    if (row.label !== null) version.actionLabels.push(row.label);
  }
  return { apiName: apiNameOf(first), versions };
}

/**
 * Why a "Restore" changed nothing: no such MCP in the workspace, whoever else
 * owns it (D12), or no such version of it.
 */
export type RestoreRefusal = 'unknown-mcp' | 'unknown-version';

/** How a "Restore" ends: the ISO date the version is active since, or why nothing changed. */
export type RestoreOutcome = { activeSince: string } | { refused: RestoreRefusal };

/**
 * Make version `number` of the MCP `id` of `workspaceId` the active one, from `now`,
 * without creating a version (D9).
 */
export async function restoreMcpVersion(
  database: Database,
  workspaceId: string,
  id: string,
  number: number,
  now: Date
): Promise<RestoreOutcome> {
  return database.db.transaction(async (tx) => {
    // The same lock as "Save": a "Restore" and a "Save" of the same MCP run one after the other.
    const [connector] = await tx
      .select({ id: connectors.id })
      .from(connectors)
      .where(and(eq(connectors.id, id), eq(connectors.workspaceId, workspaceId)))
      .for('update');
    if (!connector) return { refused: 'unknown-mcp' };
    const [version] = await tx
      .select({ activeSince: connectorVersions.activeSince })
      .from(connectorVersions)
      .where(and(eq(connectorVersions.connectorId, id), eq(connectorVersions.number, number)));
    if (!version) return { refused: 'unknown-version' };
    // Already the active one: it stays so, dated from its activation (D9).
    if (version.activeSince) return { activeSince: version.activeSince.toISOString() };
    // The address serves the active version only (D4): the restored one takes over at once.
    await tx
      .update(connectorVersions)
      .set({ activeSince: null })
      .where(and(eq(connectorVersions.connectorId, id), isNotNull(connectorVersions.activeSince)));
    await tx
      .update(connectorVersions)
      .set({ activeSince: now })
      .where(and(eq(connectorVersions.connectorId, id), eq(connectorVersions.number, number)));
    return { activeSince: now.toISOString() };
  });
}
