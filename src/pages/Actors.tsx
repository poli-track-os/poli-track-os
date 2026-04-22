import { useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Search } from 'lucide-react';
import SiteHeader from '@/components/SiteHeader';
import SiteFooter from '@/components/SiteFooter';
import ActorCard from '@/components/ActorCard';
import { usePoliticians } from '@/hooks/use-politicians';

const Actors = () => {
  // URL-sync the filter state so refreshing the page or sharing the URL
  // preserves the active country and search query. The Proposals page
  // already does this; Actors didn't.
  const [searchParams, setSearchParams] = useSearchParams();
  const countryFilter = searchParams.get('country') || 'all';
  const query = searchParams.get('q') || '';
  const setCountryFilter = useCallback(
    (next: string) => {
      setSearchParams(
        (prev) => {
          const params = new URLSearchParams(prev);
          if (next === 'all') params.delete('country');
          else params.set('country', next);
          return params;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );
  const setQuery = useCallback(
    (next: string) => {
      setSearchParams(
        (prev) => {
          const params = new URLSearchParams(prev);
          if (!next) params.delete('q');
          else params.set('q', next);
          return params;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );
  const { data: actors = [], isLoading } = usePoliticians();

  const countryFiltered = countryFilter === 'all'
    ? actors
    : actors.filter(a => a.countryId === countryFilter);

  const loweredQuery = query.trim().toLowerCase();
  const filtered = loweredQuery
    ? countryFiltered.filter((actor) => (
      actor.name.toLowerCase().includes(loweredQuery) ||
      actor.party.toLowerCase().includes(loweredQuery) ||
      (actor.partyName || '').toLowerCase().includes(loweredQuery) ||
      (actor.partyAbbreviation || '').toLowerCase().includes(loweredQuery) ||
      actor.role.toLowerCase().includes(loweredQuery) ||
      actor.canton.toLowerCase().includes(loweredQuery) ||
      actor.committees.some((committee) => committee.toLowerCase().includes(loweredQuery))
    ))
    : countryFiltered;

  const countryCounts = actors.reduce<Record<string, { code: string; count: number }>>((acc, a) => {
    if (!acc[a.countryId]) acc[a.countryId] = { code: a.countryId.toUpperCase(), count: 0 };
    acc[a.countryId].count++;
    return acc;
  }, {});

  return (
    <div className="min-h-screen flex flex-col">
      <SiteHeader />
      <main className="container flex-1 py-8">
        <div className="brutalist-border-b pb-2 mb-6">
          <h2 className="text-lg font-extrabold tracking-tight">ALL ACTORS</h2>
          <p className="text-xs font-mono text-muted-foreground mt-1">
            Politicians, parties, committees, and institutions worldwide.
          </p>
        </div>

        {isLoading ? (
          <div className="font-mono text-sm text-muted-foreground">Loading politicians...</div>
        ) : (
          <>
            <div className="brutalist-border mb-4 flex items-center bg-card">
              <div className="px-3 py-2.5 brutalist-border border-t-0 border-b-0 border-l-0 bg-secondary">
                <Search className="w-4 h-4 text-muted-foreground" />
              </div>
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                aria-label="Filter actors"
                placeholder="Search actors, parties, roles, committees..."
                className="flex-1 px-3 py-2.5 bg-transparent text-sm font-mono placeholder:text-muted-foreground focus:outline-none"
              />
            </div>

            <div className="overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0 mb-6">
              <div className="flex gap-1 min-w-max sm:flex-wrap sm:min-w-0">
                <button
                  onClick={() => setCountryFilter('all')}
                  className={`evidence-tag text-xs cursor-pointer whitespace-nowrap ${countryFilter === 'all' ? 'bg-primary text-primary-foreground' : ''}`}
                >
                  ALL ({actors.length})
                </button>
                {Object.entries(countryCounts)
                  .sort(([, a], [, b]) => b.count - a.count)
                  .map(([id, { code, count }]) => (
                    <button
                      key={id}
                      onClick={() => setCountryFilter(id)}
                      className={`evidence-tag text-xs cursor-pointer whitespace-nowrap ${countryFilter === id ? 'bg-primary text-primary-foreground' : ''}`}
                    >
                      {code} ({count})
                    </button>
                  ))}
              </div>
            </div>

            <p className="mb-4 font-mono text-xs text-muted-foreground">
              {filtered.length === countryFiltered.length
                ? `Showing all ${countryFiltered.length} tracked actors`
                : `Showing ${filtered.length} of ${countryFiltered.length} tracked actors`}
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
              {filtered.map((a) => (
                <ActorCard key={a.id} actor={a} />
              ))}
            </div>
          </>
        )}
      </main>
      <SiteFooter />
    </div>
  );
};

export default Actors;
