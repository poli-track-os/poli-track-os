import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search } from 'lucide-react';
import { useCountryStats, usePoliticians } from '@/hooks/use-politicians';
import { useProposals } from '@/hooks/use-proposals';

interface SearchResult {
  type: 'proposal' | 'actor' | 'country';
  id: string;
  label: string;
  detail: string;
}

const SearchBar = () => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const { data: actors = [] } = usePoliticians();
  const { data: countries = [] } = useCountryStats();
  const { data: proposals = [] } = useProposals();

  const handleSearch = (q: string) => {
    setQuery(q);
    if (q.length < 2) { setResults([]); setOpen(false); return; }
    const lower = q.toLowerCase();

    const matched: SearchResult[] = [
      ...proposals
        .filter(p => p.title.toLowerCase().includes(lower) || (p.official_title || '').toLowerCase().includes(lower))
        .slice(0, 5)
        .map(p => ({ type: 'proposal' as const, id: p.id, label: p.title, detail: `${p.country_code} · ${p.status.toUpperCase()}` })),
      ...actors
        .filter(a => a.name.toLowerCase().includes(lower) || a.party.toLowerCase().includes(lower))
        .slice(0, 10)
        .map(a => ({ type: 'actor' as const, id: a.id, label: a.name, detail: `${a.party} · ${a.countryId.toUpperCase()}` })),
      ...countries
        .filter(c => c.name.toLowerCase().includes(lower) || c.code.toLowerCase().includes(lower))
        .sort((a, b) => b.actorCount - a.actorCount || a.name.localeCompare(b.name))
        .map(c => ({
          type: 'country' as const,
          id: c.code.toLowerCase(),
          label: c.name,
          detail: `${c.code} · ${c.actorCount} actors`,
        })),
    ];
    setResults(matched.slice(0, 15));
    setOpen(matched.length > 0);
  };

  const go = (r: SearchResult) => {
    setOpen(false); setQuery('');
    if (r.type === 'proposal') navigate(`/proposals/${r.id}`);
    else if (r.type === 'actor') navigate(`/actors/${r.id}`);
    else navigate(`/country/${r.id}`);
  };

  return (
    <div className="relative">
      <div className="brutalist-border flex items-center">
        <div className="px-3 py-2.5 brutalist-border border-t-0 border-b-0 border-l-0 bg-secondary">
          <Search className="w-4 h-4 text-muted-foreground" />
        </div>
        <input
          type="text"
          value={query}
          onChange={(e) => handleSearch(e.target.value)}
          onFocus={() => results.length > 0 && setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          placeholder="Search politicians, proposals, countries..."
          className="flex-1 px-3 py-2.5 bg-transparent text-sm font-mono placeholder:text-muted-foreground focus:outline-none"
        />
        {query && (
          <button onClick={() => { setQuery(''); setResults([]); setOpen(false); }} className="px-3 font-mono text-xs text-muted-foreground hover:text-foreground">
            CLEAR
          </button>
        )}
      </div>
      {open && (
        <div className="absolute z-50 left-0 right-0 mt-0 brutalist-border border-t-0 bg-background max-h-64 overflow-y-auto">
          {results.map((r) => (
            <button
              key={`${r.type}-${r.id}`}
              onMouseDown={() => go(r)}
              className="w-full text-left px-4 py-2.5 hover:bg-secondary flex items-center justify-between font-mono text-sm brutalist-border-b last:border-b-0"
            >
              <span>
                <span className="text-xs text-muted-foreground mr-2">
                  {r.type === 'proposal' ? 'PROP' : r.type === 'actor' ? 'ACTOR' : 'COUNTRY'}
                </span>
                {r.label}
              </span>
              <span className="text-xs text-muted-foreground">{r.detail}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default SearchBar;
