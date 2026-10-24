import { useState } from 'react';
import { authClient } from '../lib/auth-client';

const ENTRY_CLASS =
  'w-full rounded-lg border border-border bg-background px-4 py-2.5 text-sm font-medium transition-colors hover:bg-[var(--slice-highlight)]';
const FIELD_CLASS =
  'w-full rounded-lg border border-border bg-background px-4 py-3 font-mono text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-foreground';
const SUBMIT_CLASS =
  'rounded-lg bg-foreground px-6 py-2.5 text-sm font-medium text-background transition-opacity disabled:opacity-40';

const UNVERIFIED_ADDRESS =
  "Your Google or Microsoft account didn't confirm this email address. Get a code by email instead.";
/** What a refused Google or Microsoft sign-in says, by the code the server sends back (`?error=`). */
const SIGN_IN_ERRORS = new Map([
  ['email_not_verified', UNVERIFIED_ADDRESS],
  // Better Auth's code when the unverified address is already an account's: it never links one.
  ['account_not_linked', UNVERIFIED_ADDRESS],
]);

const CODE_NOT_SENT = "Couldn't send the code, try again";
/** What a refused code says, by the code the server answers, and whether only a new code can sign in. */
const CODE_REFUSALS = new Map([
  ['INVALID_OTP', { message: 'This code is wrong or was already used.', newCodeNeeded: false }],
  ['TOO_MANY_ATTEMPTS', { message: 'Too many wrong codes. Ask for a new one.', newCodeNeeded: true }],
]);

/** Leaves for the provider's sign-in; back on SLICE's home, or on this screen with `?error=` if refused. */
function signInWith(provider: 'google' | 'microsoft') {
  void authClient.signIn.social({ provider, callbackURL: '/', errorCallbackURL: '/' });
}

/** The only screen without an account (D1, D3): Google, Microsoft or a code by email. */
export function SignInScreen() {
  const [email, setEmail] = useState('');
  const [codeSent, setCodeSent] = useState(false);
  const [code, setCode] = useState('');
  const [codeRefusal, setCodeRefusal] = useState<string>();
  const error = codeRefusal ?? SIGN_IN_ERRORS.get(new URLSearchParams(window.location.search).get('error') ?? '');
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
          <button type="button" className={ENTRY_CLASS} onClick={() => signInWith('google')}>
            Continue with Google
          </button>
          <button type="button" className={ENTRY_CLASS} onClick={() => signInWith('microsoft')}>
            Continue with Microsoft
          </button>
        </div>

        <div className="flex w-full items-center gap-3 font-mono text-xs text-muted-foreground">
          <span className="h-px flex-1 bg-border" />
          or
          <span className="h-px flex-1 bg-border" />
        </div>

        {codeSent ? (
          <form
            className="flex w-full flex-col gap-3 text-left"
            onSubmit={async (e) => {
              e.preventDefault();
              const signedIn = await authClient.signIn.emailOtp({ email, otp: code });
              const refusal = CODE_REFUSALS.get(signedIn.error?.code ?? '');
              setCodeRefusal(refusal?.message);
              if (refusal?.newCodeNeeded) setCodeSent(false);
            }}
          >
            <label htmlFor="sign-in-code" className="text-sm font-medium">
              Code
            </label>
            <input
              id="sign-in-code"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="123456"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              className={FIELD_CLASS}
            />
            <button type="submit" className={SUBMIT_CLASS}>
              Sign in
            </button>
          </form>
        ) : (
          <form
            className="flex w-full flex-col gap-3 text-left"
            onSubmit={async (e) => {
              e.preventDefault();
              const sent = await authClient.emailOtp.sendVerificationOtp({ email, type: 'sign-in' });
              setCodeRefusal(sent.error ? CODE_NOT_SENT : undefined);
              if (!sent.error) setCodeSent(true);
            }}
          >
            <label htmlFor="sign-in-email" className="text-sm font-medium">
              Email
            </label>
            <input
              id="sign-in-email"
              type="email"
              autoComplete="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={FIELD_CLASS}
            />
            <button type="submit" className={SUBMIT_CLASS}>
              Email me a code
            </button>
          </form>
        )}
      </section>
    </main>
  );
}
