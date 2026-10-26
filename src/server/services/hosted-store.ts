/**
 * Hosted connectors in the database: created in one transaction with the full
 * list of their API's actions and their selection as version 1, and read back
 * by id with the actions of their active version. The purge of expired
 * connectors stays here, but the server no longer starts it: an MCP never
 * expires (WAT-102, D2).
 */
import { randomBytes } from 'node:crypto';
import { and, asc, eq, isNotNull, lt, sql } from 'drizzle-orm';
import type { HttpMethod, UpstreamAuth } from '@shared/types';
import type { ApiAction, HostedMcpConfig } from './hosted-mcp-factory';
import type { Database } from '../db/client';
import { connectorActions, connectorApiActions, connectorVersions, connectors } from '../db/schema';

/** An expired connector stays this long, answering "expired", before the cleanup deletes it. */
export const EXPIRED_RETENTION_DAYS = 30;

export interface HostedStore {
  /** Store a connector and its actions at once, in `workspaceId`, created at `now`; return its unguessable id. */
  put(config: HostedMcpConfig, workspaceId: string, now: Date): Promise<{ id: string; createdAt: string }>;
  /** Read a connector back (`createdAt` and `workspaceId` set), or `undefined` if unknown. */
  get(id: string): Promise<HostedMcpConfig | undefined>;
  /** Every action of the connector's API, kept at its creation (D1), in order; none for an unknown id. */
  apiActions(id: string): Promise<ApiAction[]>;
  /** Delete, with their actions, the connectors expired for more than the retention period at `now`. */
  purgeExpired(now: Date, ttlHours: number): Promise<void>;
  /** Resolve when the database answers, reject when it is out of reach. */
  ping(): Promise<void>;
}

export function createHostedStore(database: Database): HostedStore {
  const { db } = database;
  return {
    async put(config, workspaceId, now) {
      const id = newId();
      const auth = config.upstreamAuth;
      await db.transaction(async (tx) => {
        await tx.insert(connectors).values({
          id,
          name: config.name,
          baseUrl: config.baseUrl,
          upstreamAuthType: auth.type,
          upstreamHeaderName: auth.type === 'apiKey' ? auth.headerName : null,
          upstreamTokenUrl: auth.type === 'oauth2' ? auth.tokenUrl : null,
          upstreamScopes: auth.type === 'oauth2' ? auth.scopes : null,
          createdAt: now,
          workspaceId,
          apiName: config.apiName ?? null,
        });
        const apiActions = (config.apiActions ?? []).map(({ group, description, ...action }, position) => ({
          connectorId: id,
          position,
          ...action,
          groupName: group,
          description: description ?? null,
        }));
        for (const batch of batches(apiActions)) await tx.insert(connectorApiActions).values(batch);
        // The selection becomes version 1, active from its creation (D4, D8).
        await tx.insert(connectorVersions).values({ connectorId: id, number: 1, createdAt: now, activeSince: now });
        const actions = config.endpoints.map((endpoint, position) => ({
          connectorId: id,
          version: 1,
          position,
          ...endpoint,
          label: endpoint.label ?? endpoint.name,
          // Older paths may carry a lowercase method; the column only takes uppercase.
          method: endpoint.method.toUpperCase() as HttpMethod,
        }));
        for (const batch of batches(actions)) await tx.insert(connectorActions).values(batch);
      });
      return { id, createdAt: now.toISOString() };
    },
    async get(id) {
      const [found] = await db
        .select({ connector: connectors, activeVersion: connectorVersions.number })
        .from(connectors)
        .leftJoin(
          connectorVersions,
          and(eq(connectorVersions.connectorId, connectors.id), isNotNull(connectorVersions.activeSince))
        )
        .where(eq(connectors.id, id));
      if (!found) return undefined;
      const { connector, activeVersion } = found;
      // The address serves the active version's actions, never the other versions' (D4).
      const actions = await db
        .select({
          name: connectorActions.name,
          description: connectorActions.description,
          method: connectorActions.method,
          path: connectorActions.path,
          params: connectorActions.params,
        })
        .from(connectorActions)
        .innerJoin(
          connectorVersions,
          and(
            eq(connectorVersions.connectorId, connectorActions.connectorId),
            eq(connectorVersions.number, connectorActions.version)
          )
        )
        .where(and(eq(connectorActions.connectorId, id), isNotNull(connectorVersions.activeSince)))
        .orderBy(asc(connectorActions.position));
      return {
        name: connector.name,
        ...(connector.apiName !== null && { apiName: connector.apiName }),
        baseUrl: connector.baseUrl,
        upstreamAuth: upstreamAuthOf(connector),
        endpoints: actions,
        createdAt: connector.createdAt.toISOString(),
        workspaceId: connector.workspaceId,
        ...(activeVersion !== null && { activeVersion }),
      };
    },
    async apiActions(id) {
      const actions = await db
        .select()
        .from(connectorApiActions)
        .where(eq(connectorApiActions.connectorId, id))
        .orderBy(asc(connectorApiActions.position));
      return actions.map(({ name, label, groupName, description, deprecated, method, path, params }) => ({
        name,
        label,
        group: groupName,
        ...(description !== null && { description }),
        deprecated,
        method,
        path,
        params,
      }));
    },
    async purgeExpired(now, ttlHours) {
      if (ttlHours <= 0) return;
      const cutoff = new Date(now.getTime() - ttlHours * 3_600_000 - EXPIRED_RETENTION_DAYS * 86_400_000);
      await db.delete(connectors).where(lt(connectors.createdAt, cutoff));
    },
    async ping() {
      await database.rows(sql`select 1`);
    },
  };
}

function upstreamAuthOf(connector: typeof connectors.$inferSelect): UpstreamAuth {
  const auth: UpstreamAuth = { type: connector.upstreamAuthType };
  if (connector.upstreamHeaderName !== null) auth.headerName = connector.upstreamHeaderName;
  if (connector.upstreamTokenUrl !== null) auth.tokenUrl = connector.upstreamTokenUrl;
  if (connector.upstreamScopes !== null) auth.scopes = connector.upstreamScopes;
  return auth;
}

/**
 * Rows per insert: PostgreSQL takes at most 65,535 values in one statement, and
 * an action row holds 10 of them, so a large API is written in several inserts.
 */
const ROWS_PER_INSERT = 1_000;

function batches<T>(rows: T[]): T[][] {
  const result: T[][] = [];
  for (let start = 0; start < rows.length; start += ROWS_PER_INSERT) {
    result.push(rows.slice(start, start + ROWS_PER_INSERT));
  }
  return result;
}

/** 16 random bytes → 22 url-safe base64 chars (~128 bits of entropy). */
function newId(): string {
  return randomBytes(16).toString('base64url');
}

const CLEANUP_INTERVAL_MS = 60 * 60 * 1000;

/** Purge the long-expired connectors now, then every hour, until stopped. */
export function startHostedCleanup(
  store: HostedStore,
  options: { ttlHours: number; now: () => Date }
): { stop(): void } {
  const run = () => {
    store.purgeExpired(options.now(), options.ttlHours).catch((err: unknown) => {
      // The next run retries; an unreachable database must not bring the server down.
      // eslint-disable-next-line no-console
      console.error('[hosted-store] cleanup failed:', err instanceof Error ? err.message : String(err));
    });
  };
  run();
  const timer = setInterval(run, CLEANUP_INTERVAL_MS);
  timer.unref();
  return { stop: () => clearInterval(timer) };
}
