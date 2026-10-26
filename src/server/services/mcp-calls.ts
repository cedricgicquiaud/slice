/**
 * The note of each action call an agent makes to a hosted MCP (D3): its action,
 * the version active when it arrived, its date, its result and its duration;
 * never the values the agent sent, the API's response or error message, nor the token.
 */
import { asc, eq, sql } from 'drizzle-orm';
import type { Database } from '../db/client';
import { connectorApiActions, connectorCalls } from '../db/schema';

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

export interface McpCalls {
  /** Write the notes of calls made to the connector `connectorId`. */
  write(connectorId: string, notes: CallNote[]): Promise<void>;
  /** The notes of the connector's calls, oldest first. */
  of(connectorId: string): Promise<CallNote[]>;
}

export function createMcpCalls(database: Database): McpCalls {
  const { db } = database;
  return {
    async write(connectorId, notes) {
      if (notes.length === 0) return;
      const rows = notes.map(({ action, version, calledAt, result, durationMs }) => ({
        action,
        version,
        called_at: calledAt.toISOString(),
        result: result.kind,
        status: result.kind === 'failed' ? result.status : null,
        duration_ms: durationMs,
      }));
      // Only a call of one of the API's actions is noted (D2). In one statement, whatever the
      // number of calls: the notes travel as a single JSON value, far from PostgreSQL's limit on parameters.
      await db.execute(sql`
        insert into ${connectorCalls} (connector_id, version, action, called_at, result, status, duration_ms)
        select ${connectorId}, note.version, note.action, note.called_at, note.result::call_result, note.status, note.duration_ms
        from jsonb_to_recordset(${JSON.stringify(rows)}::jsonb)
          as note(version int, action text, called_at timestamptz, result text, status int, duration_ms int)
        where exists (
          select 1 from ${connectorApiActions} where connector_id = ${connectorId} and name = note.action
        )`);
    },
    async of(connectorId) {
      const rows = await db
        .select()
        .from(connectorCalls)
        .where(eq(connectorCalls.connectorId, connectorId))
        .orderBy(asc(connectorCalls.calledAt));
      return rows.map(({ action, version, calledAt, result, status, durationMs }) => ({
        action,
        version,
        calledAt,
        // The table keeps a status code for a failure, and for a failure only.
        result: result === 'failed' ? { kind: result, status: status! } : { kind: result },
        durationMs,
      }));
    },
  };
}
