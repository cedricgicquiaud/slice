/**
 * "My MCPs", at `/mcps` (D9): the signed-in account's MCPs, newest first, each
 * with its API's name, action count, creation date and address.
 */
import { useEffect, useId, useState } from 'react';
import { listMcps, type Mcp } from '../lib/mcps-api';

const CREATED = new Intl.DateTimeFormat('en-US', { year: 'numeric', month: 'short', day: 'numeric' });

export function McpsScreen() {
  const [mcps, setMcps] = useState<Mcp[] | null>(null);

  useEffect(() => {
    void listMcps().then(setMcps);
  }, []);

  return (
    <div className="mx-auto w-full max-w-3xl overflow-y-auto px-6 py-12">
      <h1 className="font-serif text-4xl italic">My MCPs</h1>
      {mcps && (
        <ul className="mt-8 flex flex-col gap-3">
          {mcps.map((mcp) => (
            <McpRow key={mcp.id} mcp={mcp} />
          ))}
        </ul>
      )}
    </div>
  );
}

function McpRow({ mcp }: { mcp: Mcp }) {
  const nameId = useId();
  return (
    <li aria-labelledby={nameId} className="flex flex-col gap-2 rounded-lg border border-border bg-card px-4 py-3">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 id={nameId} className="text-base font-medium text-foreground">
          {mcp.apiName}
        </h2>
        <span className="text-sm text-muted-foreground">
          {mcp.actionCount} {mcp.actionCount === 1 ? 'action' : 'actions'}
        </span>
        <span className="text-sm text-muted-foreground">Created {CREATED.format(new Date(mcp.createdAt))}</span>
      </div>
      <span className="font-mono min-w-0 truncate text-sm text-foreground">{mcp.url}</span>
    </li>
  );
}
