/**
 * "Edit actions", at `/mcps/<id>/edit` (D10): step 2 again on one of the
 * account's MCPs, every action of its API shown, the active version's checked
 * (D2). Outside the three steps (D15): the MCP's name at the top and a way back
 * to "My MCPs".
 */
import { useEffect, useState } from 'react';
import { getMcpSelection, type McpSelection } from '../lib/mcps-api';

export function EditActionsScreen({ mcpId }: { mcpId: string }) {
  const [selection, setSelection] = useState<McpSelection | null>(null);

  useEffect(() => {
    void getMcpSelection(mcpId).then(setSelection);
  }, [mcpId]);

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <header className="px-4 pt-6 pb-4">
        <a href="/mcps" className="text-sm text-muted-foreground transition-colors hover:text-foreground">
          Back to My MCPs
        </a>
        {selection && <h1 className="mt-2 font-serif text-3xl italic">{selection.apiName}</h1>}
      </header>
    </div>
  );
}
