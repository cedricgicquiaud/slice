/**
 * The API key of an MCP (D3, D4): one at most, encrypted before the database
 * (D11, D12), never read back for anyone but the relay to its own API.
 */
import type { Database } from '../db/client';
import { connectorKeys } from '../db/schema';
import type { KeyCipher } from './key-cipher';

export interface McpApiKeys {
  /** Save `apiKey` as the key of the connector `connectorId`, dated `now`. */
  save(connectorId: string, apiKey: string, now: Date): Promise<void>;
}

export function createMcpApiKeys(database: Database, cipher: KeyCipher): McpApiKeys {
  const { db } = database;
  return {
    async save(connectorId, apiKey, now) {
      await db.insert(connectorKeys).values({ connectorId, encryptedKey: cipher.encrypt(apiKey), savedAt: now });
    },
  };
}
