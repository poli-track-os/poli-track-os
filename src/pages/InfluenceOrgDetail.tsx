import { Link, useParams } from 'react-router-dom';
import SiteHeader from '@/components/SiteHeader';
import SiteFooter from '@/components/SiteFooter';
import { formatInfluenceAmount, useInfluenceOrg } from '@/hooks/use-influence';

const InfluenceOrgDetail = () => {
  const { id } = useParams();
  const { data, isLoading } = useInfluenceOrg(id);
  const title = data?.client?.name || data?.actor?.name || data?.company?.name || 'Influence organisation';
  const moneyTotal = (data?.money || []).reduce((sum, row) => sum + Number(row.amount_exact ?? row.amount_high ?? row.amount_low ?? 0), 0);

  return (
    <div className="min-h-screen flex flex-col">
      <SiteHeader />
      <main className="container flex-1 py-8">
        <Link to="/influence" className="font-mono text-xs text-accent hover:underline">← Influence registry</Link>
        <div className="brutalist-border-b pb-2 my-6">
          <h1 className="text-lg font-extrabold tracking-tight">{title}</h1>
          <p className="text-xs font-mono text-muted-foreground mt-1">
            {[data?.client?.principal_country_code, data?.client?.sector, data?.actor?.actor_kind, data?.company?.jurisdiction_code].filter(Boolean).join(' · ') || 'Influence registry detail'}
          </p>
        </div>
        {isLoading ? (
          <div className="font-mono text-sm text-muted-foreground">Loading...</div>
        ) : (
          <div className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
              <div className="brutalist-border p-3"><div className="font-mono text-lg font-bold">{(data?.filings || []).length}</div><div className="font-mono text-[10px] text-muted-foreground">FILINGS</div></div>
              <div className="brutalist-border p-3"><div className="font-mono text-lg font-bold">{(data?.contacts || []).length}</div><div className="font-mono text-[10px] text-muted-foreground">CONTACTS</div></div>
              <div className="brutalist-border p-3"><div className="font-mono text-lg font-bold">{formatInfluenceAmount(moneyTotal)}</div><div className="font-mono text-[10px] text-muted-foreground">RECORDED MONEY</div></div>
              <Link to={`/influence/network?seed=${id}`} className="brutalist-border p-3 hover:bg-secondary"><div className="font-mono text-lg font-bold">OPEN</div><div className="font-mono text-[10px] text-muted-foreground">NETWORK</div></Link>
            </div>

            <section>
              <h2 className="font-mono text-xs font-bold text-muted-foreground mb-3">FILINGS</h2>
              <div className="space-y-2">
                {(data?.filings || []).map((filing) => (
                  <div key={filing.id} className="brutalist-border p-3">
                    <div className="font-bold text-sm">{filing.filing_type} · {filing.filing_id}</div>
                    <div className="font-mono text-xs text-muted-foreground">{[filing.year, filing.registrant_name, filing.client_name].filter(Boolean).join(' · ')}</div>
                    {filing.source_url && <a href={filing.source_url} target="_blank" rel="noopener noreferrer" className="font-mono text-[10px] text-accent hover:underline">source</a>}
                  </div>
                ))}
              </div>
            </section>

            <section>
              <h2 className="font-mono text-xs font-bold text-muted-foreground mb-3">CONTACTS</h2>
              <div className="brutalist-border overflow-x-auto">
                <table className="w-full min-w-[640px] text-xs font-mono">
                  <tbody>
                    {(data?.contacts || []).map((contact) => (
                      <tr key={contact.id} className="border-b border-border/50">
                        <td className="p-2">{contact.contact_date || '—'}</td>
                        <td className="p-2">{contact.target_name || contact.target_institution || '—'}</td>
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

export default InfluenceOrgDetail;
