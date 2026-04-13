import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import SiteHeader from '@/components/SiteHeader';
import SiteFooter from '@/components/SiteFooter';
import SearchBar from '@/components/SearchBar';
import ActorCard from '@/components/ActorCard';
import { usePoliticians, useCountryStats } from '@/hooks/use-politicians';
import { useProposals } from '@/hooks/use-proposals';

const Index = () => {
  const { data: actors = [] } = usePoliticians();
  const { data: countryStats = [] } = useCountryStats();
  const { data: proposals = [] } = useProposals();
  const totalParties = new Set(countryStats.flatMap(c => c.parties)).size;
  const recentActors = useMemo(
    () =>
      [...actors]
        .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
        .slice(0, 12),
    [actors],
  );

  return (
    <div className="min-h-screen flex flex-col">
      <SiteHeader />
      <main className="container flex-1 py-4 sm:py-8">
        <div className="mb-6 sm:mb-8">
          <SearchBar />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-6 sm:gap-8">
          <div>
            <div className="flex items-baseline justify-between mb-4 brutalist-border-b pb-2">
              <h2 className="text-lg font-extrabold tracking-tight">RECENTLY UPDATED</h2>
              <span className="font-mono text-xs text-muted-foreground">
                {actors.length} politicians
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
              {recentActors.map((a) => (
                <ActorCard key={a.id} actor={a} />
              ))}
            </div>
          </div>

          <aside className="space-y-8">
            <div className="brutalist-border p-4 bg-secondary">
              <h3 className="font-mono text-xs font-bold mb-3">PLATFORM STATUS</h3>
              <div className="space-y-1 font-mono text-xs text-muted-foreground">
                <div className="flex justify-between">
                  <span>Countries tracked</span>
                  <span className="font-bold text-foreground">{countryStats.length}</span>
                </div>
                <div className="flex justify-between">
                  <span>Politicians indexed</span>
                  <span className="font-bold text-foreground">{actors.length}</span>
                </div>
                <div className="flex justify-between">
                  <span>Parties tracked</span>
                  <span className="font-bold text-foreground">{totalParties}</span>
                </div>
                <div className="flex justify-between">
                  <span>Proposals tracked</span>
                  <span className="font-bold text-foreground">{proposals.length}</span>
                </div>
              </div>
            </div>

            {/* Recent Proposals */}
            <div>
              <div className="flex items-baseline justify-between brutalist-border-b pb-2 mb-4">
                <h2 className="text-sm font-extrabold tracking-tight">LATEST PROPOSALS</h2>
                <Link to="/proposals" className="text-xs font-mono text-accent hover:underline">View all →</Link>
              </div>
              <div className="space-y-2">
                {proposals.slice(0, 5).map(p => (
                  <Link key={p.id} to={`/proposals/${p.id}`} className="block brutalist-border px-3 py-2 hover:bg-secondary transition-colors">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="evidence-tag text-[9px]">{p.country_code}</span>
                      <span className="evidence-tag text-[9px]">{p.status.toUpperCase()}</span>
                      <span className="text-[9px] font-mono text-muted-foreground ml-auto">
                        {new Date(p.submitted_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </span>
                    </div>
                    <div className="font-mono text-xs font-bold truncate">{p.title}</div>
                    <div className="text-[10px] text-muted-foreground truncate">
                      {p.country_name}
                      {p.sponsors && p.sponsors.length > 0 && ` · ${p.sponsors[0]}${p.sponsors.length > 1 ? ` +${p.sponsors.length - 1}` : ''}`}
                    </div>
                  </Link>
                ))}
              </div>
            </div>

            <div>
              <div className="brutalist-border-b pb-2 mb-4">
                <h2 className="text-sm font-extrabold tracking-tight">COUNTRIES BY COVERAGE</h2>
              </div>
              <div className="space-y-2">
                {countryStats
                  .sort((a, b) => b.actorCount - a.actorCount)
                  .slice(0, 10)
                  .map(c => (
                    <Link key={c.code} to={`/country/${c.code.toLowerCase()}`} className="block brutalist-border px-3 py-2 flex items-center justify-between hover:bg-secondary transition-colors">
                      <span className="font-mono text-xs font-bold">{c.code} · {c.name}</span>
                      <span className="evidence-tag">{c.actorCount} actors</span>
                    </Link>
                  ))}
              </div>
            </div>
          </aside>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
};

export default Index;
