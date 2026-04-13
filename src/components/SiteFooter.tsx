import { Link } from 'react-router-dom';
import { formatTimestampLabel } from '@/lib/date-display';
import ThemeToggle from '@/components/ThemeToggle';
import { useThemeModeContext } from '@/lib/theme-mode-context';

const REPOSITORY_URL = 'https://github.com/BlueVelvetSackOfGoldPotatoes/poli-track';

interface SiteFooterProps {
  lastUpdatedAt?: string;
  lastUpdatedLabel?: string;
}

const SiteFooter = ({ lastUpdatedAt, lastUpdatedLabel = 'Country facts cache' }: SiteFooterProps) => {
  const { theme, toggleTheme } = useThemeModeContext();

  return (
    <footer className="brutalist-border-t mt-12 bg-card/60">
      <div className="container py-8 space-y-4">
        <div className="flex justify-start">
          <ThemeToggle theme={theme} onToggle={toggleTheme} />
        </div>

        <div className="grid gap-4 lg:grid-cols-[1.25fr_1fr_0.9fr]">
          <section className="brutalist-border p-4 bg-card">
            <div className="font-mono text-[10px] uppercase tracking-[0.24em] text-muted-foreground">Poli Track</div>
            <p className="mt-3 text-sm leading-relaxed text-foreground">
              Open-source political data explorer for following actors, parties, proposals, and country power structures across Europe.
            </p>
            <p className="mt-3 font-mono text-xs text-muted-foreground">
              Pre-alpha. Coverage still depends on upstream public data quality and Wikimedia availability.
            </p>
          </section>

          <section className="brutalist-border p-4 bg-card">
            <div className="font-mono text-[10px] uppercase tracking-[0.24em] text-muted-foreground">Data Cadence</div>
            <div className="mt-3 space-y-2 font-mono text-xs text-muted-foreground">
              <div>Country facts are cached in Supabase.</div>
              <div>Non-destructive refresh runs every Monday at 03:00 UTC.</div>
              <div>Sources: Wikipedia summaries, Wikipedia pages, and Wikidata entities.</div>
              <div className="text-foreground">
                {lastUpdatedAt
                  ? `${lastUpdatedLabel} last updated ${formatTimestampLabel(lastUpdatedAt)}`
                  : 'Latest country sync timestamps are shown directly on cached country and party views.'}
              </div>
            </div>
          </section>

          <section className="brutalist-border p-4 bg-card">
            <div className="font-mono text-[10px] uppercase tracking-[0.24em] text-muted-foreground">Transparency</div>
            <div className="mt-3 flex flex-col gap-2 font-mono text-xs">
              <Link to="/about" className="text-foreground hover:text-accent">Methodology / About</Link>
              <Link to="/data" className="text-foreground hover:text-accent">Coverage Dashboard</Link>
              <a href={REPOSITORY_URL} target="_blank" rel="noopener noreferrer" className="text-foreground hover:text-accent">
                Source Code
              </a>
              <a href="https://www.wikidata.org/" target="_blank" rel="noopener noreferrer" className="text-foreground hover:text-accent">
                Wikidata
              </a>
              <a href="https://en.wikipedia.org/" target="_blank" rel="noopener noreferrer" className="text-foreground hover:text-accent">
                Wikipedia
              </a>
            </div>
          </section>
        </div>

        <div className="flex flex-col gap-2 border-t border-border pt-4 font-mono text-[11px] text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <span>MIT license · React · Vite · Supabase</span>
          <span>Weekly country metadata refresh via GitHub Actions → Supabase Edge Functions</span>
        </div>
      </div>
    </footer>
  );
};

export default SiteFooter;
