/**
 * The note of each action call an agent makes to a hosted MCP (D3): its action,
 * the version active when it arrived, its date, its result and its duration;
 * never the values the agent sent, the API's response or error message, nor the token.
 */
import { asc, eq } from 'drizzle-orm';
import type { Database } from '../db/client';
import { connectorCalls } from '../db/schema';

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
      await db.insert(connectorCalls).values(
        notes.map(({ result, ...note }) => ({
          connectorId,
          ...note,
          result: result.kind,
          status: result.kind === 'failed' ? result.status : null,
        }))
      );
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
