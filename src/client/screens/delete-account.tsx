import { useId } from 'react';
import { Button } from '../components/ui/button';

const FIELD_CLASS =
  'w-full rounded-lg border border-border bg-background px-4 py-3 font-mono text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-foreground';

/** "Delete your account", at `/account/delete` (D11). */
export function DeleteAccountScreen() {
  const fieldId = useId();
  return (
    <div className="mx-auto w-full max-w-xl overflow-y-auto px-6 py-12">
      <h1 className="font-serif text-4xl italic">Delete your account</h1>
      <p className="mt-6 text-sm text-muted-foreground">
        Your account and all its MCPs are deleted at once. Their addresses stop working for every agent that uses
        them. This can&apos;t be undone.
      </p>
      <div className="mt-8 flex flex-col gap-3">
        <label htmlFor={fieldId} className="text-sm text-foreground">
          Type delete to confirm
        </label>
        <input id={fieldId} autoComplete="off" spellCheck={false} className={FIELD_CLASS} />
        <Button variant="destructive" className="self-start" disabled>
          Delete my account
        </Button>
      </div>
    </div>
  );
}
