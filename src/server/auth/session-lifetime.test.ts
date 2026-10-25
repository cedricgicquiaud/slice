// WAT-100 — a session lives seven days from the last visit (D8).
import { describe, it, expect, afterAll, afterEach, beforeAll, vi } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { createApp } from '../app';
import { openSession } from './open-session';
import { createTestAccount, type TestAccount } from '../db/test-account';

let account: TestAccount;
let app: Express;

beforeAll(async () => {
  account = await createTestAccount();
  app = createApp({ nodeEnv: 'test', auth: account.auth });
});

afterAll(async () => {
  await account?.dispose();
});

afterEach(() => {
  vi.useRealTimers();
});

/** Simulated clock, set at `time`: only the date is simulated, so the database and HTTP keep their own timers. */
function clockAt(time: string) {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(time));
}

/** Signs `email` in now; the `Cookie` header of its session. */
async function signIn(email: string) {
  const { name, value } = await openSession(account.auth, email);
  return `${name}=${value}`;
}

/** Opens SLICE with the session cookie: the session SLICE reads, if any. */
async function visit(cookie: string) {
  return (await request(app).get('/api/auth/get-session').set('Cookie', cookie)).body;
}

describe('a session lives seven days from the last visit', () => {
  it('is still live six days after sign-in, and runs seven days from that visit', async () => {
    clockAt('2026-10-25T10:00:00Z');
    const cookie = await signIn('six-days@example.com');

    clockAt('2026-10-31T10:00:00Z');
    const session = await visit(cookie);

    expect(session?.session.expiresAt).toBe('2026-11-07T10:00:00.000Z');
  });

  it('counts a visit made the day of sign-in: back six days and 22 hours after it, still signed in', async () => {
    clockAt('2026-10-25T10:00:00Z');
    const cookie = await signIn('same-day@example.com');
    clockAt('2026-10-25T22:00:00Z');
    await visit(cookie);

    clockAt('2026-11-01T20:00:00Z');
    const session = await visit(cookie);

    expect(session?.user.email).toBe('same-day@example.com');
  });

  it('is refused seven days and one minute after the last visit', async () => {
    clockAt('2026-10-25T10:00:00Z');
    const cookie = await signIn('gone@example.com');

    clockAt('2026-11-01T10:01:00Z');
    const session = await visit(cookie);

    expect(session).toBeNull();
  });
});
