/**
 * The hosted connectors' tables (D3). A connector holds what the hosted runtime
 * needs to serve it; never an upstream key or token, never the API description.
 * Accounts, their sign-in methods and sessions follow Better Auth's model, minus
 * its password field: SLICE signs in without any password.
 * Migrations are generated from this file (see `drizzle.config.ts`).
 */
import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
} from 'drizzle-orm/pg-core';
import type { EndpointParam } from '@shared/types';

/** Better Auth's dates: set on insert, `updatedAt` refreshed on every update. */
const createdAt = () => timestamp('created_at', { withTimezone: true }).defaultNow().notNull();
const updatedAt = () =>
  timestamp('updated_at', { withTimezone: true })
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull();

/** A SLICE account (Better Auth's `user`), identified by its email address. */
export const users = pgTable('users', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: boolean('email_verified').default(false).notNull(),
  image: text('image'),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const sessions = pgTable(
  'sessions',
  {
    id: text('id').primaryKey(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    token: text('token').notNull().unique(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
  },
  (table) => [index('sessions_user_id_idx').on(table.userId)]
);

/** A way an account signs in (Better Auth's `account`): Google, Microsoft. */
export const accounts = pgTable(
  'accounts',
  {
    id: text('id').primaryKey(),
    accountId: text('account_id').notNull(),
    providerId: text('provider_id').notNull(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    accessToken: text('access_token'),
    refreshToken: text('refresh_token'),
    idToken: text('id_token'),
    accessTokenExpiresAt: timestamp('access_token_expires_at', { withTimezone: true }),
    refreshTokenExpiresAt: timestamp('refresh_token_expires_at', { withTimezone: true }),
    scope: text('scope'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [index('accounts_user_id_idx').on(table.userId)]
);

/** Short-lived secrets Better Auth checks later (codes sent by email). */
export const verifications = pgTable(
  'verifications',
  {
    id: text('id').primaryKey(),
    identifier: text('identifier').notNull(),
    value: text('value').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [index('verifications_identifier_idx').on(table.identifier)]
);

export const upstreamAuthType = pgEnum('upstream_auth_type', ['none', 'apiKey', 'bearer', 'oauth2']);

export const httpMethod = pgEnum('http_method', ['GET', 'POST', 'PUT', 'PATCH', 'DELETE']);

export const connectors = pgTable(
  'connectors',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    baseUrl: text('base_url').notNull(),
    upstreamAuthType: upstreamAuthType('upstream_auth_type').notNull(),
    upstreamHeaderName: text('upstream_header_name'),
    upstreamTokenUrl: text('upstream_token_url'),
    upstreamScopes: text('upstream_scopes').array(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
  },
  (table) => [
    index('connectors_created_at_idx').on(table.createdAt),
    check(
      'connectors_header_name_iff_api_key',
      sql`(${table.upstreamAuthType} = 'apiKey') = (${table.upstreamHeaderName} is not null)`
    ),
    check(
      'connectors_token_url_iff_oauth2',
      sql`(${table.upstreamAuthType} = 'oauth2') = (${table.upstreamTokenUrl} is not null)`
    ),
  ]
);

export const connectorActions = pgTable(
  'connector_actions',
  {
    connectorId: text('connector_id')
      .notNull()
      .references(() => connectors.id, { onDelete: 'cascade' }),
    position: integer('position').notNull(),
    name: text('name').notNull(),
    description: text('description').notNull(),
    method: httpMethod('method').notNull(),
    path: text('path').notNull(),
    params: jsonb('params').$type<EndpointParam[]>().notNull(),
  },
  (table) => [primaryKey({ columns: [table.connectorId, table.position] })]
);
