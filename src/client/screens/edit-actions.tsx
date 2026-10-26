/**
 * "Edit actions", at `/mcps/<id>/edit` (D10): step 2 again on one of the
 * account's MCPs, every action of its API shown, the active version's checked
 * (D2). Outside the three steps (D15): the MCP's name at the top and a way back
 * to "My MCPs".
 */
import { useEffect, useState } from 'react';
import type { ParsedSpec } from '@shared/types';
import { ApiError } from '../lib/api';
import { getMcpSelection, type McpSelection } from '../lib/mcps-api';
import { messageOf } from './mcps';
import { SelectionScreen } from './selection';

export function EditActionsScreen({ mcpId }: { mcpId: string }) {
  const [selection, setSelection] = useState<McpSelection | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getMcpSelection(mcpId)
      .then(setSelection)
      .catch((err: unknown) => {
        // Another account's MCP answers as an unknown one (D12): one case here.
        if (err instanceof ApiError && err.status === 404) setNotFound(true);
        else setError(messageOf(err));
      });
  }, [mcpId]);

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <header className="px-4 pt-6 pb-4">
        <a href="/mcps" className="text-sm text-muted-foreground transition-colors hover:text-foreground">
          Back to My MCPs
        </a>
        {error && (
          <p role="alert" className="mt-4 text-sm text-destructive">
            {error}
          </p>
        )}
        {notFound && (
          <>
            <h1 className="mt-2 font-serif text-3xl italic">MCP not found</h1>
            <p className="mt-4 text-sm text-muted-foreground">There is no MCP at this address in your account.</p>
          </>
        )}
        {selection && <h1 className="mt-2 font-serif text-3xl italic">{selection.apiName}</h1>}
      </header>
      {selection && (
        <SelectionScreen
          spec={specOf(selection)}
          initialSelectedIds={selection.selectedIds}
          continueLabel="Save"
          onContinue={() => {}}
        />
      )}
    </div>
  );
}

/** The selection screen reads the groups of a description only: those of the MCP's API. */
function specOf(selection: McpSelection): ParsedSpec {
  return { apiName: selection.apiName, apiVersion: '', baseUrl: '', authType: 'none', groups: selection.groups };
}
