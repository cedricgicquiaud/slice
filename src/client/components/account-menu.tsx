import { useEffect, useRef, useState } from 'react';
import { CircleUserRound } from 'lucide-react';
import { authClient } from '../lib/auth-client';

const ITEM_CLASS =
  'block w-full rounded-md px-3 py-2 text-left font-mono text-[11px] text-muted-foreground transition-colors hover:bg-[var(--slice-highlight)] hover:text-foreground';

/**
 * Signed in, the account's address at the top right; clicked, its menu (D12).
 * Below 640 px an account icon stands for the address, which heads the menu.
 * `/mcps` and `/account/delete` show the home screen until their own deliveries.
 */
export function AccountMenu() {
  const { data } = authClient.useSession();
  const [open, setOpen] = useState(false);
  const container = useRef<HTMLDivElement>(null);
  const toggle = useRef<HTMLButtonElement>(null);

  // Open, the menu closes on Escape (focus back on the address) or on a click beside it.
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setOpen(false);
      toggle.current?.focus();
    };
    const onPointerDown = (event: PointerEvent) => {
      if (!container.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('pointerdown', onPointerDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('pointerdown', onPointerDown);
    };
  }, [open]);

  if (!data) return null;
  return (
    <div ref={container} className="relative">
      <button
        ref={toggle}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={data.user.email}
        onClick={() => setOpen((wasOpen) => !wasOpen)}
        className="font-mono inline-flex h-7 max-w-[240px] items-center rounded-md px-2 text-[11px] text-muted-foreground transition-colors hover:bg-[var(--slice-highlight)] hover:text-foreground"
      >
        <CircleUserRound aria-hidden="true" className="h-4 w-4 sm:hidden" />
        <span className="hidden truncate sm:inline">{data.user.email}</span>
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full z-20 mt-1 min-w-[180px] rounded-lg border border-border bg-background p-1 shadow-lg"
        >
          <p className="mb-1 max-w-[240px] truncate border-b border-border px-3 py-2 font-mono text-[11px] text-foreground sm:hidden">
            {data.user.email}
          </p>
          <a role="menuitem" href="/mcps" className={ITEM_CLASS}>
            My MCPs
          </a>
          <button role="menuitem" type="button" className={ITEM_CLASS} onClick={() => void authClient.signOut()}>
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
