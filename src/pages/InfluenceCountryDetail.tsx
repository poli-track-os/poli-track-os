import { Link, useParams } from 'react-router-dom';
import SiteHeader from '@/components/SiteHeader';
import SiteFooter from '@/components/SiteFooter';
import { formatInfluenceAmount, useInfluenceCountry } from '@/hooks/use-influence';

const InfluenceCountryDetail = () => {
  const { code } = useParams();
  const { data, isLoading } = useInfluenceCountry(code);

  return (
    <div className="min-h-screen flex flex-col">
      <SiteHeader />
      <main className="container flex-1 py-8">
        <Link to="/influence" className="font-mono text-xs text-accent hover:underline">← Influence registry</Link>
        <div className="brutalist-border-b pb-2 my-6">
          <h1 className="text-lg font-extrabold tracking-tight">INFLUENCE COUNTRY · {(code || '').toUpperCase()}</h1>
          <p className="text-xs font-mono text-muted-foreground mt-1">Country-level summary from US/EU disclosures and vetted secondary sources.</p>
        </div>
        {isLoading ? (
          <div className="font-mono text-sm text-muted-foreground">Loading...</div>
        ) : (
          <div className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
              <div className="brutalist-border p-3"><div className="font-mono text-lg font-bold">{data?.clients.length || 0}</div><div className="font-mono text-[10px] text-muted-foreground">CLIENTS/PRINCIPALS</div></div>
              <div className="brutalist-border p-3"><div className="font-mono text-lg font-bold">{data?.filings.length || 0}</div><div className="font-mono text-[10px] text-muted-foreground">FILINGS</div></div>
              <div className="brutalist-border p-3"><div className="font-mono text-lg font-bold">{data?.contacts.length || 0}</div><div className="font-mono text-[10px] text-muted-foreground">CONTACTS</div></div>
              <div className="brutalist-border p-3"><div className="font-mono text-lg font-bold">{formatInfluenceAmount(data?.recordedAmount || 0)}</div><div className="font-mono text-[10px] text-muted-foreground">RECORDED MONEY</div></div>
            </div>
            <section>
              <h2 className="font-mono text-xs font-bold text-muted-foreground mb-3">CLIENTS AND FOREIGN PRINCIPALS</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {(data?.clients || []).map((client) => (
                  <Link key={client.id} to={`/influence/org/${client.id}`} className="brutalist-border p-3 hover:bg-secondary">
                    <div className="font-bold text-sm">{client.name}</div>
                    <div className="font-mono text-[10px] text-muted-foreground">{[client.country_code, client.principal_country_code, client.sector].filter(Boolean).join(' · ')}</div>
                  </Link>
                ))}
              </div>
            </section>
          </div>
        )}
      </main>
      <SiteFooter />
    </div>
  );
};

export default InfluenceCountryDetail;
