/**
 * "Usage", at `/mcps/<id>/usage` (D10): what agents did with one of the
 * account's MCPs over the last 30 days. Outside the three steps: the MCP's
 * name at the top and a way back to "My MCPs".
 */
import { useEffect, useState } from 'react';
import { getMcpUsage, type McpUsage } from '../lib/mcps-api';

export function UsageScreen({ mcpId }: { mcpId: string }) {
  const [usage, setUsage] = useState<McpUsage | null>(null);

  useEffect(() => {
    void getMcpUsage(mcpId).then(setUsage);
  }, [mcpId]);

  return (
    <div className="mx-auto w-full max-w-3xl overflow-y-auto px-6 py-12">
      <a href="/mcps" className="text-sm text-muted-foreground transition-colors hover:text-foreground">
        Back to My MCPs
      </a>
      {usage && <h1 className="mt-4 font-serif text-4xl italic">{usage.apiName}</h1>}
    </div>
  );
}
