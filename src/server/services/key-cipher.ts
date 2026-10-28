/**
 * The cipher of the MCPs' API keys: AES-256-GCM under SLICE_ENCRYPTION_KEY (D11).
 * The repository is public, so no default key exists: the server refuses to start
 * without one, whatever NODE_ENV.
 */

/** SLICE_ENCRYPTION_KEY, decoded; refused missing in every environment. */
export function encryptionKeyFromEnv(env: NodeJS.ProcessEnv): Buffer {
  if (!env.SLICE_ENCRYPTION_KEY) {
    throw new Error('SLICE_ENCRYPTION_KEY is required (32 bytes in base64, `openssl rand -base64 32`): it encrypts the MCPs\' API keys.');
  }
  return Buffer.from(env.SLICE_ENCRYPTION_KEY, 'base64');
}
