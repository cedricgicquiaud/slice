/**
 * The API key of an MCP (D3, D4): one at most, encrypted before the database
 * (D11, D12), never read back for anyone but the relay to its own API.
 */
import { eq } from 'drizzle-orm';
import type { Database } from '../db/client';
import { connectorKeys } from '../db/schema';
import type { KeyCipher } from './key-cipher';

export interface McpApiKeys {
  /** Save `apiKey` as the key of the connector `connectorId`, dated `now`. */
  save(connectorId: string, apiKey: string, now: Date): Promise<void>;
  /** The key of the connector `connectorId`, decrypted for the relay to its API; `undefined` without one. */
  keyOf(connectorId: string): Promise<{ key: string } | undefined>;
}

export function createMcpApiKeys(database: Database, cipher: KeyCipher): McpApiKeys {
  const { db } = database;
  return {
    async save(connectorId, apiKey, now) {
      const line = { encryptedKey: cipher.encrypt(apiKey), savedAt: now };
      // One statement: the key before is replaced, never kept beside the new one (D3, D4).
      await db
        .insert(connectorKeys)
        .values({ connectorId, ...line })
        .onConflictDoUpdate({ target: connectorKeys.connectorId, set: line });
    },
    async keyOf(connectorId) {
      const [line] = await db
        .select({ encryptedKey: connectorKeys.encryptedKey })
        .from(connectorKeys)
        .where(eq(connectorKeys.connectorId, connectorId));
      return line && { key: cipher.decrypt(line.encryptedKey) };
    },
  };
}
