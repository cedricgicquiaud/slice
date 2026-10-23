/**
 * The hosted connectors' tables (D3). A connector holds what the hosted runtime
 * needs to serve it; never an upstream key or token, never the API description.
 * Migrations are generated from this file: `pnpm drizzle-kit generate`.
 */
import { integer, jsonb, pgEnum, pgTable, text, timestamp } from 'drizzle-orm/pg-core';
import type { EndpointParam } from '@shared/types';

export const upstreamAuthType = pgEnum('upstream_auth_type', ['none', 'apiKey', 'bearer', 'oauth2']);

export const httpMethod = pgEnum('http_method', ['GET', 'POST', 'PUT', 'PATCH', 'DELETE']);

export const connectors = pgTable('connectors', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  baseUrl: text('base_url').notNull(),
  upstreamAuthType: upstreamAuthType('upstream_auth_type').notNull(),
  upstreamHeaderName: text('upstream_header_name'),
  upstreamTokenUrl: text('upstream_token_url'),
  upstreamScopes: text('upstream_scopes').array(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
});

export const connectorActions = pgTable('connector_actions', {
  connectorId: text('connector_id').notNull(),
  position: integer('position').notNull(),
  name: text('name').notNull(),
  description: text('description').notNull(),
  method: httpMethod('method').notNull(),
  path: text('path').notNull(),
  params: jsonb('params').$type<EndpointParam[]>().notNull(),
});
