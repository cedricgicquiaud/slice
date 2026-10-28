import { describe, it, expect } from 'vitest';
import { randomBytes } from 'node:crypto';
import { encryptionKeyFromEnv } from './key-cipher';

describe('encryptionKeyFromEnv', () => {
  it('refuses an environment without SLICE_ENCRYPTION_KEY, naming it', () => {
    expect(() => encryptionKeyFromEnv({})).toThrow(/SLICE_ENCRYPTION_KEY is required/);
  });

  it('refuses a key of 31 bytes, naming SLICE_ENCRYPTION_KEY', () => {
    const SLICE_ENCRYPTION_KEY = randomBytes(31).toString('base64');

    expect(() => encryptionKeyFromEnv({ SLICE_ENCRYPTION_KEY })).toThrow(/SLICE_ENCRYPTION_KEY must be 32 bytes in base64/);
  });
});
