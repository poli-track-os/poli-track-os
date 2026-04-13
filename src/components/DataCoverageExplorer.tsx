import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Search } from 'lucide-react';
import { getAvailabilityHeatmapCellStyle } from '@/lib/data-availability-heatmap';
import type { ThemeMode } from '@/hooks/use-theme-mode';
import {
  COVERAGE_FIELDS,
  type CoverageAggregateRow,
  type CoverageModel,
  type CoveragePersonRow,
} from '@/lib/data-coverage';

type DataCoverageExplorerProps = {
  coverage: CoverageModel;
  theme: ThemeMode;
};

type CoverageView = 'people' | 'parties' | 'countries';

function CoverageStatCard({
  label,
  value,
  sub,
}: {
  label: string;
  value: string | number;
  sub?: string;
}) {
  return (
    <div className="brutalist-border p-3 bg-card">
      <div className="text-2xl font-extrabold tracking-tighter">{value}</div>
      <div className="text-[10px] font-mono text-muted-foreground uppercase mt-1">{label}</div>
      {sub ? <div className="text-[10px] text-muted-foreground mt-1">{sub}</div> : null}
    </div>
  );
}

function renderCoverageBar(percent: number) {
  return (
    <div className="w-24 sm:w-28">
      <div className="flex items-center justify-between gap-2 text-[10px] font-mono text-muted-foreground mb-1">
        <span>{percent}%</span>
      </div>
      <div className="h-2 bg-muted rounded-full overflow-hidden">
        <div
          className="h-full rounded-full"
          style={{
            width: `${percent}%`,
            backgroundColor:
              percent >= 80 ? 'hsl(142, 50%, 40%)' : percent >= 50 ? 'hsl(38, 80%, 50%)' : 'hsl(0, 55%, 45%)',
          }}
        />
      </div>
    </div>
  );
}

function filterAggregateRows(rows: CoverageAggregateRow[], query: string) {
  if (!query) return rows;
  return rows.filter((row) => row.searchText.includes(query));
}

function filterPersonRows(rows: CoveragePersonRow[], query: string) {
  if (!query) return rows;
  return rows.filter((row) => row.searchText.includes(query));
}

export default function DataCoverageExplorer({ coverage, theme }: DataCoverageExplorerProps) {
  const [view, setView] = useState<CoverageView>('people');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(0);

  useEffect(() => {
    setQuery('');
    setPage(0);
  }, [view]);

  useEffect(() => {
    setPage(0);
  }, [query]);

  const normalizedQuery = query.trim().toLowerCase();
  const filteredRows = useMemo(() => {
    if (view === 'people') return filterPersonRows(coverage.people, normalizedQuery);
    if (view === 'parties') return filterAggregateRows(coverage.parties, normalizedQuery);
    return filterAggregateRows(coverage.countries, normalizedQuery);
  }, [coverage.countries, coverage.parties, coverage.people, normalizedQuery, view]);

  const pageSize = view === 'people' ? 50 : 24;
  const pageCount = Math.max(1, Math.ceil(filteredRows.length / pageSize));
  const safePage = Math.min(page, pageCount - 1);
  const visibleRows = filteredRows.slice(safePage * pageSize, (safePage + 1) * pageSize);
  const rangeStart = filteredRows.length === 0 ? 0 : safePage * pageSize + 1;
  const rangeEnd = filteredRows.length === 0 ? 0 : safePage * pageSize + visibleRows.length;

  return (
    <section id="coverage-ledger" className="space-y-5">
      <div className="brutalist-border-b pb-2">
        <h2 className="text-xl font-extrabold tracking-tighter font-mono">COVERAGE LEDGER</h2>
        <p className="text-xs font-mono text-muted-foreground mt-1">
          Track what data is present and missing by person, party, and country. Person rows show direct presence checks;
          party and country rows roll the same fields up into percentages.
        </p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <CoverageStatCard
          label="People Fully Covered"
          value={coverage.summary.fullyCoveredPeople}
          sub={`${coverage.summary.trackedFields} tracked fields each`}
        />
        <CoverageStatCard
          label="People With Gaps"
          value={coverage.summary.peopleWithGaps}
          sub={`${coverage.summary.totalPeople} total people`}
        />
        <CoverageStatCard
          label="Critical Gaps"
          value={coverage.summary.criticalGaps}
          sub="3 or fewer fields present"
        />
        <CoverageStatCard
          label="Average Completeness"
          value={`${coverage.summary.averageCompleteness}%`}
          sub={`Across ${coverage.summary.trackedFields} tracked fields`}
        />
      </div>

      <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-3">
        {coverage.summary.fieldCoverage.map((field) => (
          <div key={field.key} className="brutalist-border p-3 bg-card">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-xs font-mono font-bold">{field.label}</div>
                <div className="text-[10px] font-mono text-muted-foreground mt-1">
                  {field.presentCount} present · {field.missingCount} missing
                </div>
              </div>
              {renderCoverageBar(field.presentRate)}
            </div>
          </div>
        ))}
      </div>

      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
        <div className="flex flex-wrap gap-2 font-mono text-xs">
          {([
            { key: 'people', label: `PEOPLE (${coverage.people.length})` },
            { key: 'parties', label: `PARTIES (${coverage.parties.length})` },
            { key: 'countries', label: `COUNTRIES (${coverage.countries.length})` },
          ] as const).map((option) => (
            <button
              key={option.key}
              type="button"
              onClick={() => setView(option.key)}
              className={`brutalist-border px-3 py-2 transition-colors ${
                view === option.key ? 'bg-primary text-primary-foreground' : 'bg-card hover:bg-secondary'
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>

        <label className="relative block w-full lg:w-[320px]">
          <span className="sr-only">Search coverage ledger</span>
          <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            aria-label="Search coverage ledger"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={
              view === 'people'
                ? 'Search person, party, role, country'
                : view === 'parties'
                  ? 'Search party or country'
                  : 'Search country'
            }
            className="w-full brutalist-border bg-card pl-9 pr-3 py-2 text-xs font-mono placeholder:text-muted-foreground/70"
          />
        </label>
      </div>

      <div className="brutalist-border bg-card overflow-hidden">
        <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-border text-[10px] font-mono uppercase tracking-[0.2em] text-muted-foreground">
          <span>
            Showing {rangeStart}-{rangeEnd} of {filteredRows.length}
          </span>
          <span>
            {view === 'people'
              ? 'Direct record presence'
              : 'Aggregated share of members with each field'}
          </span>
        </div>

        <div className="overflow-x-auto">
          {view === 'people' ? (
            <table className="w-full text-xs font-mono min-w-[1180px]">
              <thead className="sticky top-0 bg-card z-10">
                <tr className="border-b border-border">
                  <th className="text-left p-3 font-bold">PERSON</th>
                  <th className="text-left p-3 font-bold">COUNTRY</th>
                  <th className="text-left p-3 font-bold">PARTY</th>
                  <th className="text-left p-3 font-bold">COVERAGE</th>
                  {COVERAGE_FIELDS.map((field) => (
                    <th key={field.key} className="text-center p-3 font-bold" title={field.label}>
                      {field.shortLabel}
                    </th>
                  ))}
                  <th className="text-left p-3 font-bold">MISSING</th>
                </tr>
              </thead>
              <tbody>
                {visibleRows.length > 0 ? (
                  visibleRows.map((row) => (
                    <tr key={row.id} className="border-b border-border/50 hover:bg-muted/50 align-top">
                      <td className="p-3">
                        <Link to={row.entityLink} className="font-bold hover:text-accent">
                          {row.name}
                        </Link>
                        <div className="text-[10px] text-muted-foreground mt-1">{row.role}</div>
                      </td>
                      <td className="p-3">
                        <Link to={row.countryLink} className="hover:text-accent">
                          {row.countryCode}
                        </Link>
                        <div className="text-[10px] text-muted-foreground mt-1">{row.countryName}</div>
                      </td>
                      <td className="p-3">
                        <Link to={row.partyLink} className="hover:text-accent">
                          {row.partyName}
                        </Link>
                        {row.partyAbbreviation ? (
                          <div className="text-[10px] text-muted-foreground mt-1">{row.partyAbbreviation}</div>
                        ) : null}
                      </td>
                      <td className="p-3">
                        <div className="font-bold">
                          {row.presentCount}/{coverage.summary.trackedFields}
                        </div>
                        <div className="text-[10px] text-muted-foreground mt-1">{row.completeness}% complete</div>
                      </td>
                      {COVERAGE_FIELDS.map((field) => {
                        const present = row.fieldStatus[field.key];
                        return (
                          <td
                            key={field.key}
                            className="p-3 text-center font-bold"
                            style={getAvailabilityHeatmapCellStyle(present ? 100 : 0, theme)}
                          >
                            {present ? 'YES' : '—'}
                          </td>
                        );
                      })}
                      <td className="p-3 text-[10px] text-muted-foreground">
                        {row.missingFields.length > 0 ? row.missingFields.join(' · ') : 'Fully covered'}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={COVERAGE_FIELDS.length + 5} className="p-6 text-center text-muted-foreground">
                      No people match the current coverage search.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          ) : (
            <table className="w-full text-xs font-mono min-w-[1160px]">
              <thead className="sticky top-0 bg-card z-10">
                <tr className="border-b border-border">
                  <th className="text-left p-3 font-bold">{view === 'parties' ? 'PARTY' : 'COUNTRY'}</th>
                  <th className="text-left p-3 font-bold">SCOPE</th>
                  <th className="text-left p-3 font-bold">MEMBERS</th>
                  <th className="text-left p-3 font-bold">COVERAGE</th>
                  {COVERAGE_FIELDS.map((field) => (
                    <th key={field.key} className="text-center p-3 font-bold" title={field.label}>
                      {field.shortLabel}
                    </th>
                  ))}
                  <th className="text-left p-3 font-bold">BIGGEST GAPS</th>
                </tr>
              </thead>
              <tbody>
                {visibleRows.length > 0 ? (
                  visibleRows.map((rawRow) => {
                    const row = rawRow as CoverageAggregateRow;
                    return (
                      <tr key={row.id} className="border-b border-border/50 hover:bg-muted/50 align-top">
                        <td className="p-3">
                          <Link to={row.entityLink} className="font-bold hover:text-accent">
                            {row.name}
                          </Link>
                        </td>
                        <td className="p-3 text-muted-foreground">{row.subtitle}</td>
                        <td className="p-3">
                          <div className="font-bold">{row.members}</div>
                          <div className="text-[10px] text-muted-foreground mt-1">{row.membersWithGaps} with gaps</div>
                        </td>
                        <td className="p-3">
                          <div className="font-bold">{row.completeness}%</div>
                          <div className="text-[10px] text-muted-foreground mt-1">
                            {row.fullyCoveredMembers} fully covered
                          </div>
                        </td>
                        {COVERAGE_FIELDS.map((field) => (
                          <td
                            key={field.key}
                            className="p-3 text-center font-bold"
                            style={getAvailabilityHeatmapCellStyle(row.fieldRates[field.key], theme)}
                          >
                            {row.fieldRates[field.key]}%
                          </td>
                        ))}
                        <td className="p-3 text-[10px] text-muted-foreground">
                          {row.biggestGaps.join(' · ')}
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={COVERAGE_FIELDS.length + 5} className="p-6 text-center text-muted-foreground">
                      No grouped coverage rows match the current search.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </div>

        <div className="flex items-center justify-between gap-3 px-4 py-3 border-t border-border bg-background/60">
          <div className="text-[10px] font-mono text-muted-foreground uppercase tracking-[0.18em]">
            Page {safePage + 1} of {pageCount}
          </div>
          <div className="flex gap-2 font-mono text-xs">
            <button
              type="button"
              onClick={() => setPage((current) => Math.max(0, current - 1))}
              disabled={safePage === 0}
              className="brutalist-border px-3 py-2 bg-card disabled:opacity-40 disabled:cursor-not-allowed hover:bg-secondary transition-colors"
            >
              PREV
            </button>
            <button
              type="button"
              onClick={() => setPage((current) => Math.min(pageCount - 1, current + 1))}
              disabled={safePage >= pageCount - 1}
              className="brutalist-border px-3 py-2 bg-card disabled:opacity-40 disabled:cursor-not-allowed hover:bg-secondary transition-colors"
            >
              NEXT
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
