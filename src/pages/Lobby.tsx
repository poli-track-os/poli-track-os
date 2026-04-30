import { useState } from 'react';
import { Link } from 'react-router-dom';
import SiteHeader from '@/components/SiteHeader';
import SiteFooter from '@/components/SiteFooter';
import {
  useLobbyInfluenceSummary,
  useTopLobbyOrgs,
  useTotalLobbyOrgs,
  type LobbyOrganisationWithSpend,
} from '@/hooks/use-lobby';
import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Building, ExternalLink, Landmark, Network, Search } from 'lucide-react';

function formatEur(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return '—';
  if (value >= 1_000_000) return `€${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `€${(value / 1_000).toFixed(0)}k`;
  return `€${value.toFixed(0)}`;
}

function formatRegistryNumber(value: number | string | null | undefined): string {
  const numeric = Number(value ?? 0);
  if (!Number.isFinite(numeric)) return '—';
  return numeric.toLocaleString();
}

function formatMixedReportedAmount(value: number | string | null | undefined): string {
  const numeric = Number(value ?? 0);
  if (!Number.isFinite(numeric) || numeric <= 0) return '—';
  if (numeric >= 1_000_000_000) return `${(numeric / 1_000_000_000).toFixed(1)}B`;
  if (numeric >= 1_000_000) return `${(numeric / 1_000_000).toFixed(1)}M`;
  if (numeric >= 1_000) return `${(numeric / 1_000).toFixed(0)}k`;
  return numeric.toFixed(0);
}

const Lobby = () => {
  const [query, setQuery] = useState('');
  const { data: orgs = [], isLoading } = useTopLobbyOrgs(50);
  const { data: total = 0 } = useTotalLobbyOrgs();
  const { data: influence, isLoading: isInfluenceLoading } = useLobbyInfluenceSummary();
  const queryText = query.toLowerCase();

  const filtered = query
    ? orgs.filter((o) =>
        o.name.toLowerCase().includes(queryText) ||
        (o.category || '').toLowerCase().includes(queryText) ||
        (o.country_of_hq || '').toLowerCase().includes(queryText),
      )
    : orgs;

  const filteredInfluenceSpenders = query
    ? (influence?.topInfluenceSpenders || []).filter((spender) =>
        spender.name.toLowerCase().includes(queryText) ||
        (spender.sector || '').toLowerCase().includes(queryText) ||
        (spender.principalCountryCode || '').toLowerCase().includes(queryText),
      )
    : influence?.topInfluenceSpenders || [];

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
          <h1 className="text-lg font-extrabold tracking-tight">LOBBY & INFLUENCE MONEY TRAIL</h1>
          <p className="text-xs font-mono text-muted-foreground mt-1">
            Legacy EU lobby records plus the new Global Influence Registry. EU Transparency Register data via{' '}
            <a className="underline" href="https://www.lobbyfacts.eu/" target="_blank" rel="noopener noreferrer">
              LobbyFacts.eu
            </a>{' '}
            (CC-BY 4.0); US and global influence rows come from official or structured source imports.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
          <div className="brutalist-border p-3">
            <div className="font-mono text-[10px] text-muted-foreground">EU REGISTERED ORGS</div>
            <div className="font-mono text-sm font-bold">{total.toLocaleString()}</div>
          </div>
          <div className="brutalist-border p-3">
            <div className="font-mono text-[10px] text-muted-foreground">INFLUENCE FILINGS</div>
            <div className="font-mono text-sm font-bold">
              {isInfluenceLoading ? '…' : formatRegistryNumber(influence?.overview?.filings_total)}
            </div>
          </div>
          <div className="brutalist-border p-3">
            <div className="font-mono text-[10px] text-muted-foreground">DISCLOSED CONTACTS</div>
            <div className="font-mono text-sm font-bold">
              {isInfluenceLoading ? '…' : formatRegistryNumber(influence?.overview?.contacts_total)}
            </div>
          </div>
          <div className="brutalist-border p-3 bg-secondary">
            <div className="font-mono text-[10px] text-muted-foreground">RECORDED AMOUNTS</div>
            <div className="font-mono text-sm font-bold">
              {isInfluenceLoading ? '…' : formatMixedReportedAmount(influence?.overview?.recorded_amount_total)}
            </div>
            <div className="font-mono text-[10px] text-muted-foreground">mixed reported currencies</div>
          </div>
        </div>

        <div className="brutalist-border p-4 mb-6 bg-card">
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div>
              <div className="font-mono text-[10px] text-muted-foreground mb-1">MERGED REGISTRY</div>
              <h2 className="font-mono text-sm font-bold">GLOBAL INFLUENCE REGISTRY</h2>
              <p className="font-mono text-xs text-muted-foreground mt-1 max-w-3xl">
                Includes the live influence layer populated from US LDA, EU Transparency/LobbyFacts, OpenSanctions, and curated public-source queues. Public affiliation claims stay hidden unless reviewed.
              </p>
            </div>
            <Link
              to="/influence"
              className="inline-flex items-center justify-center gap-2 brutalist-border px-3 py-2 font-mono text-xs font-bold hover:bg-secondary"
            >
              <Network className="w-4 h-4" />
              OPEN DASHBOARD
            </Link>
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

        {!isLoading && orgs.length === 0 && !influence?.overview && (
          <div className="brutalist-border p-6 font-mono text-sm text-muted-foreground">
            <p>No lobby or influence records ingested yet.</p>
            <p className="mt-2 text-xs">
              Run <code className="bg-secondary px-1">node --experimental-strip-types scripts/sync-lobbyfacts.ts --apply --max-orgs 200</code>{' '}
              to populate. The full register has ~16,700 organisations and takes ~1 hour to backfill.
            </p>
          </div>
        )}

        {!isLoading && (orgs.length > 0 || influence?.overview) && (
          <>
            {orgs.length > 0 && (
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
            )}

            {influence?.overview && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 mb-6">
                <div className="brutalist-border p-4">
                  <h2 className="font-mono text-xs font-bold mb-3 text-muted-foreground">TOP GLOBAL INFLUENCE SPENDERS</h2>
                  <div className="space-y-3">
                    {filteredInfluenceSpenders.length === 0 && (
                      <div className="font-mono text-xs text-muted-foreground">No registry spender matches this filter.</div>
                    )}
                    {filteredInfluenceSpenders.map((spender) => (
                      <div key={spender.id} className="flex items-start gap-2">
                        <Network className="w-4 h-4 mt-0.5 text-muted-foreground shrink-0" />
                        <div className="min-w-0 flex-1">
                          <div className="font-bold text-sm truncate">{spender.name}</div>
                          <div className="font-mono text-[10px] text-muted-foreground">
                            {[spender.sector, spender.principalCountryCode].filter(Boolean).join(' · ') || 'source-linked principal'}
                          </div>
                        </div>
                        <div className="font-mono text-xs font-bold shrink-0">{formatMixedReportedAmount(spender.amount)}</div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="brutalist-border p-4">
                  <h2 className="font-mono text-xs font-bold mb-3 text-muted-foreground">MOST CONTACTED INSTITUTIONS</h2>
                  <div className="space-y-3">
                    {(influence.topInfluenceTargets || []).map((target) => (
                      <div key={target.name} className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2 min-w-0">
                          <Landmark className="w-4 h-4 text-muted-foreground shrink-0" />
                          <div className="font-bold text-sm truncate">{target.name}</div>
                        </div>
                        <div className="font-mono text-xs font-bold shrink-0">{target.count.toLocaleString()}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {orgs.length > 0 && (
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
            )}
          </>
        )}

        <div className="mt-8 brutalist-border-t pt-4 font-mono text-[10px] text-muted-foreground space-y-1">
          <div>Source: <a className="underline" href="https://www.lobbyfacts.eu/" target="_blank" rel="noopener noreferrer">LobbyFacts.eu</a> (republishes EU Transparency Register, CC-BY 4.0)</div>
          <div>Influence registry sources include US Senate LDA disclosures, EU Transparency/LobbyFacts imports, OpenSanctions, and curated public-source imports.</div>
          <div>Spend amounts are self-declared by registered lobby organisations to the European Commission.</div>
          <div>Religion or sect claims are only shown as reviewed public affiliations and are not treated as allegiance signals.</div>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
};

export default Lobby;
