/**
 * "Usage", at `/mcps/<id>/usage` (D10): what agents did with one of the
 * account's MCPs over the last 30 days, by action. Outside the three steps:
 * the MCP's name at the top and a way back to "My MCPs".
 */
import { useEffect, useId, useState } from 'react';
import { ApiError } from '../lib/api';
import { getMcpUsage, type ActionUsage, type McpUsage } from '../lib/mcps-api';
import { messageOf } from './mcps';

/** A call's date and time at the computer's time (D11), e.g. "Oct 26, 2026, 14:02". */
const CALLED = new Intl.DateTimeFormat('en-US', {
  year: 'numeric',
  month: 'short',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

/** A duration (D11), e.g. "420 ms". */
function durationOf(ms: number): string {
  return `${ms} ms`;
}

export function UsageScreen({ mcpId }: { mcpId: string }) {
  const [usage, setUsage] = useState<McpUsage | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getMcpUsage(mcpId)
      .then(setUsage)
      .catch((err: unknown) => {
        // Another account's MCP answers as an unknown one (D13): one case here.
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
      {usage && (
        <>
          <h1 className="mt-4 font-serif text-4xl italic">{usage.apiName}</h1>
          <ActionsTable actions={usage.actions} />
        </>
      )}
    </div>
  );
}

function ActionsTable({ actions }: { actions: ActionUsage[] }) {
  const titleId = useId();
  return (
    <section className="mt-8">
      <h2 id={titleId} className="text-base font-medium text-foreground">
        Actions
      </h2>
      <div className="mt-3 overflow-hidden rounded-lg border border-border bg-card">
        <table aria-labelledby={titleId} className="w-full text-sm">
          <thead className="bg-muted/40 text-left text-muted-foreground">
            <tr>
              <th scope="col" className="px-4 py-2 font-medium">Action</th>
              <th scope="col" className="px-4 py-2 text-right font-medium">Calls</th>
              <th scope="col" className="px-4 py-2 text-right font-medium">Succeeded</th>
              <th scope="col" className="px-4 py-2 text-right font-medium">Average duration</th>
              <th scope="col" className="px-4 py-2 font-medium">Last call</th>
            </tr>
          </thead>
          <tbody>
            {actions.map((action) => (
              <tr key={action.name} className="border-t border-border">
                <th scope="row" className="px-4 py-2 text-left font-normal text-foreground">
                  {action.label}
                </th>
                <td className="px-4 py-2 text-right tabular-nums">{action.calls}</td>
                <td className="px-4 py-2 text-right tabular-nums">{action.succeeded}</td>
                <td className="px-4 py-2 text-right tabular-nums">
                  {action.averageDurationMs !== null && durationOf(action.averageDurationMs)}
                </td>
                <td className="px-4 py-2 text-muted-foreground">
                  {action.lastCalledAt && CALLED.format(new Date(action.lastCalledAt))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
