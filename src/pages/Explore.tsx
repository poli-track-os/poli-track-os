import { Link } from 'react-router-dom';
import SiteHeader from '@/components/SiteHeader';
import SiteFooter from '@/components/SiteFooter';
import { useCountryStats, usePoliticians } from '@/hooks/use-politicians';

const Explore = () => {
  const { data: countryStats = [], isLoading } = useCountryStats();
  const { data: actors = [] } = usePoliticians();

  const continents = Array.from(new Set(countryStats.map(c => c.continent))).sort();
  const totalParties = new Set(countryStats.flatMap(c => c.parties)).size;

  return (
    <div className="min-h-screen flex flex-col">
      <SiteHeader />
      <main className="container flex-1 py-8">
        <div className="brutalist-border-b pb-2 mb-6">
          <h2 className="text-lg font-extrabold tracking-tight">EXPLORE THE WORLD</h2>
          <p className="text-xs font-mono text-muted-foreground mt-1">
            Browse politicians, parties, and proposals by continent, country, and city.
          </p>
        </div>

        <div className="brutalist-border p-4 bg-secondary mb-8 grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div>
            <div className="font-mono text-xs text-muted-foreground">COUNTRIES</div>
            <div className="font-mono text-2xl font-bold">{countryStats.length}</div>
          </div>
          <div>
            <div className="font-mono text-xs text-muted-foreground">ACTORS</div>
            <div className="font-mono text-2xl font-bold">{actors.length}</div>
          </div>
          <div>
            <div className="font-mono text-xs text-muted-foreground">PARTIES</div>
            <div className="font-mono text-2xl font-bold">{totalParties}</div>
          </div>
          <div>
            <div className="font-mono text-xs text-muted-foreground">CONTINENTS</div>
            <div className="font-mono text-2xl font-bold">{continents.length}</div>
          </div>
        </div>

        {isLoading ? (
          <div className="font-mono text-sm text-muted-foreground">Loading data...</div>
        ) : (
          continents.map(continent => {
            const contCountries = countryStats.filter(c => c.continent === continent);
            const contActorCount = contCountries.reduce((sum, c) => sum + c.actorCount, 0);

            return (
              <section key={continent} className="mb-8">
                <h3 className="text-sm font-extrabold tracking-tight brutalist-border-b pb-2 mb-4">
                  {continent.toUpperCase()}
                  <span className="font-mono text-xs text-muted-foreground ml-2">
                    {contCountries.length} countries · {contActorCount} actors
                  </span>
                </h3>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
                  {contCountries
                    .sort((a, b) => b.actorCount - a.actorCount)
                    .map(country => {
                      const countryActors = actors.filter(a => a.countryId === country.code.toLowerCase());
                      return (
                        <div key={country.code} className="brutalist-border p-4">
                          <div className="flex items-center justify-between mb-3">
                            <Link to={`/country/${country.code.toLowerCase()}`} className="font-bold text-sm hover:underline">
                              {country.code} · {country.name}
                            </Link>
                            <span className="evidence-tag">{country.actorCount}</span>
                          </div>
                          <div className="space-y-2">
                            {countryActors.slice(0, 3).map(actor => (
                              <Link
                                key={actor.id}
                                to={`/actors/${actor.id}`}
                                className="block font-mono text-xs hover:bg-secondary px-2 py-1.5 brutalist-border-b last:border-b-0"
                              >
                                <span className="font-bold">{actor.name}</span>
                                <span className="text-muted-foreground ml-2">{actor.party} · {actor.role}</span>
                              </Link>
                            ))}
                            {countryActors.length > 3 && (
                              <Link to={`/country/${country.code.toLowerCase()}`} className="block text-xs font-mono text-accent hover:underline">
                                +{countryActors.length - 3} more →
                              </Link>
                            )}
                          </div>
                        </div>
                      );
                    })}
                </div>
              </section>
            );
          })
        )}
      </main>
      <SiteFooter />
    </div>
  );
};

export default Explore;
