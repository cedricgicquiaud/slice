import { authClient } from '../lib/auth-client';

/** Signed in, the account's address at the top right (D12). */
export function AccountMenu() {
  const { data } = authClient.useSession();
  if (!data) return null;
  return (
    <button
      type="button"
      className="font-mono inline-flex h-7 max-w-[240px] items-center rounded-md px-2 text-[11px] text-muted-foreground transition-colors hover:bg-[var(--slice-highlight)] hover:text-foreground"
    >
      <span className="truncate">{data.user.email}</span>
    </button>
  );
}
