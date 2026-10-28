/**
 * "API key", at `/mcps/<id>/api-key` (D1): the key one of the account's MCPs
 * uses on every call to its API, pasted once and never shown again (D3).
 * Outside the three steps: the MCP's name at the top and a way back to "My MCPs".
 */
import { useEffect, useState } from 'react';
import { mcpApiKeySchema } from '@shared/config-schema';
import { Button } from '../components/ui/button';
import { Field } from '../components/field';
import { ApiError } from '../lib/api';
import { getMcpApiKey, listMcps, removeMcpApiKey, saveMcpApiKey, type Mcp, type McpApiKey } from '../lib/mcps-api';
import { CREATED, messageOf } from './mcps';

export function ApiKeyScreen({ mcpId }: { mcpId: string }) {
  const [mcp, setMcp] = useState<Mcp | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [apiKey, setApiKey] = useState<McpApiKey | null>(null);
  const [pasted, setPasted] = useState('');
  const [replacing, setReplacing] = useState(false);
  // "Save", "Replace" and "Remove" stay greyed during a call: a double click sends one.
  const [calling, setCalling] = useState(false);
  const [refusal, setRefusal] = useState<string | null>(null);
  // Why the pasted key can't be used (D9), shown under the field.
  const [keyError, setKeyError] = useState<string | null>(null);

  async function handleSave() {
    if (calling) return;
    const parsed = mcpApiKeySchema.safeParse({ apiKey: pasted });
    if (!parsed.success) {
      setKeyError(parsed.error.issues[0]?.message ?? null);
      return;
    }
    setKeyError(null);
    setCalling(true);
    try {
      setApiKey(await saveMcpApiKey(mcpId, parsed.data.apiKey));
      setPasted('');
      setReplacing(false);
    } finally {
      setCalling(false);
    }
  }

  async function handleRemove() {
    if (calling) return;
    setCalling(true);
    setRefusal(null);
    try {
      await removeMcpApiKey(mcpId);
      setApiKey(null);
    } catch (err) {
      setRefusal(messageOf(err));
    } finally {
      setCalling(false);
    }
  }

  useEffect(() => {
    Promise.all([listMcps(), getMcpApiKey(mcpId)])
      .then(([mcps, saved]) => {
        setApiKey(saved);
        setMcp(mcps.find((other) => other.id === mcpId) ?? null);
      })
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
      {mcp && (
        <>
          <h1 className="mt-4 font-serif text-4xl italic">{mcp.apiName}</h1>
          {refusal && (
            <p role="alert" className="mt-4 text-sm text-destructive">
              {refusal}
            </p>
          )}
          {mcp.upstreamAuthType === 'none' ? (
            <p className="mt-4 text-sm text-muted-foreground">This MCP needs no API key.</p>
          ) : (
            <>
            <p className="mt-8 text-sm text-foreground">
              Your {mcp.apiName} key is used for every call this MCP makes. SLICE keeps it encrypted and never shows it
              again.
            </p>
            <p className="mt-2 text-sm text-muted-foreground">
              Anyone with this MCP&apos;s address acts with your key. Keep the address private.
            </p>
            {apiKey && (
              <div className="mt-8 flex flex-wrap items-center gap-3">
                {apiKey.readable ? (
                  <p className="text-sm text-foreground">Saved on {CREATED.format(new Date(apiKey.savedAt))}</p>
                ) : (
                  <p className="text-sm text-destructive">This key can no longer be read. Replace it.</p>
                )}
                {!replacing && (
                  <>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={calling}
                      onClick={() => setReplacing(true)}
                    >
                      Replace
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={calling}
                      onClick={() => void handleRemove()}
                      className="text-muted-foreground hover:text-destructive"
                    >
                      Remove
                    </Button>
                  </>
                )}
              </div>
            )}
            {(!apiKey || replacing) && (
              <form
                className="mt-8 flex flex-col gap-3"
                onSubmit={(event) => {
                  event.preventDefault();
                  void handleSave();
                }}
              >
                <Field label="API key" value={pasted} onChange={setPasted} error={keyError ?? undefined} mono />
                <Button type="submit" disabled={calling} className="self-start">
                  Save
                </Button>
              </form>
            )}
            </>
          )}
        </>
      )}
    </div>
  );
}
