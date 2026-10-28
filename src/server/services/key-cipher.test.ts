import { describe, it, expect } from 'vitest';
import { encryptionKeyFromEnv } from './key-cipher';

describe('encryptionKeyFromEnv', () => {
  it('refuses an environment without SLICE_ENCRYPTION_KEY, naming it', () => {
    expect(() => encryptionKeyFromEnv({})).toThrow(/SLICE_ENCRYPTION_KEY is required/);
  });
});
