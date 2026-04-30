import { Link, useSearchParams } from 'react-router-dom';
import { Building2, CircleDollarSign, Filter, Landmark, Network, ShieldAlert, Users } from 'lucide-react';
import SiteHeader from '@/components/SiteHeader';
import SiteFooter from '@/components/SiteFooter';
import { formatInfluenceAmount, useInfluenceOverview } from '@/hooks/use-influence';

function setParam(params: URLSearchParams, key: string, value: string) {
  if (value.trim()) params.set(key, value.trim());
  else params.delete(key);
}

const Influence = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const filters = {
    country: searchParams.get('country') || undefined,
    principalCountry: searchParams.get('principal_country') || undefined,
    source: searchParams.get('source') || undefined,
    sector: searchParams.get('sector') || undefined,
    targetInstitution: searchParams.get('target') || undefined,
    evidence: Number.parseInt(searchParams.get('evidence') || '4', 10),
    minAmount: Number.parseInt(searchParams.get('min_amount') || '0', 10) || undefined,
  };
  const { data, isLoading } = useInfluenceOverview(filters);
  const overview = data?.overview;

  const update = (key: string, value: string) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      setParam(next, key, value);
      return next;
    }, { replace: true });
  };

  return (
    <div className="min-h-screen flex flex-col">
      <SiteHeader />
      <main className="container flex-1 py-8">
        <div className="brutalist-border-b pb-2 mb-6">
          <h1 className="text-lg font-extrabold tracking-tight">GLOBAL INFLUENCE REGISTRY</h1>
          <p className="text-xs font-mono text-muted-foreground mt-1">
            Lobbying filings, foreign-principal disclosures, company ties, and reviewed public affiliations.
          </p>
        </div>

        <section className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-6 gap-2 mb-6">
          {[
            { label: 'Filings', value: overview?.filings_total ?? 0, icon: Landmark },
            { label: 'Clients', value: overview?.clients_total ?? 0, icon: Users },
            { label: 'Actors', value: overview?.actors_total ?? 0, icon: Network },
            { label: 'Companies', value: overview?.companies_total ?? 0, icon: Building2 },
            { label: 'Contacts', value: overview?.contacts_total ?? 0, icon: Filter },
            { label: 'Recorded Amount', value: formatInfluenceAmount(Number(overview?.recorded_amount_total || 0)), icon: CircleDollarSign },
          ].map((item) => (
            <div key={item.label} className="brutalist-border p-3 bg-card">
              <item.icon className="w-4 h-4 text-muted-foreground mb-2" />
              <div className="font-mono text-lg font-bold">
                {typeof item.value === 'number' ? item.value.toLocaleString() : item.value}
              </div>
              <div className="font-mono text-[10px] text-muted-foreground uppercase">{item.label}</div>
            </div>
          ))}
        </section>

        <section className="brutalist-border p-3 mb-6 bg-card">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-2">
            <input className="brutalist-border px-3 py-2 text-xs font-mono bg-background" placeholder="Target country, e.g. US" value={filters.country || ''} onChange={(e) => update('country', e.target.value.toUpperCase())} />
            <input className="brutalist-border px-3 py-2 text-xs font-mono bg-background" placeholder="Principal country, e.g. CN" value={filters.principalCountry || ''} onChange={(e) => update('principal_country', e.target.value.toUpperCase())} />
            <input className="brutalist-border px-3 py-2 text-xs font-mono bg-background" placeholder="Source, e.g. us_fara" value={filters.source || ''} onChange={(e) => update('source', e.target.value)} />
            <input className="brutalist-border px-3 py-2 text-xs font-mono bg-background" placeholder="Sector" value={filters.sector || ''} onChange={(e) => update('sector', e.target.value)} />
            <input className="brutalist-border px-3 py-2 text-xs font-mono bg-background" placeholder="Target institution" value={filters.targetInstitution || ''} onChange={(e) => update('target', e.target.value)} />
            <select className="brutalist-border px-3 py-2 text-xs font-mono bg-background" value={String(filters.evidence || 4)} onChange={(e) => update('evidence', e.target.value)}>
              <option value="1">Trust 1 only</option>
              <option value="2">Trust 1-2</option>
              <option value="3">Trust 1-3</option>
              <option value="4">All visible</option>
            </select>
          </div>
        </section>

        <section className="brutalist-border p-4 mb-6 bg-secondary">
          <div className="flex items-start gap-2">
            <ShieldAlert className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
            <div className="font-mono text-xs text-muted-foreground space-y-1">
              <div>Coverage is strongest where disclosure regimes exist. China, Russia, and Middle East actors appear mainly as foreign principals, counterparties, PEPs, or state-linked companies in US/EU filings.</div>
              <div>Public religion or sect claims are displayed only after review and are not an allegiance signal.</div>
            </div>
          </div>
        </section>

        {isLoading ? (
          <div className="font-mono text-sm text-muted-foreground">Loading influence registry...</div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <section>
              <h2 className="font-mono text-xs font-bold text-muted-foreground mb-3">TOP RECORDED SPENDERS</h2>
              <div className="space-y-2">
                {(data?.topSpenders || []).map((spender) => (
                  <Link key={spender.id} to={`/influence/org/${spender.id}`} className="brutalist-border p-3 flex items-center justify-between gap-3 hover:bg-secondary">
                    <div className="min-w-0">
                      <div className="font-bold text-sm truncate">{spender.name}</div>
                      <div className="font-mono text-[10px] text-muted-foreground">{[spender.sector, spender.principal_country_code].filter(Boolean).join(' · ') || 'No sector recorded'}</div>
                    </div>
                    <div className="font-mono text-xs font-bold shrink-0">{formatInfluenceAmount(spender.amount)}</div>
                  </Link>
                ))}
                {(data?.topSpenders || []).length === 0 && <div className="brutalist-border p-4 font-mono text-xs text-muted-foreground">No money rows match the filters.</div>}
              </div>
            </section>

            <section>
              <h2 className="font-mono text-xs font-bold text-muted-foreground mb-3">MOST CONTACTED TARGETS</h2>
              <div className="space-y-2">
                {(data?.topTargets || []).map((target) => (
                  <div key={target.name} className="brutalist-border p-3 flex items-center justify-between gap-3">
                    <div className="font-bold text-sm truncate">{target.name}</div>
                    <div className="font-mono text-xs text-muted-foreground shrink-0">{target.count} contacts</div>
                  </div>
                ))}
                {(data?.topTargets || []).length === 0 && <div className="brutalist-border p-4 font-mono text-xs text-muted-foreground">No contact rows match the filters.</div>}
              </div>
            </section>

            <section className="lg:col-span-2">
              <h2 className="font-mono text-xs font-bold text-muted-foreground mb-3">RECENT DISCLOSED CONTACTS</h2>
              <div className="brutalist-border overflow-x-auto">
                <table className="w-full min-w-[720px] text-xs font-mono">
                  <thead>
                    <tr className="bg-secondary border-b border-border">
                      <th className="p-2 text-left">DATE</th>
                      <th className="p-2 text-left">TARGET</th>
                      <th className="p-2 text-left">INSTITUTION</th>
                      <th className="p-2 text-left">SUBJECT</th>
                      <th className="p-2 text-left">SOURCE</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(data?.contacts || []).slice(0, 40).map((contact) => (
                      <tr key={contact.id} className="border-b border-border/50">
                        <td className="p-2">{contact.contact_date || '—'}</td>
                        <td className="p-2">{contact.target_name || '—'}</td>
                        <td className="p-2">{contact.target_institution || '—'}</td>
                        <td className="p-2">{contact.subject || '—'}</td>
                        <td className="p-2">{contact.data_source}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        )}
      </main>
      <SiteFooter />
    </div>
  );
};

export default Influence;
