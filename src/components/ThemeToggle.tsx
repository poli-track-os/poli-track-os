import type { ThemeMode } from '@/hooks/use-theme-mode';

interface ThemeToggleProps {
  onToggle: () => void;
  theme: ThemeMode;
}

const ThemeToggle = ({ onToggle, theme }: ThemeToggleProps) => {
  const isDark = theme === 'dark';

  return (
    <button
      type="button"
      role="switch"
      aria-checked={isDark}
      aria-label="Night mode"
      onClick={onToggle}
      className="inline-flex max-w-full brutalist-border bg-card px-3 py-2 shadow-[6px_6px_0_0_hsl(var(--border))] hover:bg-secondary transition-colors"
    >
      <div className="flex items-center gap-3">
        <div className="text-left">
          <div className="text-[10px] font-mono text-muted-foreground uppercase tracking-wide">Display</div>
          <div className="text-xs font-mono font-bold uppercase">{isDark ? 'Night mode' : 'Day mode'}</div>
        </div>
        <div
          className={`relative h-6 w-12 brutalist-border transition-colors ${
            isDark ? 'bg-accent' : 'bg-secondary'
          }`}
        >
          <div
            className={`absolute top-0.5 h-4 w-4 brutalist-border bg-background transition-transform ${
              isDark ? 'translate-x-6' : 'translate-x-0.5'
            }`}
          />
        </div>
      </div>
    </button>
  );
};

export default ThemeToggle;
