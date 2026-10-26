// WAT-92 — only an unreachable database is an outage; any other storage error is a bug.
import { describe, it, expect, vi } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { sql } from 'drizzle-orm';
import { isDatabaseUnreachable } from './errors';
import { DATABASE_TEST_TIMEOUTS } from './test-database';

vi.setConfig(DATABASE_TEST_TIMEOUTS);

function withCode(code: string, message = 'db error'): Error {
  return Object.assign(new Error(message), { code });
}

/** What drizzle throws: its own error, the driver's error as `cause`. */
function wrapped(cause: unknown): Error {
  return new Error('Failed query: select 1', { cause });
}

describe('isDatabaseUnreachable', () => {
  it.each(['ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND', 'EHOSTUNREACH'])(
    'recognises a network failure (%s), even wrapped by drizzle',
    (code) => {
      expect(isDatabaseUnreachable(wrapped(withCode(code)))).toBe(true);
    }
  );

  it.each(['08006', '08001', '57P01', '57P03'])('recognises a PostgreSQL connection failure (%s)', (code) => {
    expect(isDatabaseUnreachable(wrapped(withCode(code)))).toBe(true);
  });

  it('recognises a connection dropped or never obtained by the pool', () => {
    expect(isDatabaseUnreachable(new Error('Connection terminated unexpectedly'))).toBe(true);
    expect(isDatabaseUnreachable(new Error('timeout exceeded when trying to connect'))).toBe(true);
  });

  it('recognises a closed embedded database', async () => {
    const client = new PGlite();
    const db = drizzle(client);
    await client.close();

    const err = await db.execute(sql`select 1`).catch((e: unknown) => e);

    expect(isDatabaseUnreachable(err)).toBe(true);
  });

  it('refuses: a constraint violation is not an outage', async () => {
    const client = new PGlite();
    const db = drizzle(client);
    await db.execute(sql`create table t (a int check (a > 0))`);

    const err = await db.execute(sql`insert into t values (-1)`).catch((e: unknown) => e);
    await client.close();

    expect(isDatabaseUnreachable(err)).toBe(false);
  });

  it('refuses: a plain error, or no error object, is not an outage', () => {
    expect(isDatabaseUnreachable(new TypeError("Cannot read properties of undefined (reading 'id')"))).toBe(false);
    expect(isDatabaseUnreachable(withCode('23505'))).toBe(false);
    expect(isDatabaseUnreachable('boom')).toBe(false);
    expect(isDatabaseUnreachable(undefined)).toBe(false);
  });
});
