import { Link, useSearchParams } from 'react-router-dom';
import SiteHeader from '@/components/SiteHeader';
import SiteFooter from '@/components/SiteFooter';
import { useInfluenceNetwork } from '@/hooks/use-influence';

const InfluenceNetwork = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const seed = searchParams.get('seed');
  const { data, isLoading } = useInfluenceNetwork(seed);

  return (
    <div className="min-h-screen flex flex-col">
      <SiteHeader />
      <main className="container flex-1 py-8">
        <Link to="/influence" className="font-mono text-xs text-accent hover:underline">← Influence registry</Link>
        <div className="brutalist-border-b pb-2 my-6">
          <h1 className="text-lg font-extrabold tracking-tight">INFLUENCE NETWORK</h1>
          <p className="text-xs font-mono text-muted-foreground mt-1">One-hop influence edges for contacts, payments, officers, and ownership.</p>
        </div>
        <div className="brutalist-border p-3 mb-6 flex gap-2">
          <input
            value={seed || ''}
            onChange={(e) => setSearchParams(e.target.value ? { seed: e.target.value } : {})}
            placeholder="Seed UUID"
            className="flex-1 brutalist-border px-3 py-2 text-xs font-mono bg-background"
          />
        </div>
        {!seed ? (
          <div className="brutalist-border p-6 font-mono text-sm text-muted-foreground">Open a network from an influence detail page or paste a seed UUID.</div>
        ) : isLoading ? (
          <div className="font-mono text-sm text-muted-foreground">Loading network...</div>
        ) : (
          <div className="space-y-2">
            {(data?.edges || []).map((edge: any, index) => (
              <div key={`${edge.id || index}-${edge.predicate}`} className="brutalist-border p-3">
                <div className="font-mono text-xs font-bold">{edge.predicate}</div>
                <div className="font-mono text-[10px] text-muted-foreground break-all">
                  {JSON.stringify(edge).slice(0, 240)}
                </div>
              </div>
            ))}
            {(data?.edges || []).length === 0 && <div className="brutalist-border p-6 font-mono text-sm text-muted-foreground">No one-hop influence edges found for this seed.</div>}
          </div>
        )}
      </main>
      <SiteFooter />
    </div>
  );
};

export default InfluenceNetwork;
