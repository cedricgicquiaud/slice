// WAT-98 — signing in with a code received by email.
import { describe, it, expect, afterAll, afterEach, beforeAll, vi } from 'vitest';
import request from 'supertest';
import { sql } from 'drizzle-orm';
import type { Express } from 'express';
import { createApp } from '../app';
import { createAuth, type SendCode } from './auth';
import { codeSenderFromEnv } from './email-code';
import { createTestAccount, TEST_AUTH_SECRET, type TestAccount } from '../db/test-account';

let account: TestAccount;
let app: Express;
/** The codes SLICE sent, by address. */
const inbox = new Map<string, string>();

beforeAll(async () => {
  account = await createTestAccount();
  const auth = createAuth({
    database: account.database,
    secret: TEST_AUTH_SECRET,
    sendCode: async (email, code) => {
      inbox.set(email, code);
    },
  });
  app = createApp({ nodeEnv: 'development', auth });
});

afterAll(async () => {
  await account?.dispose();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

/** SLICE on the same database, sending its codes with `sendCode`. */
function appSendingWith(sendCode: SendCode): Express {
  return createApp({ nodeEnv: 'development', auth: createAuth({ database: account.database, secret: TEST_AUTH_SECRET, sendCode }) });
}

/** Any network call fails the test: nothing may leave SLICE. */
function noNetwork() {
  const fetch = vi.fn(async (input: string | URL | Request) => {
    throw new Error(`Unexpected network call: ${input instanceof Request ? input.url : String(input)}`);
  });
  vi.stubGlobal('fetch', fetch);
  return fetch;
}

type Browser = ReturnType<typeof request.agent>;

/** Types the address and clicks "Email me a code". */
function askForCode(browser: Browser, email: string) {
  return browser.post('/api/auth/email-otp/send-verification-otp').send({ email, type: 'sign-in' });
}

/** Asks for a code, enters the one received; the session it opened, if any. */
async function signInWithCode(browser: Browser, email: string) {
  await askForCode(browser, email);
  await browser.post('/api/auth/sign-in/email-otp').send({ email, otp: inbox.get(email) });
  return (await browser.get('/api/auth/get-session')).body;
}

describe('sign-in with a code by email', () => {
  it('sends a 6-digit code to the address, and entering it opens a session', async () => {
    const session = await signInWithCode(request.agent(app), 'ada@example.com');

    expect({ code: inbox.get('ada@example.com'), email: session?.user.email }).toEqual({
      code: expect.stringMatching(/^\d{6}$/),
      email: 'ada@example.com',
    });
  });

  it('creates the account of an unknown address and its personal workspace at its first code', async () => {
    const session = await signInWithCode(request.agent(app), 'new@example.com');

    const owned = await account.database.rows<{ owner_id: string }>(
      sql`select owner_id from workspaces where owner_id = ${session.user.id}`
    );
    expect(owned).toHaveLength(1);
  });
});

describe('without a Resend key', () => {
  it('prints the code in the server output, and that code signs in', async () => {
    noNetwork();
    const output = vi.spyOn(console, 'log').mockImplementation(() => {});
    const browser = request.agent(appSendingWith(codeSenderFromEnv({})));

    await askForCode(browser, 'grace@example.com');
    const printed = output.mock.calls.flat().join(' ').match(/\b\d{6}\b/)?.[0];
    await browser.post('/api/auth/sign-in/email-otp').send({ email: 'grace@example.com', otp: printed });
    const session = await browser.get('/api/auth/get-session');

    expect(session.body?.user.email).toBe('grace@example.com');
  });

  it('sends no email', async () => {
    const network = noNetwork();
    vi.spyOn(console, 'log').mockImplementation(() => {});

    await askForCode(request.agent(appSendingWith(codeSenderFromEnv({}))), 'grace@example.com');

    expect(network).not.toHaveBeenCalled();
  });
});

const RESEND_EMAILS = 'https://api.resend.com/emails';

/** Resend's API answers `status`, recording what it was asked to send; any other network call fails the test. */
function resendAnswers(status: number) {
  const sent: { authorization: string | null; email: { from: string; to: string | string[]; text: string } }[] = [];
  vi.stubGlobal('fetch', async (input: string | URL | Request, init?: RequestInit) => {
    const url = input instanceof Request ? input.url : String(input);
    if (url !== RESEND_EMAILS) throw new Error(`Unexpected network call: ${url}`);
    sent.push({ authorization: new Headers(init?.headers).get('authorization'), email: JSON.parse(String(init?.body)) });
    return Response.json(status === 200 ? { id: 'email-id' } : { name: 'internal_server_error' }, { status });
  });
  return sent;
}

describe('with a Resend key', () => {
  it('emails the address, through Resend, the code that signs in', async () => {
    const sent = resendAnswers(200);
    const browser = request.agent(appSendingWith(codeSenderFromEnv({ RESEND_API_KEY: 're_test_key' })));

    await askForCode(browser, 'katherine@example.com');
    const code = sent[0]?.email.text.match(/\b\d{6}\b/)?.[0];
    await browser.post('/api/auth/sign-in/email-otp').send({ email: 'katherine@example.com', otp: code });
    const session = await browser.get('/api/auth/get-session');

    expect({ authorization: sent[0]?.authorization, to: sent[0]?.email.to, signedIn: session.body?.user.email }).toEqual({
      authorization: 'Bearer re_test_key',
      to: 'katherine@example.com',
      signedIn: 'katherine@example.com',
    });
  });

  it('sends from the address of RESEND_FROM', async () => {
    const sent = resendAnswers(200);
    const env = { RESEND_API_KEY: 're_test_key', RESEND_FROM: 'SLICE <codes@slice.example>' };

    await askForCode(request.agent(appSendingWith(codeSenderFromEnv(env))), 'katherine@example.com');

    expect(sent[0]?.email.from).toBe('SLICE <codes@slice.example>');
  });
});

describe('a code that could not be sent (contract 14)', () => {
  it('answers that the code was not sent', async () => {
    resendAnswers(500);
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const res = await askForCode(request.agent(appSendingWith(codeSenderFromEnv({ RESEND_API_KEY: 're_test_key' }))), 'mary@example.com');

    expect({ status: res.status, code: res.body.code }).toEqual({ status: 502, code: 'code_not_sent' });
  });
});

// WAT-99 — a wrong, worn-out, stale or used code never signs in; too many codes are not sent.

/** Enters `otp` for the address; the session it opened, if any. */
async function enterCode(browser: Browser, email: string, otp: string | undefined) {
  const res = await browser.post('/api/auth/sign-in/email-otp').send({ email, otp });
  return { res, session: (await browser.get('/api/auth/get-session')).body };
}

/** SLICE with quotas of its own, sending its codes to `inbox`: no test spends another's ten codes per IP. */
function appWithInbox(): Express {
  return appSendingWith(async (email, code) => {
    inbox.set(email, code);
  });
}

/** A code of six digits other than `code`. */
function wrongCode(code: string | undefined) {
  return code === '000000' ? '111111' : '000000';
}

describe('a wrong code (contract 18)', () => {
  it('is refused and opens no session', async () => {
    const browser = request.agent(appWithInbox());
    await askForCode(browser, 'wrong@example.com');

    const { res, session } = await enterCode(browser, 'wrong@example.com', wrongCode(inbox.get('wrong@example.com')));

    expect({ status: res.status, code: res.body.code, session }).toEqual({ status: 400, code: 'INVALID_OTP', session: null });
  });
});

/** Asks for a code for the address, then enters `wrong` wrong codes; the code received. */
async function missCode(browser: Browser, email: string, wrong: number) {
  await askForCode(browser, email);
  const code = inbox.get(email);
  for (let i = 0; i < wrong; i++) await enterCode(browser, email, wrongCode(code));
  return code;
}

describe('five tries per code (contract 18)', () => {
  it('signs in with the right code after four wrong ones', async () => {
    const browser = request.agent(appWithInbox());
    const code = await missCode(browser, 'tries@example.com', 4);

    const { session } = await enterCode(browser, 'tries@example.com', code);

    expect(session?.user.email).toBe('tries@example.com');
  });

  it('refuses even the right code after five wrong ones', async () => {
    const browser = request.agent(appWithInbox());
    const code = await missCode(browser, 'worn@example.com', 5);

    const { res, session } = await enterCode(browser, 'worn@example.com', code);

    expect({ status: res.status, code: res.body.code, session }).toEqual({ status: 403, code: 'TOO_MANY_ATTEMPTS', session: null });
  });

  it('signs in with a new code once the worn-out one is refused', async () => {
    const browser = request.agent(appWithInbox());
    const worn = await missCode(browser, 'again@example.com', 5);
    await enterCode(browser, 'again@example.com', worn);

    const session = await signInWithCode(browser, 'again@example.com');

    expect(session?.user.email).toBe('again@example.com');
  });
});

/** Simulated clock, set at `time`: only the date is simulated, so the database and HTTP keep their own timers. */
function clockAt(time: string) {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(time));
}

describe('a code lives ten minutes (contract 19)', () => {
  it('still signs in at 9 min 59 s', async () => {
    clockAt('2026-10-25T10:00:00Z');
    const browser = request.agent(appWithInbox());
    await askForCode(browser, 'early@example.com');

    clockAt('2026-10-25T10:09:59Z');
    const { session } = await enterCode(browser, 'early@example.com', inbox.get('early@example.com'));

    expect(session?.user.email).toBe('early@example.com');
  });

  it('is refused at 10 min 01 s', async () => {
    clockAt('2026-10-25T10:00:00Z');
    const browser = request.agent(appWithInbox());
    await askForCode(browser, 'late@example.com');

    clockAt('2026-10-25T10:10:01Z');
    const { res, session } = await enterCode(browser, 'late@example.com', inbox.get('late@example.com'));

    expect({ status: res.status, code: res.body.code, session }).toEqual({ status: 400, code: 'OTP_EXPIRED', session: null });
  });
});

describe('a used code (contract 20)', () => {
  it('is refused the second time and opens no session', async () => {
    const slice = appWithInbox();
    await signInWithCode(request.agent(slice), 'used@example.com');

    const { res, session } = await enterCode(request.agent(slice), 'used@example.com', inbox.get('used@example.com'));

    expect({ status: res.status, code: res.body.code, session }).toEqual({ status: 400, code: 'INVALID_OTP', session: null });
  });
});

/** SLICE on its own counters, recording the addresses it sends codes to. */
function appRecordingSends() {
  const sentTo: string[] = [];
  const app = appSendingWith(async (email) => {
    sentTo.push(email);
  });
  return { app, sentTo };
}

describe('five codes an hour for an address (contract 21)', () => {
  it('refuses a sixth request within the hour, and sends no email for it', async () => {
    const { app, sentTo } = appRecordingSends();
    for (let i = 0; i < 5; i++) await askForCode(request.agent(app), 'flood@example.com');

    const res = await askForCode(request.agent(app), 'flood@example.com');

    expect({ status: res.status, code: res.body.code, sent: sentTo.length }).toEqual({
      status: 429,
      code: 'too_many_codes_for_address',
      sent: 5,
    });
  });

  it('sends a code again once the hour of the first ones has passed', async () => {
    const { app, sentTo } = appRecordingSends();
    clockAt('2026-10-25T10:00:00Z');
    for (let i = 0; i < 5; i++) await askForCode(request.agent(app), 'patient@example.com');

    clockAt('2026-10-25T11:00:01Z');
    const res = await askForCode(request.agent(app), 'patient@example.com');

    expect({ status: res.status, sent: sentTo.length }).toEqual({ status: 200, sent: 6 });
  });
});

describe('a code that could not be sent counts in no quota (contract 14)', () => {
  it('leaves the address its five codes for the hour', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const sentTo: string[] = [];
    let failures = 1;
    const app = appSendingWith(async (email) => {
      if (failures-- > 0) throw new Error('Resend is down');
      sentTo.push(email);
    });
    await askForCode(request.agent(app), 'unlucky@example.com');
    for (let i = 0; i < 4; i++) await askForCode(request.agent(app), 'unlucky@example.com');

    const res = await askForCode(request.agent(app), 'unlucky@example.com');

    expect({ status: res.status, sent: sentTo.length }).toEqual({ status: 200, sent: 5 });
  });
});

/** Asks for a code for the address from the IP `ip`, as SLICE's proxy forwards it. */
function askForCodeFrom(ip: string, browser: Browser, email: string) {
  return askForCode(browser, email).set('x-forwarded-for', ip);
}

describe('ten codes an hour from an IP (contract 22)', () => {
  it('refuses an eleventh request within the hour, whatever the address, and sends no email for it', async () => {
    const { app, sentTo } = appRecordingSends();
    for (let i = 1; i <= 10; i++) await askForCodeFrom('203.0.113.7', request.agent(app), `visitor${i}@example.com`);

    const res = await askForCodeFrom('203.0.113.7', request.agent(app), 'visitor11@example.com');

    expect({ status: res.status, code: res.body.code, sent: sentTo.length }).toEqual({
      status: 429,
      code: 'too_many_codes_from_ip',
      sent: 10,
    });
  });

  it('still sends its code to another IP', async () => {
    const { app, sentTo } = appRecordingSends();
    for (let i = 1; i <= 10; i++) await askForCodeFrom('203.0.113.7', request.agent(app), `office${i}@example.com`);

    const res = await askForCodeFrom('198.51.100.4', request.agent(app), 'home@example.com');

    expect({ status: res.status, sent: sentTo.length }).toEqual({ status: 200, sent: 11 });
  });

  it('leaves the IP its ten codes when one could not be sent (contract 14)', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const sentTo: string[] = [];
    let failures = 1;
    const app = appSendingWith(async (email) => {
      if (failures-- > 0) throw new Error('Resend is down');
      sentTo.push(email);
    });
    for (let i = 1; i <= 10; i++) await askForCodeFrom('203.0.113.7', request.agent(app), `colleague${i}@example.com`);

    const res = await askForCodeFrom('203.0.113.7', request.agent(app), 'colleague11@example.com');

    expect({ status: res.status, sent: sentTo.length }).toEqual({ status: 200, sent: 10 });
  });
});
