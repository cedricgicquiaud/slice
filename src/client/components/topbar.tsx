import { Moon, RotateCcw, Sun } from 'lucide-react';
import { AccountMenu } from './account-menu';
import { Stepper } from './stepper';
import type { Theme } from '../hooks/use-theme';

export interface TopbarProps {
  /** The step on screen; null on a page outside the steps (My MCPs), which shows none. */
  current: 1 | 2 | 3 | 4 | null;
  apiName: string | null;
  theme?: Theme;
  onReset: () => void;
  onToggleTheme: () => void;
  onNavigate?: (step: number) => void;
}

export function Topbar({
  current,
  apiName,
  theme = 'dark',
  onReset,
  onToggleTheme,
  onNavigate,
}: TopbarProps) {
  return (
    // Below 640 px the steps leave the bar for a row of their own: centred beside the buttons, they would cover them.
    <header className="relative z-10 flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-border bg-background px-5 py-3 sm:h-16 sm:flex-nowrap sm:py-0">
      <span className="wordmark">SLICE</span>

      {apiName && (
        <span className="max-w-[280px] overflow-hidden truncate text-sm font-medium text-foreground/70">
          <span aria-hidden="true" className="mr-2 text-[var(--slice-ink-faint)]">/</span>
          {apiName}
        </span>
      )}

      {current !== null && (
        <div className="order-last flex w-full justify-center sm:absolute sm:left-1/2 sm:w-auto sm:-translate-x-1/2">
          <Stepper current={current} onNavigate={onNavigate} />
        </div>
      )}

      <div className="ml-auto flex items-center gap-3">
<button
          type="button"
          aria-label="Toggle theme"
          onClick={onToggleTheme}
          className="font-mono inline-flex h-7 items-center gap-1.5 rounded-md px-2 text-[11px] text-muted-foreground transition-colors hover:bg-[var(--slice-highlight)] hover:text-foreground"
        >
          {theme === 'dark' ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
          <span className="sr-only">Toggle theme</span>
        </button>

        <button
          type="button"
          onClick={onReset}
          className="font-mono inline-flex h-7 items-center gap-1.5 rounded-md px-2 text-[11px] text-muted-foreground transition-colors hover:bg-[var(--slice-highlight)] hover:text-foreground"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          Reset
        </button>

        <AccountMenu />
      </div>
    </header>
  );
}
