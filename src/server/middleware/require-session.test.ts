// WAT-96 — nothing works without an account: the API refuses a call without a session.
import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from '../app';

describe('session guard on the API', () => {
  it('answers 401 UNAUTHORIZED to an API call without a session', async () => {
    const res = await request(createApp({ nodeEnv: 'test' })).post('/api/upload');

    expect(res.status).toBe(401);
    expect(res.body.code).toBe('UNAUTHORIZED');
  });
});
