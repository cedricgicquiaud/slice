/**
 * "History", at `/mcps/<id>/history` (D10): the versions of one of the
 * account's MCPs, newest first (D8). Outside the three steps (D15): the MCP's
 * name at the top and a way back to "My MCPs".
 */
import { useEffect, useId, useState } from 'react';
import { getMcpHistory, type McpHistory, type McpVersion } from '../lib/mcps-api';

const CREATED = new Intl.DateTimeFormat('en-US', { year: 'numeric', month: 'short', day: 'numeric' });

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
      {history && (
        <>
          <h1 className="mt-4 font-serif text-4xl italic">{history.apiName}</h1>
          <ul className="mt-8 flex flex-col gap-3">
            {history.versions.map((version) => (
              <VersionRow key={version.number} version={version} />
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

function VersionRow({ version }: { version: McpVersion }) {
  const nameId = useId();
  const actionCount = version.actionLabels.length;
  return (
    <li aria-labelledby={nameId} className="flex flex-col gap-2 rounded-lg border border-border bg-card px-4 py-3">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 id={nameId} className="text-base font-medium text-foreground">
          Version {version.number}
        </h2>
        <span className="text-sm text-muted-foreground">
          {actionCount} {actionCount === 1 ? 'action' : 'actions'}
        </span>
        <span className="text-sm text-muted-foreground">Created {CREATED.format(new Date(version.createdAt))}</span>
      </div>
    </li>
  );
}
