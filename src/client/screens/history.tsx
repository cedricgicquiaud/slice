/**
 * "History", at `/mcps/<id>/history` (D10): the versions of one of the
 * account's MCPs, newest first (D8), each but the active one with "Restore"
 * (D9). Outside the three steps (D15): the MCP's name at the top and a way
 * back to "My MCPs".
 */
import { useEffect, useId, useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { Button } from '../components/ui/button';
import { ApiError } from '../lib/api';
import { getMcpHistory, restoreMcpVersion, type McpHistory, type McpVersion } from '../lib/mcps-api';
import { CREATED, countOfActions, messageOf } from './mcps';

export function HistoryScreen({ mcpId }: { mcpId: string }) {
  const [history, setHistory] = useState<McpHistory | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [restored, setRestored] = useState<number | null>(null);

  async function handleRestore(number: number) {
    const activeSince = await restoreMcpVersion(mcpId, number);
    // One active version at a time (D4): the restored one, from the date the server gives.
    setHistory((current) =>
      current && {
        ...current,
        versions: current.versions.map((version) => ({
          ...version,
          activeSince: version.number === number ? activeSince : null,
        })),
      }
    );
    setRestored(number);
  }

  useEffect(() => {
    getMcpHistory(mcpId)
      .then(setHistory)
      .catch((err: unknown) => {
        // Another account's MCP answers as an unknown one (D12): one case here.
        if (err instanceof ApiError && err.status === 404) setNotFound(true);
        else setError(messageOf(err));
      });
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
      {notFound && (
        <>
          <h1 className="mt-4 font-serif text-4xl italic">MCP not found</h1>
          <p className="mt-4 text-sm text-muted-foreground">There is no MCP at this address in your account.</p>
        </>
      )}
      {history && (
        <>
          <h1 className="mt-4 font-serif text-4xl italic">{history.apiName}</h1>
          {restored !== null && (
            <p role="status" className="mt-2 text-sm text-foreground">
              Version {restored} restored. Your agent sees these actions in its next conversation, with nothing to
              paste again.
            </p>
          )}
          <ul className="mt-8 flex flex-col gap-3">
            {history.versions.map((version) => (
              <VersionRow key={version.number} version={version} onRestore={() => void handleRestore(version.number)} />
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

function VersionRow({ version, onRestore }: { version: McpVersion; onRestore: () => void }) {
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
        {version.activeSince ? (
          <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
            Active since {CREATED.format(new Date(version.activeSince))}
          </span>
        ) : (
          // The active version has nothing to restore (contract 22).
          <Button type="button" variant="ghost" size="sm" onClick={onRestore} className="ml-auto text-muted-foreground">
            Restore
          </Button>
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
