/**
 * The cipher of the MCPs' API keys: AES-256-GCM under SLICE_ENCRYPTION_KEY (D11).
 * The repository is public, so no default key exists: the server refuses to start
 * without one, whatever NODE_ENV.
 */
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const NONCE_BYTES = 12;
const TAG_BYTES = 16;

/** A sealed value SLICE cannot open: sealed under another encryption key, or altered since. */
export class UnreadableKeyError extends Error {
  constructor() {
    super('This value was sealed under another encryption key, or altered since.');
    this.name = 'UnreadableKeyError';
  }
}

export interface KeyCipher {
  /** The value sealed in base64: a fresh nonce, the authentication tag, then the ciphertext. */
  encrypt(value: string): string;
  /** Throws an UnreadableKeyError when the authentication tag does not match: never a wrong text. */
  decrypt(sealed: string): string;
}

export function createKeyCipher(encryptionKey: Buffer): KeyCipher {
  return {
    encrypt(value) {
      const nonce = randomBytes(NONCE_BYTES);
      const cipher = createCipheriv(ALGORITHM, encryptionKey, nonce);
      const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
      return Buffer.concat([nonce, cipher.getAuthTag(), ciphertext]).toString('base64');
    },
    decrypt(sealed) {
      const bytes = Buffer.from(sealed, 'base64');
      try {
        const decipher = createDecipheriv(ALGORITHM, encryptionKey, bytes.subarray(0, NONCE_BYTES));
        decipher.setAuthTag(bytes.subarray(NONCE_BYTES, NONCE_BYTES + TAG_BYTES));
        return Buffer.concat([decipher.update(bytes.subarray(NONCE_BYTES + TAG_BYTES)), decipher.final()]).toString('utf8');
      } catch {
        throw new UnreadableKeyError();
      }
    },
  };
}

/** SLICE_ENCRYPTION_KEY, decoded; refused missing, or other than 32 bytes in base64, in every environment. */
export function encryptionKeyFromEnv(env: NodeJS.ProcessEnv): Buffer {
  if (!env.SLICE_ENCRYPTION_KEY) {
    throw new Error('SLICE_ENCRYPTION_KEY is required (32 bytes in base64, `openssl rand -base64 32`): it encrypts the MCPs\' API keys.');
  }
  const key = Buffer.from(env.SLICE_ENCRYPTION_KEY, 'base64');
  // Node's decoder skips what is not base64: only a value that encodes back to itself is base64.
  if (key.length !== 32 || key.toString('base64') !== env.SLICE_ENCRYPTION_KEY) {
    throw new Error('SLICE_ENCRYPTION_KEY must be 32 bytes in base64 (`openssl rand -base64 32`).');
  }
  return key;
}
