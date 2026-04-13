import { useState } from 'react';
import { Link } from 'react-router-dom';
import SiteHeader from '@/components/SiteHeader';
import SiteFooter from '@/components/SiteFooter';
import { usePoliticians, useCountryStats, useAllPositions } from '@/hooks/use-politicians';
import { IDEOLOGY_COLORS, getIdeologyFamily } from '@/lib/political-positioning';
import { ProvenanceBar } from '@/components/SourceBadge';

type ViewMode = 'clusters' | 'connections' | 'tree';

const Relationships = () => {
  const [view, setView] = useState<ViewMode>('clusters');

  return (
    <div className="min-h-screen flex flex-col">
      <SiteHeader />
      <main className="container flex-1 py-8">
        <div className="brutalist-border-b pb-2 mb-6">
          <h2 className="text-lg font-extrabold tracking-tight">RELATIONSHIPS</h2>
          <p className="text-xs font-mono text-muted-foreground mt-1">
            Explore connections between politicians, parties, and countries across the EU.
          </p>
        </div>

        <div className="flex gap-0 mb-6">
          {(['clusters', 'connections', 'tree'] as ViewMode[]).map(v => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={`px-4 py-2 brutalist-border font-mono text-xs transition-colors ${
                view === v ? 'bg-primary text-primary-foreground' : 'hover:bg-secondary'
              }`}
            >
              {v.toUpperCase()}
            </button>
          ))}
        </div>

        {view === 'clusters' && <ClustersView />}
        {view === 'connections' && <ConnectionsView />}
        {view === 'tree' && <TreeView />}
      </main>
      <SiteFooter />
    </div>
  );
};

const ClustersView = () => {
  const { data: positions = [] } = useAllPositions();
  const { data: politicians = [] } = usePoliticians();

  // Group by ideology_label
  const clusters = new Map<string, Array<{ name: string; id: string; party: string; country: string; economic: number; social: number }>>();
  for (const pos of positions) {
    const label = getIdeologyFamily((pos as any).ideology_label);
    if (!clusters.has(label)) clusters.set(label, []);
    clusters.get(label)!.push({
      name: (pos as any).name || 'Unknown',
      id: pos.politician_id,
      party: (pos as any).party || '',
      country: (pos as any).country || '',
      economic: Number.isFinite(Number(pos.economic_score)) ? Number(pos.economic_score) : Number.NaN,
      social: Number.isFinite(Number(pos.social_score)) ? Number(pos.social_score) : Number.NaN,
    });
  }

  const sortedClusters = Array.from(clusters.entries()).sort((a, b) => b[1].length - a[1].length);

  return (
    <div className="space-y-6">
      <p className="font-mono text-xs text-muted-foreground mb-4">
        Politicians grouped by ideological family based on party mapping and expert survey data. {positions.length} politicians mapped.
      </p>
      {sortedClusters.map(([label, members]) => {
        const color = IDEOLOGY_COLORS[label] || 'hsl(0, 0%, 55%)';
        const finiteEconomics = members.map((member) => member.economic).filter(Number.isFinite);
        const finiteSocial = members.map((member) => member.social).filter(Number.isFinite);
        const avgEcon = finiteEconomics.length > 0
          ? finiteEconomics.reduce((sum, value) => sum + value, 0) / finiteEconomics.length
          : null;
        const avgSocial = finiteSocial.length > 0
          ? finiteSocial.reduce((sum, value) => sum + value, 0) / finiteSocial.length
          : null;
        const countries = new Set(members.map(m => m.country));
        const parties = new Set(members.map(m => m.party).filter(Boolean));

        return (
          <div key={label} className="brutalist-border p-4">
            <div className="flex items-center gap-3 mb-3">
              <span className="w-4 h-4 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
              <h3 className="font-extrabold text-sm">{label.toUpperCase()}</h3>
              <span className="evidence-tag">{members.length} politicians</span>
              <span className="evidence-tag">{countries.size} countries</span>
              <span className="evidence-tag">{parties.size} parties</span>
            </div>
            <div className="flex gap-4 mb-3 font-mono text-xs text-muted-foreground">
              <span>Avg economic: <strong className="text-foreground">{avgEcon === null ? '—' : avgEcon.toFixed(1)}</strong></span>
              <span>Avg social: <strong className="text-foreground">{avgSocial === null ? '—' : avgSocial.toFixed(1)}</strong></span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {members.slice(0, 12).map(m => (
                <Link
                  key={m.id}
                  to={`/actors/${m.id}`}
                  className="flex items-center gap-2 p-2 rounded hover:bg-muted/50 transition-colors font-mono text-xs"
                >
                  <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
                  <span className="font-medium truncate">{m.name}</span>
                  {m.party && <span className="text-muted-foreground">{m.party}</span>}
                  <span className="evidence-tag text-[9px] ml-auto">{m.country}</span>
                </Link>
              ))}
              {members.length > 12 && (
                <div className="text-xs font-mono text-muted-foreground p-2">
                  +{members.length - 12} more politicians
                </div>
              )}
            </div>
          </div>
        );
      })}
      <ProvenanceBar sources={[
        { label: 'Chapel Hill Expert Survey', url: 'https://www.chesdata.eu/', type: 'model' },
        { label: 'Party family mapping', type: 'estimate' },
      ]} />
    </div>
  );
};

const ConnectionsView = () => {
  const { data: politicians = [] } = usePoliticians();

  // Group politicians by party to show cross-country party connections
  const partyGroups = new Map<string, typeof politicians>();
  for (const p of politicians) {
    if (!p.party) continue;
    if (!partyGroups.has(p.party)) partyGroups.set(p.party, []);
    partyGroups.get(p.party)!.push(p);
  }

  // Only show parties with members in multiple countries
  const crossBorderParties = Array.from(partyGroups.entries())
    .map(([party, members]) => {
      const countries = new Set(members.map(m => m.countryId.toUpperCase()));
      return { party, members, countries };
    })
    .filter(g => g.countries.size > 1 || g.members.length > 3)
    .sort((a, b) => b.members.length - a.members.length);

  // Also show country-to-country links
  const countryLinks = new Map<string, { countries: Set<string>; politicians: number }>();
  for (const p of politicians) {
    const key = p.countryId.toUpperCase();
    if (!countryLinks.has(key)) countryLinks.set(key, { countries: new Set(), politicians: 0 });
    countryLinks.get(key)!.politicians++;
  }

  return (
    <div>
      <p className="font-mono text-xs text-muted-foreground mb-4">
        Cross-border party connections and multi-country political networks. {crossBorderParties.length} party groups spanning multiple countries.
      </p>
      <div className="space-y-3">
        {crossBorderParties.slice(0, 20).map(({ party, members, countries }) => (
          <div key={party} className="brutalist-border p-4 hover:bg-secondary/50 transition-colors">
            <div className="flex items-center gap-3 mb-2 flex-wrap">
              <span className="font-mono text-sm font-bold">{party}</span>
              <span className="evidence-tag">{members.length} members</span>
              <span className="evidence-tag">{countries.size} countries</span>
              <div className="flex gap-1">
                {Array.from(countries).map(c => (
                  <Link key={c} to={`/country/${c.toLowerCase()}`} className="evidence-tag text-[9px] hover:underline">{c}</Link>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-2 mb-2">
              <div className="flex-1 h-1.5 bg-secondary brutalist-border">
                <div
                  className="h-full bg-primary"
                  style={{ width: `${Math.min((members.length / 20) * 100, 100)}%` }}
                />
              </div>
              <span className="font-mono text-xs text-muted-foreground">{members.length} politicians</span>
            </div>

            <div className="flex flex-wrap gap-1">
              {members.slice(0, 6).map(m => (
                <Link key={m.id} to={`/actors/${m.id}`} className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-muted hover:bg-primary/10 transition-colors">
                  {m.name} ({m.countryId.toUpperCase()})
                </Link>
              ))}
              {members.length > 6 && (
                <span className="text-[10px] font-mono text-muted-foreground px-1.5 py-0.5">+{members.length - 6} more</span>
              )}
            </div>
          </div>
        ))}
      </div>
      <ProvenanceBar sources={[
        { label: 'EP group membership', url: 'https://www.europarl.europa.eu/meps/en/home', type: 'official' },
        { label: 'Party affiliation records', type: 'fact' },
      ]} />
    </div>
  );
};

const TreeView = () => {
  const { data: politicians = [] } = usePoliticians();
  const { data: countryStats = [] } = useCountryStats();

  // Group by continent → country → party → politician
  const continentMap = new Map<string, Map<string, { name: string; code: string; parties: Map<string, typeof politicians> }>>();
  const countryIndex = new Map(countryStats.map((country) => [country.code, country]));

  for (const p of politicians) {
    const countryMeta = countryIndex.get(p.countryId.toUpperCase());
    const continent = countryMeta?.continent || 'Unknown';
    if (!continentMap.has(continent)) continentMap.set(continent, new Map());
    const countryMap = continentMap.get(continent)!;
    const cc = p.countryId.toUpperCase();
    if (!countryMap.has(cc)) {
      countryMap.set(cc, { name: countryMeta?.name || cc, code: cc, parties: new Map() });
    }
    const country = countryMap.get(cc)!;
    const partyKey = p.party || 'Independent';
    if (!country.parties.has(partyKey)) country.parties.set(partyKey, []);
    country.parties.get(partyKey)!.push(p);
  }

  return (
    <div>
      <p className="font-mono text-xs text-muted-foreground mb-4">
        Hierarchical view: Continent → Country → Party → Politician. {politicians.length} politicians across {countryStats.length} countries.
      </p>
      <div className="space-y-4">
        {Array.from(continentMap.entries()).map(([continent, countryMap]) => (
          <div key={continent} className="brutalist-border">
            <div className="bg-primary text-primary-foreground px-4 py-2 font-mono text-xs font-bold">
              {continent.toUpperCase()} · {countryMap.size} COUNTRIES
            </div>
            {Array.from(countryMap.entries())
              .sort((a, b) => {
                const aCount = Array.from(a[1].parties.values()).reduce((s, p) => s + p.length, 0);
                const bCount = Array.from(b[1].parties.values()).reduce((s, p) => s + p.length, 0);
                return bCount - aCount;
              })
              .map(([cc, country]) => {
                const totalActors = Array.from(country.parties.values()).reduce((s, p) => s + p.length, 0);
                return (
                  <div key={cc} className="brutalist-border-b last:border-b-0">
                    <div className="px-4 py-2 bg-secondary font-mono text-xs font-bold flex items-center gap-2">
                      <span className="text-muted-foreground">├─</span>
                      <Link to={`/country/${cc.toLowerCase()}`} className="hover:underline">
                        {cc} {country.name}
                      </Link>
                      <span className="evidence-tag text-[9px]">{totalActors} politicians</span>
                      <span className="evidence-tag text-[9px]">{country.parties.size} parties</span>
                    </div>
                    {Array.from(country.parties.entries())
                      .sort((a, b) => b[1].length - a[1].length)
                      .map(([partyName, members]) => (
                        <div key={partyName}>
                          <div className="px-4 py-1.5 font-mono text-xs flex items-center gap-2">
                            <span className="text-muted-foreground">│ ├─</span>
                            <span className="font-bold">{partyName}</span>
                            <span className="text-muted-foreground">{members.length} members</span>
                          </div>
                          {members.slice(0, 5).map(actor => (
                            <div key={actor.id} className="px-4 py-1 font-mono text-xs flex items-center gap-2">
                              <span className="text-muted-foreground">│ │ └─</span>
                              <Link to={`/actors/${actor.id}`} className="hover:underline">
                                {actor.name}
                              </Link>
                              <span className="text-muted-foreground">{actor.role}</span>
                            </div>
                          ))}
                          {members.length > 5 && (
                            <div className="px-4 py-1 font-mono text-[10px] text-muted-foreground">
                              │ │ &nbsp;&nbsp; +{members.length - 5} more
                            </div>
                          )}
                        </div>
                      ))}
                  </div>
                );
              })}
          </div>
        ))}
      </div>
      <ProvenanceBar sources={[
        { label: 'EU Parliament records', url: 'https://www.europarl.europa.eu/', type: 'official' },
        { label: 'National parliament APIs', type: 'official' },
      ]} />
    </div>
  );
};

export default Relationships;
