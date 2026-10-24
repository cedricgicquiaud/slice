import { useState } from 'react';
import { authClient } from '../lib/auth-client';

const ITEM_CLASS =
  'block w-full rounded-md px-3 py-2 text-left font-mono text-[11px] text-muted-foreground transition-colors hover:bg-[var(--slice-highlight)] hover:text-foreground';

/**
 * Signed in, the account's address at the top right; clicked, its menu (D12).
 * `/mcps` and `/account/delete` show the home screen until their own deliveries.
 */
export function AccountMenu() {
  const { data } = authClient.useSession();
  const [open, setOpen] = useState(false);
  if (!data) return null;
  return (
    <div className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((wasOpen) => !wasOpen)}
        className="font-mono inline-flex h-7 max-w-[240px] items-center rounded-md px-2 text-[11px] text-muted-foreground transition-colors hover:bg-[var(--slice-highlight)] hover:text-foreground"
      >
        <span className="truncate">{data.user.email}</span>
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full z-20 mt-1 min-w-[180px] rounded-lg border border-border bg-background p-1 shadow-lg"
        >
          <a role="menuitem" href="/mcps" className={ITEM_CLASS}>
            My MCPs
          </a>
          <button role="menuitem" type="button" className={ITEM_CLASS}>
            Sign out
          </button>
          <a role="menuitem" href="/account/delete" className={ITEM_CLASS}>
            Delete account
          </a>
        </div>
      )}
    </div>
  );
}
