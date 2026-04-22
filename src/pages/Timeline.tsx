import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import SiteHeader from '@/components/SiteHeader';
import SiteFooter from '@/components/SiteFooter';
import { eventTypeLabels, sourceLabels } from '@/data/domain';
import { useCountryStats } from '@/hooks/use-politicians';
import type { Tables } from '@/integrations/supabase/types';
import { Search } from 'lucide-react';
import { formatTimestampLabel } from '@/lib/date-display';

type EventRow = Tables<'political_events'>;

const PAGE_SIZE = 100;

interface EventWithPolitician extends EventRow {
  politicians?: { id: string; name: string; country_code: string | null; party_name: string | null } | null;
}

function useTimeline(filters: { eventType: string | null; source: string | null; country: string | null; offset: number }) {
  return useQuery({
    queryKey: ['timeline', filters],
    queryFn: async () => {
      const joinClause = filters.country
        ? '*, politicians!inner(id, name, country_code, party_name)'
        : '*, politicians(id, name, country_code, party_name)';
      let query = supabase
        .from('political_events')
        .select(joinClause, { count: 'exact' })
        .order('event_timestamp', { ascending: false })
        .range(filters.offset, filters.offset + PAGE_SIZE - 1);
      if (filters.eventType) query = query.eq('event_type', filters.eventType as never);
      if (filters.source) query = query.eq('source', filters.source as never);
      if (filters.country) query = query.eq('politicians.country_code' as never, filters.country);
      const { data, error, count } = await query;
      if (error) throw error;
      return { rows: (data || []) as EventWithPolitician[], total: count ?? 0 };
    },
  });
}

const Timeline = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const eventType = searchParams.get('type');
  const source = searchParams.get('source');
  const country = searchParams.get('country');
  const page = Number.parseInt(searchParams.get('page') || '0', 10);

  const offset = page * PAGE_SIZE;
  const { data, isLoading } = useTimeline({ eventType, source, country, offset });
  const { data: countryStats } = useCountryStats();
  const [search, setSearch] = useState('');

  const countries = useMemo(() => {
    if (!countryStats) return [];
    return [...countryStats].sort((a, b) => a.name.localeCompare(b.name));
  }, [countryStats]);

  const setParam = (key: string, value: string | null) => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (value === null || value === '') next.delete(key);
        else next.set(key, value);
        if (key !== 'page') next.delete('page');
        return next;
      },
      { replace: true },
    );
  };

  const filtered = useMemo(() => {
    if (!data?.rows) return [];
    if (!search.trim()) return data.rows;
    const q = search.trim().toLowerCase();
    return data.rows.filter((r) => {
      return (
        r.title.toLowerCase().includes(q) ||
        (r.politicians?.name || '').toLowerCase().includes(q) ||
        (r.politicians?.party_name || '').toLowerCase().includes(q)
      );
    });
  }, [data, search]);

  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <div className="min-h-screen flex flex-col">
      <SiteHeader />
      <main className="container flex-1 py-8">
        <div className="brutalist-border-b pb-2 mb-6">
          <h1 className="text-lg font-extrabold tracking-tight">EVENT TIMELINE</h1>
          <p className="text-xs font-mono text-muted-foreground mt-1">
            All tracked political events across every source. {total.toLocaleString()} total events.
          </p>
        </div>

        <div className="flex flex-wrap gap-3 mb-6 items-end">
          <div>
            <label className="font-mono text-[10px] text-muted-foreground block mb-1">EVENT TYPE</label>
            <select
              value={eventType || ''}
              onChange={(e) => setParam('type', e.target.value || null)}
              className="brutalist-border px-3 py-2 text-sm font-mono bg-card"
            >
              <option value="">all</option>
              {Object.entries(eventTypeLabels).map(([code, label]) => (
                <option key={code} value={code}>{label} ({code})</option>
              ))}
            </select>
          </div>

          <div>
            <label className="font-mono text-[10px] text-muted-foreground block mb-1">SOURCE</label>
            <select
              value={source || ''}
              onChange={(e) => setParam('source', e.target.value || null)}
              className="brutalist-border px-3 py-2 text-sm font-mono bg-card"
            >
              <option value="">all</option>
              {Object.entries(sourceLabels).map(([code, label]) => (
                <option key={code} value={code}>{label}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="font-mono text-[10px] text-muted-foreground block mb-1">COUNTRY</label>
            <select
              value={country || ''}
              onChange={(e) => setParam('country', e.target.value || null)}
              className="brutalist-border px-3 py-2 text-sm font-mono bg-card"
            >
              <option value="">all</option>
              {countries.map((c) => (
                <option key={c.code} value={c.code}>{c.name} ({c.code})</option>
              ))}
            </select>
          </div>

          <div className="flex-1 min-w-[200px]">
            <label className="font-mono text-[10px] text-muted-foreground block mb-1">SEARCH</label>
            <div className="brutalist-border flex items-center bg-card">
              <div className="px-2 brutalist-border border-t-0 border-b-0 border-l-0 bg-secondary py-2">
                <Search className="w-3.5 h-3.5 text-muted-foreground" />
              </div>
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Filter visible page…"
                className="flex-1 px-3 py-2 bg-transparent text-sm font-mono placeholder:text-muted-foreground focus:outline-none"
              />
            </div>
          </div>
        </div>

        {isLoading && <div className="font-mono text-sm text-muted-foreground">Loading events…</div>}

        {!isLoading && (
          <>
            <div className="brutalist-border divide-y divide-border">
              {filtered.length === 0 && (
                <div className="p-4 font-mono text-sm text-muted-foreground">No events match.</div>
              )}
              {filtered.map((event) => (
                <div key={event.id} className="p-3 hover:bg-secondary/30 transition-colors">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="evidence-tag text-[9px]">{eventTypeLabels[event.event_type as keyof typeof eventTypeLabels] || event.event_type}</span>
                        {event.source && (
                          <span className="evidence-tag text-[9px]">{sourceLabels[event.source as keyof typeof sourceLabels] || event.source}</span>
                        )}
                        {event.trust_level && (
                          <span className="font-mono text-[9px] text-muted-foreground">trust {event.trust_level}</span>
                        )}
                      </div>
                      <div className="font-bold text-sm leading-tight">{event.title}</div>
                      {event.politicians && (
                        <a href={`/actors/${event.politicians.id}`} className="font-mono text-xs text-accent hover:underline">
                          {event.politicians.name}
                          {event.politicians.party_name && ` · ${event.politicians.party_name}`}
                          {event.politicians.country_code && ` · ${event.politicians.country_code}`}
                        </a>
                      )}
                    </div>
                    <div className="text-right shrink-0">
                      <div className="font-mono text-[10px] text-muted-foreground">
                        {formatTimestampLabel(event.event_timestamp)}
                      </div>
                      {event.source_url && (
                        <a href={event.source_url} target="_blank" rel="noopener noreferrer" className="text-[10px] text-accent hover:underline font-mono">
                          source →
                        </a>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex items-center justify-between mt-6 font-mono text-xs">
              <button
                onClick={() => setParam('page', String(Math.max(0, page - 1)))}
                disabled={page === 0}
                className="brutalist-border px-3 py-2 disabled:opacity-50"
              >
                ← prev
              </button>
              <div className="text-muted-foreground">
                page {page + 1} / {totalPages || 1}
              </div>
              <button
                onClick={() => setParam('page', String(page + 1))}
                disabled={page + 1 >= totalPages}
                className="brutalist-border px-3 py-2 disabled:opacity-50"
              >
                next →
              </button>
            </div>
          </>
        )}
      </main>
      <SiteFooter />
    </div>
  );
};

export default Timeline;
