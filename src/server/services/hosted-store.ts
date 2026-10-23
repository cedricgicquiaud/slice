import { randomBytes } from 'node:crypto';
import { asc, eq } from 'drizzle-orm';
import type { HttpMethod, UpstreamAuth } from '@shared/types';
import type { HostedMcpConfig } from './hosted-mcp-factory';
import type { Database } from '../db/client';
import { connectorActions, connectors } from '../db/schema';

export interface DatabaseHostedStore {
  /** Store a connector and its actions at once, created at `now`; return its unguessable id. */
  put(config: HostedMcpConfig, now: Date): Promise<{ id: string; createdAt: string }>;
  /** Read a connector back (`createdAt` set), or `undefined` if unknown. */
  get(id: string): Promise<HostedMcpConfig | undefined>;
  /** Remove a connector and its actions (no-op if unknown). */
  delete(id: string): Promise<void>;
}

export function createDatabaseHostedStore(database: Database): DatabaseHostedStore {
  const { db } = database;
  return {
    async put(config, now) {
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
      };
    },
    async delete(id) {
      await db.delete(connectors).where(eq(connectors.id, id));
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
