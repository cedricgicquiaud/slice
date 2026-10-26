/**
 * The usage of an MCP, as its "Usage" page shows it (D10): by action, the calls
 * agents made, read from their notes (D3). Never a value, a response or a token:
 * the notes keep none.
 */
import { and, asc, count, desc, eq, gte, isNotNull, max, sql } from 'drizzle-orm';
import type { Database } from '../db/client';
import { connectorActions, connectorApiActions, connectorCalls, connectorVersions, connectors } from '../db/schema';
import type { CallResult } from './mcp-calls';
import { apiNameOf } from './mcp-versions';

/** The page shows the last 30 days (D9). */
const PERIOD_MS = 30 * 24 * 3_600_000;

/** At most 10,000 calls are noted per MCP and per day (D8). */
const DAILY_CAP = 10_000;

/** The page lists the 50 most recent calls (D10). */
const RECENT_CALLS = 50;

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
  /** The active version's actions, in their order, then the API's other actions called in the period. */
  actions: ActionUsage[];
  /** The days of the period (`YYYY-MM-DD`, UTC) on which the cap was reached: later calls went unnoted. */
  cappedDays: string[];
  /** The 50 most recent calls, newest first. */
  recentCalls: RecentCall[];
}

/** One call, as the list of recent calls shows it (D10). */
export interface RecentCall {
  /** ISO date the call arrived at SLICE. */
  calledAt: string;
  action: string;
  /** The action's label, else its name. */
  label: string;
  result: CallResult;
  durationMs: number;
  /** The number of the version active when the call arrived. */
  version: number;
}

/**
 * The usage of the MCP `id` of `workspaceId` at `now`, or `undefined` when
 * `workspaceId` has no such MCP, whoever else owns it (D13).
 */
export async function readMcpUsage(
  database: Database,
  workspaceId: string,
  id: string,
  now: Date
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

  const inPeriod = and(
    eq(connectorCalls.connectorId, id),
    gte(connectorCalls.calledAt, new Date(now.getTime() - PERIOD_MS))
  );
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
    .where(inPeriod)
    .groupBy(connectorCalls.action);
  const statsOf = new Map(stats.map((row) => [row.action, row]));
  const lineOf = (name: string, label: string, available: boolean): ActionUsage => {
    const row = statsOf.get(name);
    return {
      name,
      label,
      available,
      calls: row?.calls ?? 0,
      succeeded: row?.succeeded ?? 0,
      averageDurationMs: row?.averageDurationMs ?? null,
      lastCalledAt: row?.lastCalledAt?.toISOString() ?? null,
    };
  };

  const actions: ActionUsage[] = [];
  const activeNames = new Set<string>();
  for (const { name, label } of active) {
    if (name === null || label === null) continue;
    activeNames.add(name);
    actions.push(lineOf(name, label, true));
  }
  // The other actions of the API called in the period, in the API's order (D10).
  const apiActions = await db
    .select({ name: connectorApiActions.name, label: connectorApiActions.label })
    .from(connectorApiActions)
    .where(eq(connectorApiActions.connectorId, id))
    .orderBy(asc(connectorApiActions.position));
  for (const { name, label } of apiActions) {
    if (!activeNames.has(name) && statsOf.has(name)) actions.push(lineOf(name, label, false));
  }

  // The page tells a capped day from the notes themselves: that day holds the cap's count (D8).
  const day = sql<string>`to_char(${connectorCalls.calledAt} at time zone 'UTC', 'YYYY-MM-DD')`;
  const capped = await db
    .select({ day })
    .from(connectorCalls)
    .where(inPeriod)
    .groupBy(day)
    .having(sql`count(*) >= ${DAILY_CAP}`)
    .orderBy(day);

  const labelOf = new Map(apiActions.map(({ name, label }) => [name, label]));
  const recent = await db
    .select()
    .from(connectorCalls)
    .where(eq(connectorCalls.connectorId, id))
    .orderBy(desc(connectorCalls.calledAt), desc(connectorCalls.id))
    .limit(RECENT_CALLS);
  const recentCalls = recent.map(({ calledAt, action, result, status, durationMs, version }) => ({
    calledAt: calledAt.toISOString(),
    action,
    label: labelOf.get(action) ?? action,
    // The table keeps a status code for a failure, and for a failure only.
    result: result === 'failed' ? { kind: result, status: status! } : { kind: result },
    durationMs,
    version,
  }));
  return { apiName: apiNameOf(first), actions, cappedDays: capped.map((row) => row.day), recentCalls };
}
