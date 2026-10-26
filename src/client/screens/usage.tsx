/**
 * "Usage", at `/mcps/<id>/usage` (D10): what agents did with one of the
 * account's MCPs over the last 30 days. Outside the three steps: the MCP's
 * name at the top and a way back to "My MCPs".
 */
import { useEffect, useState } from 'react';
import { ApiError } from '../lib/api';
import { getMcpUsage, type McpUsage } from '../lib/mcps-api';

export function UsageScreen({ mcpId }: { mcpId: string }) {
  const [usage, setUsage] = useState<McpUsage | null>(null);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    getMcpUsage(mcpId)
      .then(setUsage)
      .catch((err: unknown) => {
        // Another account's MCP answers as an unknown one (D13): one case here.
        if (err instanceof ApiError && err.status === 404) setNotFound(true);
      });
  }, [mcpId]);

  return (
    <div className="mx-auto w-full max-w-3xl overflow-y-auto px-6 py-12">
      <a href="/mcps" className="text-sm text-muted-foreground transition-colors hover:text-foreground">
        Back to My MCPs
      </a>
      {notFound && (
        <>
          <h1 className="mt-4 font-serif text-4xl italic">MCP not found</h1>
          <p className="mt-4 text-sm text-muted-foreground">There is no MCP at this address in your account.</p>
        </>
      )}
      {usage &&<h1 className="mt-4 font-serif text-4xl italic">{usage.apiName}</h1>}
    </div>
  );
}
