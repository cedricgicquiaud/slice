/**
 * "History", at `/mcps/<id>/history` (D10): the versions of one of the
 * account's MCPs. Outside the three steps (D15): the MCP's name at the top and
 * a way back to "My MCPs".
 */
import { useEffect, useState } from 'react';
import { getMcpHistory, type McpHistory } from '../lib/mcps-api';

export function HistoryScreen({ mcpId }: { mcpId: string }) {
  const [history, setHistory] = useState<McpHistory | null>(null);

  useEffect(() => {
    void getMcpHistory(mcpId).then(setHistory);
  }, [mcpId]);

  return (
    <div className="mx-auto w-full max-w-3xl overflow-y-auto px-6 py-12">
      <a href="/mcps" className="text-sm text-muted-foreground transition-colors hover:text-foreground">
        Back to My MCPs
      </a>
      {history && <h1 className="mt-4 font-serif text-4xl italic">{history.apiName}</h1>}
    </div>
  );
}
