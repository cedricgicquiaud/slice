const ENTRY_CLASS =
  'w-full rounded-lg border border-border bg-background px-4 py-2.5 text-sm font-medium transition-colors hover:bg-[var(--slice-highlight)]';

/** What a refused Google or Microsoft sign-in says, by the code the server sends back (`?error=`). */
const SIGN_IN_ERRORS = new Map([
  ['email_not_verified', "Your Google or Microsoft account didn't confirm this email address. Get a code by email instead."],
]);

/** The only screen without an account (D1, D3): Google, Microsoft or a code by email. */
export function SignInScreen() {
  const error = SIGN_IN_ERRORS.get(new URLSearchParams(window.location.search).get('error') ?? '');
  return (
    <main className="flex min-h-screen flex-col bg-background text-foreground">
      <section className="mx-auto flex w-full max-w-sm flex-1 flex-col items-center justify-center gap-10 px-6 py-12 text-center">
        <header className="space-y-4">
          <span className="wordmark">SLICE</span>
          <h1 className="h1">Sign in to SLICE</h1>
          <p className="font-mono text-sm text-muted-foreground">
            Use your Google or Microsoft account, or get a code by email.
          </p>
        </header>

        {error && (
          <p role="alert" className="font-mono text-sm text-destructive">
            {error}
          </p>
        )}

        <div className="flex w-full flex-col gap-3">
          <button type="button" className={ENTRY_CLASS}>
            Continue with Google
          </button>
          <button type="button" className={ENTRY_CLASS}>
            Continue with Microsoft
          </button>
        </div>

        <div className="flex w-full items-center gap-3 font-mono text-xs text-muted-foreground">
          <span className="h-px flex-1 bg-border" />
          or
          <span className="h-px flex-1 bg-border" />
        </div>

        <form className="flex w-full flex-col gap-3 text-left" onSubmit={(e) => e.preventDefault()}>
          <label htmlFor="sign-in-email" className="text-sm font-medium">
            Email
          </label>
          <input
            id="sign-in-email"
            type="email"
            autoComplete="email"
            placeholder="you@example.com"
            className="w-full rounded-lg border border-border bg-background px-4 py-3 font-mono text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-foreground"
          />
          <button
            type="submit"
            className="rounded-lg bg-foreground px-6 py-2.5 text-sm font-medium text-background transition-opacity disabled:opacity-40"
          >
            Email me a code
          </button>
        </form>
      </section>
    </main>
  );
}
