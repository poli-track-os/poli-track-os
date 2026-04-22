import { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import SiteHeader from '@/components/SiteHeader';
import SiteFooter from '@/components/SiteFooter';
import ProposalCard from '@/components/ProposalCard';
import { useProposals, useProposalStats, statusLabels } from '@/hooks/use-proposals';

const POLICY_AREAS = ['all', 'technology', 'environment', 'finance', 'justice', 'economy', 'healthcare', 'social_welfare', 'defense', 'energy', 'governance'];

const Proposals = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const countryFilter = searchParams.get('country') || '';
  const statusFilter = searchParams.get('status') || '';
  const areaFilter = searchParams.get('area') || '';
  const pageFilter = Math.max(1, parseInt(searchParams.get('page') || '1', 10) || 1);
  const pageSize = 60;

  const filters = useMemo(() => ({
    countryCode: countryFilter || undefined,
    status: statusFilter || undefined,
    policyArea: areaFilter || undefined,
    page: pageFilter,
    pageSize,
  }), [areaFilter, countryFilter, pageFilter, statusFilter]);

  const { data: proposals = [], isLoading } = useProposals(filters);
  const { data: stats } = useProposalStats();

  const countries = stats?.byCountry || [];

  const updateFilter = (key: 'country' | 'status' | 'area', value: string) => {
    const next = new URLSearchParams(searchParams);
    if (value) next.set(key, value);
    else next.delete(key);
    next.set('page', '1');
    setSearchParams(next);
  };

  const clearFilters = () => {
    setSearchParams({});
  };

  const setPage = (page: number) => {
    const next = new URLSearchParams(searchParams);
    if (page <= 1) next.delete('page');
    else next.set('page', String(page));
    setSearchParams(next);
  };

  const showingStart = proposals.length > 0 ? (pageFilter - 1) * pageSize + 1 : 0;
  const showingEnd = (pageFilter - 1) * pageSize + proposals.length;
  const canGoPrev = pageFilter > 1;
  const canGoNext = proposals.length === pageSize;

  return (
    <div className="min-h-screen flex flex-col">
      <SiteHeader />
      <main className="container flex-1 py-8">
        <div className="brutalist-border-b pb-2 mb-6">
          <h2 className="text-lg font-extrabold tracking-tight">LEGISLATIVE TRACKER</h2>
          <p className="text-xs font-mono text-muted-foreground mt-1">
            EU and national proposals across {stats?.total || 0} records in {countries.length} jurisdictions.
          </p>
        </div>

        {/* Stats row */}
        {stats && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
            <div className="brutalist-border p-3 bg-card">
              <div className="font-mono text-2xl font-bold">{stats.total}</div>
              <div className="text-[10px] font-mono text-muted-foreground uppercase">Total Proposals</div>
            </div>
            <div className="brutalist-border p-3 bg-card">
              <div className="font-mono text-2xl font-bold">{stats.byStatus.find(s => s.name === 'adopted')?.count || 0}</div>
              <div className="text-[10px] font-mono text-muted-foreground uppercase">Adopted</div>
            </div>
            <div className="brutalist-border p-3 bg-card">
              <div className="font-mono text-2xl font-bold">{stats.byCountry.length}</div>
              <div className="text-[10px] font-mono text-muted-foreground uppercase">Countries</div>
            </div>
            <div className="brutalist-border p-3 bg-card">
              <div className="font-mono text-2xl font-bold">{stats.byArea.length}</div>
              <div className="text-[10px] font-mono text-muted-foreground uppercase">Policy Areas</div>
            </div>
          </div>
        )}

        {/* Filters */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-3 mb-6">
          <select
            value={countryFilter}
            onChange={(e) => updateFilter('country', e.target.value)}
            className="brutalist-border px-3 py-2 sm:py-1.5 text-xs font-mono bg-card w-full"
          >
            <option value="">All Countries</option>
            {countries.map(c => (
              <option key={c.code} value={c.code}>{c.code} · {c.name} ({c.count})</option>
            ))}
          </select>

          <select
            value={statusFilter}
            onChange={(e) => updateFilter('status', e.target.value)}
            className="brutalist-border px-3 py-2 sm:py-1.5 text-xs font-mono bg-card w-full"
          >
            <option value="">All Statuses</option>
            {Object.entries(statusLabels).map(([val, label]) => (
              <option key={val} value={val}>{label}</option>
            ))}
          </select>

          <select
            value={areaFilter}
            onChange={(e) => updateFilter('area', e.target.value)}
            className="brutalist-border px-3 py-2 sm:py-1.5 text-xs font-mono bg-card w-full"
          >
            <option value="">All Policy Areas</option>
            {POLICY_AREAS.filter(a => a !== 'all').map(a => (
              <option key={a} value={a}>{a.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}</option>
            ))}
          </select>
        </div>

        {(countryFilter || statusFilter || areaFilter) && (
          <button
            onClick={clearFilters}
            className="text-xs font-mono text-accent hover:underline mb-4 block"
          >
            CLEAR FILTERS
          </button>
        )}

        {isLoading ? (
          <div className="font-mono text-sm text-muted-foreground">Loading proposals...</div>
        ) : proposals.length === 0 ? (
          <div className="brutalist-border p-6 text-center">
            <p className="font-mono text-sm text-muted-foreground">No proposals match the current filters.</p>
          </div>
        ) : (
          <>
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
              <div className="font-mono text-[10px] text-muted-foreground uppercase">
                Showing {showingStart}-{showingEnd}
                {!countryFilter && !statusFilter && !areaFilter && stats ? ` of ${stats.total}` : ''}
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setPage(pageFilter - 1)}
                  disabled={!canGoPrev}
                  className="brutalist-border px-3 py-1.5 text-xs font-mono bg-card disabled:opacity-40"
                >
                  PREV
                </button>
                <span className="font-mono text-[10px] text-muted-foreground uppercase">Page {pageFilter}</span>
                <button
                  type="button"
                  onClick={() => setPage(pageFilter + 1)}
                  disabled={!canGoNext}
                  className="brutalist-border px-3 py-1.5 text-xs font-mono bg-card disabled:opacity-40"
                >
                  NEXT
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
              {proposals.map((p) => (
                <ProposalCard key={p.id} proposal={p} />
              ))}
            </div>
          </>
        )}
      </main>
      <SiteFooter />
    </div>
  );
};

export default Proposals;
