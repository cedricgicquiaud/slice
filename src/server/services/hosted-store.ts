/**
 * Hosted connectors in the database: created with their actions in one
 * transaction, read back by id, and purged 30 days after they expired.
 */
import { randomBytes } from 'node:crypto';
import { asc, eq, lt, sql } from 'drizzle-orm';
import type { HttpMethod, UpstreamAuth } from '@shared/types';
import type { HostedMcpConfig } from './hosted-mcp-factory';
import type { Database } from '../db/client';
import { connectorActions, connectors } from '../db/schema';

/** An expired connector stays this long, answering "expired", before the cleanup deletes it. */
export const EXPIRED_RETENTION_DAYS = 30;

export interface HostedStore {
  /** Store a connector and its actions at once, in `workspaceId`, created at `now`; return its unguessable id. */
  put(config: HostedMcpConfig, workspaceId: string, now: Date): Promise<{ id: string; createdAt: string }>;
  /** Read a connector back (`createdAt` and `workspaceId` set), or `undefined` if unknown. */
  get(id: string): Promise<HostedMcpConfig | undefined>;
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
        if (config.endpoints.length === 0) return;
        await tx.insert(connectorActions).values(
          config.endpoints.map((endpoint, position) => ({
            connectorId: id,
            position,
            ...endpoint,
            // Older paths may carry a lowercase method; the column only takes uppercase.
            method: endpoint.method.toUpperCase() as HttpMethod,
          }))
        );
      });
      return { id, createdAt: now.toISOString() };
    },
    async get(id) {
      const [connector] = await db.select().from(connectors).where(eq(connectors.id, id));
      if (!connector) return undefined;
      const actions = await db
        .select()
        .from(connectorActions)
        .where(eq(connectorActions.connectorId, id))
        .orderBy(asc(connectorActions.position));
      return {
        name: connector.name,
        ...(connector.apiName !== null && { apiName: connector.apiName }),
        baseUrl: connector.baseUrl,
        upstreamAuth: upstreamAuthOf(connector),
        endpoints: actions.map(({ name, description, method, path, params }) => ({
          name,
          description,
          method,
          path,
          params,
        })),
        createdAt: connector.createdAt.toISOString(),
        workspaceId: connector.workspaceId,
      };
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
