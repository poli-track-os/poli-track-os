import { useState } from 'react';
import SiteHeader from '@/components/SiteHeader';
import SiteFooter from '@/components/SiteFooter';
import { useTopLobbyOrgs, useTotalLobbyOrgs, type LobbyOrganisationWithSpend } from '@/hooks/use-lobby';
import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Building, ExternalLink, Search } from 'lucide-react';

function formatEur(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return '—';
  if (value >= 1_000_000) return `€${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `€${(value / 1_000).toFixed(0)}k`;
  return `€${value.toFixed(0)}`;
}

const Lobby = () => {
  const [query, setQuery] = useState('');
  const { data: orgs = [], isLoading } = useTopLobbyOrgs(50);
  const { data: total = 0 } = useTotalLobbyOrgs();

  const filtered = query
    ? orgs.filter((o) =>
        o.name.toLowerCase().includes(query.toLowerCase()) ||
        (o.category || '').toLowerCase().includes(query.toLowerCase()) ||
        (o.country_of_hq || '').toLowerCase().includes(query.toLowerCase()),
      )
    : orgs;

  const chartData = filtered.slice(0, 15).map((o) => ({
    name: o.name.length > 30 ? `${o.name.slice(0, 28)}…` : o.name,
    spend: o.latestSpend ?? 0,
    transparencyId: o.transparency_id,
  }));

  return (
    <div className="min-h-screen flex flex-col">
      <SiteHeader />
      <main className="container flex-1 py-8">
        <div className="brutalist-border-b pb-2 mb-6">
          <h1 className="text-lg font-extrabold tracking-tight">LOBBY MONEY TRAIL</h1>
          <p className="text-xs font-mono text-muted-foreground mt-1">
            EU Transparency Register data via{' '}
            <a className="underline" href="https://www.lobbyfacts.eu/" target="_blank" rel="noopener noreferrer">
              LobbyFacts.eu
            </a>{' '}
            (CC-BY 4.0). Spend amounts are self-declared by registered organisations.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
          <div className="brutalist-border p-3">
            <div className="font-mono text-[10px] text-muted-foreground">REGISTERED ORGS</div>
            <div className="font-mono text-sm font-bold">{total.toLocaleString()}</div>
          </div>
          <div className="brutalist-border p-3">
            <div className="font-mono text-[10px] text-muted-foreground">TOP 50 SHOWN</div>
            <div className="font-mono text-sm font-bold">{orgs.length}</div>
          </div>
          <div className="brutalist-border p-3 bg-secondary">
            <div className="font-mono text-[10px] text-muted-foreground">SOURCE LICENCE</div>
            <div className="font-mono text-sm font-bold">CC-BY 4.0</div>
          </div>
        </div>

        <div className="brutalist-border mb-4 flex items-center bg-card">
          <div className="px-3 py-2.5 brutalist-border border-t-0 border-b-0 border-l-0 bg-secondary">
            <Search className="w-4 h-4 text-muted-foreground" />
          </div>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter by name, category, or country…"
            className="flex-1 px-3 py-2.5 bg-transparent text-sm font-mono placeholder:text-muted-foreground focus:outline-none"
          />
        </div>

        {isLoading && <div className="font-mono text-sm text-muted-foreground">Loading lobby data…</div>}

        {!isLoading && orgs.length === 0 && (
          <div className="brutalist-border p-6 font-mono text-sm text-muted-foreground">
            <p>No lobby organisations ingested yet.</p>
            <p className="mt-2 text-xs">
              Run <code className="bg-secondary px-1">node --experimental-strip-types scripts/sync-lobbyfacts.ts --apply --max-orgs 200</code>{' '}
              to populate. The full register has ~16,700 organisations and takes ~1 hour to backfill.
            </p>
          </div>
        )}

        {!isLoading && orgs.length > 0 && (
          <>
            <div className="brutalist-border p-4 mb-6">
              <h2 className="font-mono text-xs font-bold mb-3 text-muted-foreground">TOP 15 BY DECLARED SPEND</h2>
              <ResponsiveContainer width="100%" height={400}>
                <BarChart data={chartData} layout="vertical" margin={{ left: 30, right: 20 }}>
                  <XAxis type="number" tickFormatter={(v) => formatEur(v)} tick={{ fontSize: 10, fontFamily: 'JetBrains Mono' }} />
                  <YAxis type="category" dataKey="name" width={210} tick={{ fontSize: 10, fontFamily: 'JetBrains Mono' }} />
                  <Tooltip
                    content={({ active, payload }) => {
                      if (!active || !payload?.[0]) return null;
                      const row = payload[0].payload as (typeof chartData)[number];
                      return (
                        <div className="brutalist-border bg-card p-2 font-mono text-xs">
                          <div className="font-bold">{row.name}</div>
                          <div>{formatEur(row.spend)} latest declared spend</div>
                        </div>
                      );
                    }}
                  />
                  <Bar dataKey="spend" fill="hsl(340, 65%, 50%)">
                    {chartData.map((d) => (
                      <Cell key={d.transparencyId} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {filtered.map((org: LobbyOrganisationWithSpend) => (
                <div key={org.id} className="brutalist-border p-3">
                  <div className="flex items-start gap-2">
                    <Building className="w-4 h-4 mt-0.5 text-muted-foreground shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="font-bold text-sm truncate">{org.name}</div>
                      <div className="font-mono text-[10px] text-muted-foreground mt-0.5">
                        {[org.category, org.country_of_hq].filter(Boolean).join(' · ')}
                      </div>
                      <div className="font-mono text-xs mt-1.5">
                        latest spend{' '}
                        <span className="font-bold">{formatEur(org.latestSpend)}</span>
                        {org.latestSpendYear && <span className="text-muted-foreground"> ({org.latestSpendYear})</span>}
                      </div>
                      {org.website && (
                        <a
                          href={org.website}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-[10px] font-mono text-accent hover:underline mt-1.5"
                        >
                          {org.website.replace(/^https?:\/\/(www\.)?/, '')}
                          <ExternalLink className="w-2.5 h-2.5" />
                        </a>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        <div className="mt-8 brutalist-border-t pt-4 font-mono text-[10px] text-muted-foreground space-y-1">
          <div>Source: <a className="underline" href="https://www.lobbyfacts.eu/" target="_blank" rel="noopener noreferrer">LobbyFacts.eu</a> (republishes EU Transparency Register, CC-BY 4.0)</div>
          <div>Spend amounts are self-declared by registered lobby organisations to the European Commission.</div>
          <div>Meeting data, where available, comes from EP MEP rapporteur disclosures and Commission cabinet logs.</div>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
};

export default Lobby;
