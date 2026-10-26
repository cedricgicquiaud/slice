/**
 * "Usage", at `/mcps/<id>/usage` (D10): what agents did with one of the
 * account's MCPs over the last 30 days, by action. Outside the three steps:
 * the MCP's name at the top and a way back to "My MCPs".
 */
import { useEffect, useId, useState, type ReactNode } from 'react';
import { ApiError } from '../lib/api';
import { getMcpUsage, type ActionUsage, type CallResult, type McpUsage, type RecentCall } from '../lib/mcps-api';
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

/** A day the cap was reached, e.g. "Oct 24, 2026": a day of UTC, as the server counts it (D8). */
const CAPPED_DAY = new Intl.DateTimeFormat('en-US', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' });

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
          {usage.cappedDays.map((day) => (
            <p key={day} className="mt-4 text-sm text-foreground">
              10,000 calls reached on {CAPPED_DAY.format(new Date(day))}: later calls that day are not counted.
            </p>
          ))}
          <ActionsTable actions={usage.actions} />
          <RecentCallsTable calls={usage.recentCalls} />
        </>
      )}
    </div>
  );
}

/** A call's result as the page words it (D4), e.g. "Failed (404)". */
function resultOf(result: CallResult): string {
  switch (result.kind) {
    case 'succeeded':
      return 'Succeeded';
    case 'failed':
      return `Failed (${result.status})`;
    case 'api_unreachable':
      return 'API unreachable';
    case 'invalid_request':
      return 'Invalid request';
    case 'not_available':
      return 'Not available';
    case 'slice_error':
      return 'SLICE error';
  }
}

function ActionsTable({ actions }: { actions: ActionUsage[] }) {
  return (
    <TableSection
      title="Actions"
      head={
        <>
          <th scope="col" className="px-4 py-2 font-medium">Action</th>
          <th scope="col" className="px-4 py-2 text-right font-medium">Calls</th>
          <th scope="col" className="px-4 py-2 text-right font-medium">Succeeded</th>
          <th scope="col" className="px-4 py-2 text-right font-medium">Average duration</th>
          <th scope="col" className="px-4 py-2 font-medium">Last call</th>
        </>
      }
    >
      {actions.map((action) => (
        <tr key={action.name} className="border-t border-border">
          <th scope="row" className="px-4 py-2 text-left font-normal text-foreground">
            <span className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
              {action.label}
              {/* Called, but no longer one of the active version's actions (D10). */}
              {!action.available && (
                <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                  Not available
                </span>
              )}
            </span>
          </th>
          {action.calls === 0 ? (
            <td colSpan={4} className="px-4 py-2 text-muted-foreground">
              Never called
            </td>
          ) : (
            <>
              <td className="px-4 py-2 text-right tabular-nums">{action.calls}</td>
              <td className="px-4 py-2 text-right tabular-nums">{action.succeeded}</td>
              <td className="px-4 py-2 text-right tabular-nums">
                {action.averageDurationMs === null ? '—' : durationOf(action.averageDurationMs)}
              </td>
              <td className="px-4 py-2 text-muted-foreground">
                {action.lastCalledAt && CALLED.format(new Date(action.lastCalledAt))}
              </td>
            </>
          )}
        </tr>
      ))}
    </TableSection>
  );
}

function RecentCallsTable({ calls }: { calls: RecentCall[] }) {
  return (
    <TableSection
      title="Recent calls"
      head={
        <>
          <th scope="col" className="px-4 py-2 font-medium">Date</th>
          <th scope="col" className="px-4 py-2 font-medium">Action</th>
          <th scope="col" className="px-4 py-2 font-medium">Result</th>
          <th scope="col" className="px-4 py-2 text-right font-medium">Duration</th>
          <th scope="col" className="px-4 py-2 text-right font-medium">Version</th>
        </>
      }
    >
      {calls.map((call, position) => (
        <tr key={position} className="border-t border-border">
          <td className="px-4 py-2 text-muted-foreground">{CALLED.format(new Date(call.calledAt))}</td>
          <td className="px-4 py-2 text-foreground">{call.label}</td>
          <td className="px-4 py-2 text-foreground">{resultOf(call.result)}</td>
          <td className="px-4 py-2 text-right tabular-nums">{durationOf(call.durationMs)}</td>
          <td className="px-4 py-2 text-right tabular-nums">{call.version}</td>
        </tr>
      ))}
    </TableSection>
  );
}

/** A titled table of the page: its title names it for assistive technologies. */
function TableSection({ title, head, children }: { title: string; head: ReactNode; children: ReactNode }) {
  const titleId = useId();
  return (
    <section className="mt-8">
      <h2 id={titleId} className="text-base font-medium text-foreground">
        {title}
      </h2>
      <div className="mt-3 overflow-hidden rounded-lg border border-border bg-card">
        <table aria-labelledby={titleId} className="w-full text-sm">
          <thead className="bg-muted/40 text-left text-muted-foreground">
            <tr>{head}</tr>
          </thead>
          <tbody>{children}</tbody>
        </table>
      </div>
    </section>
  );
}
