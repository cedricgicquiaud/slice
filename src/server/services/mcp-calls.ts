/**
 * The note of each action call an agent makes to a hosted MCP (D3): its action,
 * the version active when it arrived, its date, its result and its duration;
 * never the values the agent sent, the API's response or error message, nor the token.
 */
import { asc, eq, lt, sql } from 'drizzle-orm';
import type { Database } from '../db/client';
import { connectorApiActions, connectorCalls, connectors } from '../db/schema';

/** What became of an action call (D4); a failure keeps the API's status code. */
export type CallResult =
  | { kind: 'succeeded' }
  | { kind: 'failed'; status: number }
  | { kind: 'api_unreachable' }
  | { kind: 'invalid_request' }
  | { kind: 'not_available' }
  | { kind: 'slice_error' };

/** The note of one action call. */
export interface CallNote {
  action: string;
  /** The number of the version active when the call arrived. */
  version: number;
  /** When the call arrived at SLICE (D6). */
  calledAt: Date;
  result: CallResult;
  /** From the call's arrival to the end of its handling by SLICE (D6). */
  durationMs: number;
}

/** At most 10,000 calls are noted per MCP and per day (D8). */
const DAILY_CAP = 10_000;

/** The notes of calls are kept 30 days (D9). */
const KEPT_MS = 30 * 24 * 3_600_000;

export interface McpCalls {
  /** Write the notes of calls made to the connector `connectorId`. */
  write(connectorId: string, notes: CallNote[]): Promise<void>;
  /** The notes of the connector's calls, oldest first. */
  of(connectorId: string): Promise<CallNote[]>;
  /** Delete the notes of the calls that arrived more than 30 days before `now`, whatever their MCP (D9). */
  purgeOld(now: Date): Promise<void>;
}

export function createMcpCalls(database: Database): McpCalls {
  const { db } = database;
  return {
    async write(connectorId, notes) {
      if (notes.length === 0) return;
      const rows = notes.map(({ action, version, calledAt, result, durationMs }, position) => ({
        position,
        action,
        version,
        called_at: calledAt.toISOString(),
        result: result.kind,
        status: result.kind === 'failed' ? result.status : null,
        duration_ms: durationMs,
      }));
      await db.transaction(async (tx) => {
        // Locked until the end: two writes of the same MCP count its notes one after the other (D8).
        await tx.select({ id: connectors.id }).from(connectors).where(eq(connectors.id, connectorId)).for('update');
        // Only a call of one of the API's actions is noted (D2), while its UTC day has room left under the
        // cap (D8), in the order of the calls. In one statement, whatever the number of calls: the notes
        // travel as a single JSON value, far from PostgreSQL's limit on parameters.
        await tx.execute(sql`
          with call as (
            select *, date_trunc('day', called_at at time zone 'UTC') as utc_day
            from jsonb_to_recordset(${JSON.stringify(rows)}::jsonb)
              as call(position int, version int, action text, called_at timestamptz, result text, status int, duration_ms int)
            where exists (
              select 1 from ${connectorApiActions} where connector_id = ${connectorId} and name = call.action
            )
          ),
          note as (
            select *, row_number() over (partition by utc_day order by position) as rank from call
          ),
          day as (
            select utc_day, (
              select count(*) from ${connectorCalls}
              where connector_id = ${connectorId}
                and called_at >= utc_day at time zone 'UTC'
                and called_at < (utc_day + interval '1 day') at time zone 'UTC'
            ) as noted
            from (select distinct utc_day from note) as days
          )
          insert into ${connectorCalls} (connector_id, version, action, called_at, result, status, duration_ms)
          select ${connectorId}, note.version, note.action, note.called_at, note.result::call_result, note.status, note.duration_ms
          from note join day using (utc_day)
          where note.rank <= ${DAILY_CAP} - day.noted
          -- Written in the order of the calls: those of one request share their date (D6).
          order by note.position`);
      });
    },
    async of(connectorId) {
      const rows = await db
        .select()
        .from(connectorCalls)
        .where(eq(connectorCalls.connectorId, connectorId))
        .orderBy(asc(connectorCalls.calledAt), asc(connectorCalls.id));
      return rows.map(({ action, version, calledAt, result, status, durationMs }) => ({
        action,
        version,
        calledAt,
        // The table keeps a status code for a failure, and for a failure only.
        result: result === 'failed' ? { kind: result, status: status! } : { kind: result },
        durationMs,
      }));
    },
    async purgeOld(now) {
      await db.delete(connectorCalls).where(lt(connectorCalls.calledAt, new Date(now.getTime() - KEPT_MS)));
    },
  };
}

const CLEANUP_INTERVAL_MS = 60 * 60 * 1000;

/** Delete the notes of more than 30 days now, then every hour, until stopped (D9). */
export function startCallsCleanup(calls: McpCalls, options: { now: () => Date }): { stop(): void } {
  const run = () => {
    void calls.purgeOld(options.now());
  };
  run();
  const timer = setInterval(run, CLEANUP_INTERVAL_MS);
  timer.unref();
  return { stop: () => clearInterval(timer) };
}
