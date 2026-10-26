/**
 * "History", at `/mcps/<id>/history` (D10): the versions of one of the
 * account's MCPs, newest first (D8). Outside the three steps (D15): the MCP's
 * name at the top and a way back to "My MCPs".
 */
import { useEffect, useId, useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { getMcpHistory, type McpHistory, type McpVersion } from '../lib/mcps-api';
import { CREATED, countOfActions } from './mcps';

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
  const actionsId = useId();
  const [unfolded, setUnfolded] = useState(false);
  return (
    <li aria-labelledby={nameId} className="flex flex-col gap-2 rounded-lg border border-border bg-card px-4 py-3">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 id={nameId} className="text-base font-medium text-foreground">
          <button
            type="button"
            aria-expanded={unfolded}
            aria-controls={actionsId}
            onClick={() => setUnfolded((current) => !current)}
            className="inline-flex items-center gap-1 transition-colors hover:text-primary"
          >
            <ChevronRight
              size={14}
              aria-hidden="true"
              className={unfolded ? 'rotate-90 transition-transform' : 'transition-transform'}
            />
            Version {version.number}
          </button>
        </h2>
        <span className="text-sm text-muted-foreground">
          {countOfActions(version.actionLabels.length)}
        </span>
        <span className="text-sm text-muted-foreground">Created {CREATED.format(new Date(version.createdAt))}</span>
        {version.activeSince && (
          <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
            Active since {CREATED.format(new Date(version.activeSince))}
          </span>
        )}
      </div>
      {unfolded && (
        <ul id={actionsId} className="ml-5 flex flex-col gap-1 text-sm text-foreground">
          {version.actionLabels.map((label, position) => (
            <li key={position}>{label}</li>
          ))}
        </ul>
      )}
    </li>
  );
}
