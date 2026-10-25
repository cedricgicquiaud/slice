import { useId, useState } from 'react';
import { Button } from '../components/ui/button';
import { authClient } from '../lib/auth-client';

/** The word that confirms the deletion, typed exactly: `Delete` or `delet` keep the button inactive (contract 27). */
const CONFIRMATION = 'delete';

/** Better Auth's refusal of a session opened more than a day ago (`SESSION_EXPIRED`): a fresh one deletes. */
const SESSION_TOO_OLD = 'For your safety, sign out and sign in again, then delete your account.';

const FIELD_CLASS =
  'w-full rounded-lg border border-border bg-background px-4 py-3 font-mono text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-foreground';

/** "Delete your account", at `/account/delete` (D11). */
export function DeleteAccountScreen() {
  const fieldId = useId();
  const [typed, setTyped] = useState('');
  const [refusal, setRefusal] = useState<string>();

  // Deleted, the session ends with the account: the sign-in screen shows, at
  // home, so that signing in again does not land back on this page.
  async function handleDelete() {
    const { error } = await authClient.deleteUser();
    if (error) {
      setRefusal(SESSION_TOO_OLD);
      return;
    }
    window.history.replaceState({}, '', '/');
  }

  return (
    <div className="mx-auto w-full max-w-xl overflow-y-auto px-6 py-12">
      <h1 className="font-serif text-4xl italic">Delete your account</h1>
      <p className="mt-6 text-sm text-muted-foreground">
        Your account and all its MCPs are deleted at once. Their addresses stop working for every agent that uses
        them. This can&apos;t be undone.
      </p>
      {refusal && (
        <p role="alert" className="mt-6 text-sm text-destructive">
          {refusal}
        </p>
      )}
      <div className="mt-8 flex flex-col gap-3">
        <label htmlFor={fieldId} className="text-sm text-foreground">
          Type delete to confirm
        </label>
        <input
          id={fieldId}
          value={typed}
          onChange={(event) => setTyped(event.target.value)}
          autoComplete="off"
          spellCheck={false}
          className={FIELD_CLASS}
        />
        <Button
          variant="destructive"
          className="self-start"
          disabled={typed !== CONFIRMATION}
          onClick={() => void handleDelete()}
        >
          Delete my account
        </Button>
      </div>
    </div>
  );
}
