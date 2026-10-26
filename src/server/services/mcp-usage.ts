/**
 * The usage of an MCP, as its "Usage" page shows it (D10): by action, the calls
 * agents made, read from their notes (D3). Never a value, a response or a token:
 * the notes keep none.
 */
import { and, asc, count, eq, isNotNull, max, sql } from 'drizzle-orm';
import type { Database } from '../db/client';
import { connectorActions, connectorCalls, connectorVersions, connectors } from '../db/schema';
import { apiNameOf } from './mcp-versions';

/** The calls of one action. */
export interface ActionUsage {
  name: string;
  label: string;
  /** Whether the action is one of the active version's. */
  available: boolean;
  calls: number;
  succeeded: number;
  /** The average duration of the succeeded calls, in milliseconds; `null` without any. */
  averageDurationMs: number | null;
  /** ISO date of the last call, `null` without any. */
  lastCalledAt: string | null;
}

export interface McpUsage {
  /** The API's name as read in its description, else its domain. */
  apiName: string;
  /** The active version's actions, in their order. */
  actions: ActionUsage[];
}

/**
 * The usage of the MCP `id` of `workspaceId` at `now`, or `undefined` when
 * `workspaceId` has no such MCP, whoever else owns it (D13).
 */
export async function readMcpUsage(
  database: Database,
  workspaceId: string,
  id: string,
  _now: Date
): Promise<McpUsage | undefined> {
  const { db } = database;
  const active = await db
    .select({
      apiName: connectors.apiName,
      baseUrl: connectors.baseUrl,
      name: connectorActions.name,
      label: connectorActions.label,
    })
    .from(connectors)
    .leftJoin(
      connectorVersions,
      and(eq(connectorVersions.connectorId, connectors.id), isNotNull(connectorVersions.activeSince))
    )
    .leftJoin(
      connectorActions,
      and(eq(connectorActions.connectorId, connectorVersions.connectorId), eq(connectorActions.version, connectorVersions.number))
    )
    .where(and(eq(connectors.id, id), eq(connectors.workspaceId, workspaceId)))
    .orderBy(asc(connectorActions.position));
  const [first] = active;
  if (!first) return undefined;

  const succeeded = sql`${connectorCalls.result} = 'succeeded'`;
  const stats = await db
    .select({
      action: connectorCalls.action,
      calls: count(),
      succeeded: sql<number>`count(*) filter (where ${succeeded})`.mapWith(Number),
      averageDurationMs: sql<number | null>`round(avg(${connectorCalls.durationMs}) filter (where ${succeeded}))`.mapWith(Number),
      lastCalledAt: max(connectorCalls.calledAt),
    })
    .from(connectorCalls)
    .where(eq(connectorCalls.connectorId, id))
    .groupBy(connectorCalls.action);
  const statsOf = new Map(stats.map((row) => [row.action, row]));

  const actions: ActionUsage[] = [];
  for (const { name, label } of active) {
    if (name === null || label === null) continue;
    const row = statsOf.get(name);
    actions.push({
      name,
      label,
      available: true,
      calls: row?.calls ?? 0,
      succeeded: row?.succeeded ?? 0,
      averageDurationMs: row?.averageDurationMs ?? null,
      lastCalledAt: row?.lastCalledAt?.toISOString() ?? null,
    });
  }
  return { apiName: apiNameOf(first), actions };
}
