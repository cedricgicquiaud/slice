import { describe, it, expect } from 'vitest';
import { randomBytes } from 'node:crypto';
import { createKeyCipher, encryptionKeyFromEnv } from './key-cipher';

describe('encryptionKeyFromEnv', () => {
  it('refuses an environment without SLICE_ENCRYPTION_KEY, naming it', () => {
    expect(() => encryptionKeyFromEnv({})).toThrow(/SLICE_ENCRYPTION_KEY is required/);
  });

  it('refuses a key of 31 bytes, naming SLICE_ENCRYPTION_KEY', () => {
    const SLICE_ENCRYPTION_KEY = randomBytes(31).toString('base64');

    expect(() => encryptionKeyFromEnv({ SLICE_ENCRYPTION_KEY })).toThrow(/SLICE_ENCRYPTION_KEY must be 32 bytes in base64/);
  });

  // Node's decoder skips what is not base64: this value would still decode to 32 bytes.
  it('refuses a key that is not base64, naming SLICE_ENCRYPTION_KEY', () => {
    const valid = randomBytes(32).toString('base64');
    const SLICE_ENCRYPTION_KEY = `${valid.slice(0, 20)}!!!!${valid.slice(20)}`;

    expect(() => encryptionKeyFromEnv({ SLICE_ENCRYPTION_KEY })).toThrow(/SLICE_ENCRYPTION_KEY must be 32 bytes in base64/);
  });
});

describe('createKeyCipher', () => {
  it('decrypts what it encrypted back to the original value', () => {
    const cipher = createKeyCipher(randomBytes(32));

    expect(cipher.decrypt(cipher.encrypt('secret_ntn_4f9Qx2'))).toBe('secret_ntn_4f9Qx2');
  });

  it('encrypts the same value twice into two different results', () => {
    const cipher = createKeyCipher(randomBytes(32));

    expect(cipher.encrypt('secret_ntn_4f9Qx2')).not.toBe(cipher.encrypt('secret_ntn_4f9Qx2'));
  });
});
