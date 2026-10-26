/**
 * "Edit actions", at `/mcps/<id>/edit` (D10): step 2 again on one of the
 * account's MCPs, every action of its API shown, the active version's checked
 * (D2). Outside the three steps (D15): the MCP's name at the top and a way back
 * to "My MCPs".
 */
import { useEffect, useMemo, useState } from 'react';
import type { ParsedSpec } from '@shared/types';
import { ApiError } from '../lib/api';
import { getMcpSelection, saveMcpSelection, type McpSelection } from '../lib/mcps-api';
import { messageOf } from './mcps';
import { SelectionScreen } from './selection';

export function EditActionsScreen({ mcpId }: { mcpId: string }) {
  const [selection, setSelection] = useState<McpSelection | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAs, setSavedAs] = useState<number | null>(null);
  // "Save" stays greyed during the call: a double click makes one version only.
  const [saving, setSaving] = useState(false);

  async function handleSave(selectedIds: string[]) {
    if (!selection || saving) return;
    setSaving(true);
    setSavedAs(null);
    setError(null);
    try {
      const number = await saveMcpSelection(mcpId, { fromVersion: selection.version, selectedIds });
      setSavedAs(number);
      // The saved selection is the active version now: the next "Save" starts from it.
      setSelection({ ...selection, version: number, selectedIds });
    } catch (err) {
      // A change made meanwhile in another tab (409, D13) is told as the server words it.
      setError(messageOf(err));
    } finally {
      setSaving(false);
    }
  }

  const active = useMemo(() => new Set(selection?.selectedIds), [selection]);
  // Built once per selection read or saved: the screen's counters are computed from it.
  const spec = useMemo(() => (selection ? specOf(selection) : null), [selection]);

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
        {notFound && (
          <>
            <h1 className="mt-2 font-serif text-3xl italic">MCP not found</h1>
            <p className="mt-4 text-sm text-muted-foreground">There is no MCP at this address in your account.</p>
          </>
        )}
        {selection && <h1 className="mt-2 font-serif text-3xl italic">{selection.apiName}</h1>}
        {savedAs !== null && (
          <p role="status" className="mt-2 text-sm text-foreground">
            Saved as version {savedAs}. Your agent sees the new actions in its next conversation, with nothing to
            paste again.
          </p>
        )}
        {error && (
          <p role="alert" className="mt-2 text-sm text-destructive">
            {error}
          </p>
        )}
      </header>
      {selection && spec && (
        <SelectionScreen
          spec={spec}
          initialSelectedIds={selection.selectedIds}
          continueLabel="Save"
          // Nothing to save while the selection is the active version's (D5).
          continueDisabled={(selected) =>
            saving || (selected.size === active.size && [...selected].every((id) => active.has(id)))
          }
          onContinue={(selectedIds) => void handleSave(selectedIds)}
        />
      )}
    </div>
  );
}

/** The selection screen reads the groups of a description only: those of the MCP's API. */
function specOf(selection: McpSelection): ParsedSpec {
  return { apiName: selection.apiName, apiVersion: '', baseUrl: '', authType: 'none', groups: selection.groups };
}
