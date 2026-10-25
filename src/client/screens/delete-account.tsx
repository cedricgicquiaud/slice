/** "Delete your account", at `/account/delete` (D11). */
export function DeleteAccountScreen() {
  return (
    <div className="mx-auto w-full max-w-xl overflow-y-auto px-6 py-12">
      <h1 className="font-serif text-4xl italic">Delete your account</h1>
      <p className="mt-6 text-sm text-muted-foreground">
        Your account and all its MCPs are deleted at once. Their addresses stop working for every agent that uses
        them. This can&apos;t be undone.
      </p>
    </div>
  );
}
