/**
 * The API key of an MCP (D3, D4): one at most, encrypted before the database
 * (D11, D12), never read back for anyone but the relay to its own API.
 */
import { eq } from 'drizzle-orm';
import type { Database } from '../db/client';
import { connectorKeys } from '../db/schema';
import { UnreadableKeyError, type KeyCipher } from './key-cipher';

export interface McpApiKeys {
  /** Save `apiKey` as the key of the connector `connectorId`, dated `now`. */
  save(connectorId: string, apiKey: string, now: Date): Promise<void>;
  /** The key of the connector `connectorId`, decrypted for the relay to its API; `undefined` without one. */
  keyOf(connectorId: string): Promise<McpApiKey | undefined>;
  /** What can be told of the key of the connector `connectorId`, never its value (D3); `undefined` without one. */
  stateOf(connectorId: string): Promise<McpApiKeyState | undefined>;
  /** Erase the key of the connector `connectorId` (D3). */
  remove(connectorId: string): Promise<void>;
}

/** A key decrypted, or one SLICE cannot read any more: encrypted under another encryption key (D3). */
export type McpApiKey = { key: string } | { unreadable: true };

export interface McpApiKeyState {
  /** When the key was last saved or replaced (D3). */
  savedAt: Date;
  readable: boolean;
}

export function createMcpApiKeys(database: Database, cipher: KeyCipher): McpApiKeys {
  const { db } = database;
  const lineOf = async (connectorId: string) => {
    const [line] = await db.select().from(connectorKeys).where(eq(connectorKeys.connectorId, connectorId));
    return line;
  };
  const open = (encryptedKey: string): McpApiKey => {
    try {
      return { key: cipher.decrypt(encryptedKey) };
    } catch (err) {
      if (err instanceof UnreadableKeyError) return { unreadable: true };
      throw err;
    }
  };
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
      const line = await lineOf(connectorId);
      return line && open(line.encryptedKey);
    },
    async stateOf(connectorId) {
      const line = await lineOf(connectorId);
      return line && { savedAt: line.savedAt, readable: 'key' in open(line.encryptedKey) };
    },
    async remove(connectorId) {
      await db.delete(connectorKeys).where(eq(connectorKeys.connectorId, connectorId));
    },
  };
}
