/**
 * "API key", at `/mcps/<id>/api-key` (D1): the key one of the account's MCPs
 * uses on every call to its API, pasted once and never shown again (D3).
 * Outside the three steps: the MCP's name at the top and a way back to "My MCPs".
 */
import { useEffect, useState } from 'react';
import { listMcps, type Mcp } from '../lib/mcps-api';
import { messageOf } from './mcps';

export function ApiKeyScreen({ mcpId }: { mcpId: string }) {
  const [mcp, setMcp] = useState<Mcp | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listMcps()
      .then((mcps) => setMcp(mcps.find((other) => other.id === mcpId) ?? null))
      .catch((err: unknown) => setError(messageOf(err)));
  }, [mcpId]);

  return (
    <div className="mx-auto w-full max-w-3xl overflow-y-auto px-6 py-12">
      <a href="/mcps" className="text-sm text-muted-foreground transition-colors hover:text-foreground">
        Back to My MCPs
      </a>
      {error && (
        <p role="alert" className="mt-8 text-sm text-destructive">
          {error}
        </p>
      )}
      {mcp && (
        <>
          <h1 className="mt-4 font-serif text-4xl italic">{mcp.apiName}</h1>
          <p className="mt-8 text-sm text-foreground">
            Your {mcp.apiName} key is used for every call this MCP makes. SLICE keeps it encrypted and never shows it
            again.
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            Anyone with this MCP&apos;s address acts with your key. Keep the address private.
          </p>
        </>
      )}
    </div>
  );
}
