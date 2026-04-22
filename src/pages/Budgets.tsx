import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import SiteHeader from '@/components/SiteHeader';
import SiteFooter from '@/components/SiteFooter';
import { useCountryStats } from '@/hooks/use-politicians';
import { EUROSTAT_GEO_NAMES, EUROSTAT_SUPPORTED_GEOS } from '@/lib/eurostat-geo';
import {
  buildBreakdownForYear,
  buildBudgetCountrySnapshots,
  buildBudgetFunctionCountrySnapshots,
  buildBudgetYearSummary,
  buildGlobalBudgetFunctionSummaries,
  buildGlobalBudgetMetricSummaries,
  buildShareTimeSeries,
  buildTotalsTimeSeries,
  buildYearOverYearChange,
  useAllCountryDemographics,
  useAllGovernmentExpenditure,
  useCofogFunctions,
  useCountryDemographics,
  useGovernmentExpenditure,
} from '@/hooks/use-government-expenditure';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

const DEFAULT_COUNTRY = 'DE';
type TrendMetricKey = 'total_million_eur' | 'amount_per_capita_eur' | 'pct_of_gdp';
type BudgetView = 'global' | 'country';
const BUDGET_COUNTRY_OPTIONS = EUROSTAT_SUPPORTED_GEOS.map((code) => ({
  code,
  name: EUROSTAT_GEO_NAMES[code],
}));

function formatEur(value: number | null, unit: 'million' | 'absolute' | 'percent' = 'million'): string {
  if (value === null || !Number.isFinite(value)) return '—';
  if (unit === 'percent') return `${value.toFixed(1)}%`;
  if (unit === 'absolute') {
    if (value >= 1_000_000_000) return `€${(value / 1_000_000_000).toFixed(1)}B`;
    if (value >= 1_000_000) return `€${(value / 1_000_000).toFixed(0)}M`;
    if (value >= 1_000) return `€${(value / 1_000).toFixed(0)}k`;
    return `€${value.toFixed(0)}`;
  }
  if (value >= 1_000_000) return `€${(value / 1_000_000).toFixed(2)}T`;
  if (value >= 1_000) return `€${(value / 1_000).toFixed(1)}B`;
  return `€${value.toFixed(0)}M`;
}

function formatSignedEur(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return '—';
  const prefix = value > 0 ? '+' : '';
  return `${prefix}${formatEur(value)}`;
}

function formatSignedPercent(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return '—';
  const prefix = value > 0 ? '+' : '';
  return `${prefix}${value.toFixed(1)}%`;
}

function formatTrendValue(value: number | null, metric: TrendMetricKey): string {
  if (metric === 'pct_of_gdp') return formatEur(value, 'percent');
  if (metric === 'amount_per_capita_eur') return formatEur(value, 'absolute');
  return formatEur(value);
}

function formatConfidenceInterval(
  low: number | null,
  high: number | null,
  unit: 'million' | 'absolute' | 'percent',
): string {
  if (low === null || high === null) return '—';
  return `${formatEur(low, unit)} to ${formatEur(high, unit)}`;
}

function formatMode(value: number | null, frequency: number, unit: 'million' | 'absolute' | 'percent'): string {
  if (value === null || frequency < 2) return 'No repeated value';
  return `${formatEur(value, unit)} ×${frequency}`;
}

function metricLabel(metric: TrendMetricKey): string {
  switch (metric) {
    case 'amount_per_capita_eur':
      return 'PER CAPITA';
    case 'pct_of_gdp':
      return '% OF GDP';
    default:
      return 'TOTAL SPEND';
  }
}

function metricNarrativeLabel(metric: TrendMetricKey): string {
  switch (metric) {
    case 'amount_per_capita_eur':
      return 'per capita';
    case 'pct_of_gdp':
      return '% of GDP';
    default:
      return 'total spend';
  }
}

const Budgets = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [trendMetric, setTrendMetric] = useState<TrendMetricKey>('total_million_eur');
  const viewParam = searchParams.get('view');
  const selectedView: BudgetView = viewParam === 'country'
    ? 'country'
    : viewParam === 'global'
      ? 'global'
      : searchParams.get('country')
        ? 'country'
        : 'global';
  const isGlobalView = selectedView === 'global';
  const selectedCountry = (searchParams.get('country') || DEFAULT_COUNTRY).toUpperCase();
  const yearParam = searchParams.get('year');

  const { data: expenditure = [], isLoading: expenditureLoading } = useGovernmentExpenditure(selectedCountry, {
    enabled: !isGlobalView,
  });
  const { data: demographics = [], isLoading: demographicsLoading } = useCountryDemographics(selectedCountry, {
    enabled: !isGlobalView,
  });
  const { data: allExpenditure = [], isLoading: allExpenditureLoading } = useAllGovernmentExpenditure({
    enabled: isGlobalView,
  });
  const { data: allDemographics = [], isLoading: allDemographicsLoading } = useAllCountryDemographics({
    enabled: isGlobalView,
  });
  const { data: cofogFunctions = [] } = useCofogFunctions();
  const { data: countryStats = [] } = useCountryStats();

  const colorByCofog = useMemo(() => {
    const map: Record<string, string> = {};
    for (const f of cofogFunctions) map[f.code] = f.color || 'hsl(220, 20%, 50%)';
    return map;
  }, [cofogFunctions]);

  const totalsSeries = useMemo(
    () => buildTotalsTimeSeries(expenditure, demographics),
    [demographics, expenditure],
  );

  const countryAvailableYears = useMemo(
    () => totalsSeries.map((entry) => entry.year).sort((a, b) => b - a),
    [totalsSeries],
  );

  const globalAvailableYears = useMemo(
    () => [...new Set(allExpenditure.map((entry) => entry.year))].sort((a, b) => b - a),
    [allExpenditure],
  );

  const globalCoverageByYear = useMemo(() => {
    const coverage = new Map<number, Set<string>>();
    for (const row of allExpenditure) {
      const countries = coverage.get(row.year) || new Set<string>();
      countries.add(row.country_code);
      coverage.set(row.year, countries);
    }
    return new Map<number, number>([...coverage.entries()].map(([year, countries]) => [year, countries.size]));
  }, [allExpenditure]);

  const preferredGlobalYear = useMemo(() => {
    if (globalAvailableYears.length === 0) return null;
    const maxCoverage = Math.max(...[...globalCoverageByYear.values(), 0]);
    const coverageThreshold = Math.max(2, Math.ceil(maxCoverage * 0.75));
    return globalAvailableYears.find((year) => (globalCoverageByYear.get(year) || 0) >= coverageThreshold)
      ?? globalAvailableYears[0];
  }, [globalAvailableYears, globalCoverageByYear]);

  const availableYears = isGlobalView ? globalAvailableYears : countryAvailableYears;

  const selectedYear = useMemo(() => {
    if (yearParam) {
      const parsed = parseInt(yearParam, 10);
      if (availableYears.includes(parsed)) return parsed;
    }
    if (isGlobalView) return preferredGlobalYear;
    return availableYears[0] ?? null;
  }, [yearParam, availableYears, isGlobalView, preferredGlobalYear]);

  const breakdown = useMemo(() => {
    if (!selectedYear) return [];
    return buildBreakdownForYear(expenditure, demographics, selectedYear)
      .filter((entry) => entry.cofog_code !== 'GFTOT')
      .sort((a, b) => (b.amount_million_eur ?? 0) - (a.amount_million_eur ?? 0));
  }, [demographics, expenditure, selectedYear]);

  const summary = useMemo(() => {
    if (!selectedYear) return null;
    return buildBudgetYearSummary(expenditure, demographics, selectedYear);
  }, [demographics, expenditure, selectedYear]);

  const shareSeries = useMemo(() => {
    return buildShareTimeSeries(expenditure).slice(-20);
  }, [expenditure]);

  const yearOverYearChange = useMemo(() => {
    if (!selectedYear) return [];
    return buildYearOverYearChange(expenditure, selectedYear)
      .filter((entry) => entry.delta_million_eur !== null)
      .sort((a, b) => Math.abs(b.delta_million_eur || 0) - Math.abs(a.delta_million_eur || 0));
  }, [expenditure, selectedYear]);

  const topShareFunctions = useMemo(
    () => breakdown.slice(0, 5).map((entry) => entry.cofog_code),
    [breakdown],
  );

  const trendSeries = useMemo(() => totalsSeries.slice(-20), [totalsSeries]);

  const countryOptions = useMemo(() => {
    const namesByCode = new Map<string, string>(BUDGET_COUNTRY_OPTIONS.map((country) => [country.code, country.name]));
    for (const country of countryStats) {
      if (!namesByCode.has(country.code)) namesByCode.set(country.code, country.name);
    }
    if (!namesByCode.has(selectedCountry)) namesByCode.set(selectedCountry, selectedCountry);
    return [...namesByCode.entries()]
      .map(([code, name]) => ({ code, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [countryStats, selectedCountry]);

  const countryNameByCode = useMemo(
    () => new Map(countryOptions.map((country) => [country.code, country.name])),
    [countryOptions],
  );

  const selectedCountryName = useMemo(
    () => countryOptions.find((country) => country.code === selectedCountry)?.name || selectedCountry,
    [countryOptions, selectedCountry],
  );

  const updateSearchParams = (patch: Record<string, string | null>) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      for (const [key, value] of Object.entries(patch)) {
        if (value === null) next.delete(key);
        else next.set(key, value);
      }
      return next;
    }, { replace: true });
  };

  const globalCountrySnapshots = useMemo(() => {
    if (!selectedYear) return [];
    return buildBudgetCountrySnapshots(allExpenditure, allDemographics, selectedYear);
  }, [allDemographics, allExpenditure, selectedYear]);

  const globalMetricSummaries = useMemo(
    () => buildGlobalBudgetMetricSummaries(globalCountrySnapshots),
    [globalCountrySnapshots],
  );

  const globalFunctionSummaries = useMemo(() => {
    if (!selectedYear) return [];
    return buildGlobalBudgetFunctionSummaries(
      buildBudgetFunctionCountrySnapshots(allExpenditure, allDemographics, selectedYear),
    );
  }, [allDemographics, allExpenditure, selectedYear]);

  const selectedGlobalMetricSummary = useMemo(
    () => globalMetricSummaries.find((metric) => metric.key === trendMetric) || null,
    [globalMetricSummaries, trendMetric],
  );

  const globalRankingSeries = useMemo(() => {
    return globalCountrySnapshots
      .map((snapshot) => ({
        country_code: snapshot.country_code,
        country_name: countryNameByCode.get(snapshot.country_code) || snapshot.country_code,
        value: snapshot[trendMetric],
        top_function_label: snapshot.top_function_label,
        top_function_share_pct: snapshot.top_function_share_pct,
        is_provisional: snapshot.is_provisional,
      }))
      .filter((row): row is {
        country_code: string;
        country_name: string;
        value: number;
        top_function_label: string | null;
        top_function_share_pct: number | null;
        is_provisional: boolean;
      } => row.value !== null && Number.isFinite(row.value))
      .sort((left, right) => right.value - left.value);
  }, [countryNameByCode, globalCountrySnapshots, trendMetric]);

  const meanShareFunctionSeries = useMemo(() => {
    return [...globalFunctionSummaries]
      .filter((row) => row.share_stats.mean !== null)
      .sort((left, right) => (right.share_stats.mean || 0) - (left.share_stats.mean || 0))
      .map((row) => ({
        cofog_code: row.cofog_code,
        cofog_label: row.cofog_label,
        mean_share_pct: row.share_stats.mean,
      }));
  }, [globalFunctionSummaries]);

  const globalOverview = useMemo(() => {
    if (globalCountrySnapshots.length === 0) return null;
    const totalSpend = globalCountrySnapshots.reduce((sum, row) => sum + (row.total_million_eur || 0), 0);
    const provisionalCount = globalCountrySnapshots.filter((row) => row.is_provisional).length;
    const totalMetric = globalMetricSummaries.find((metric) => metric.key === 'total_million_eur') || null;
    const gdpMetric = globalMetricSummaries.find((metric) => metric.key === 'pct_of_gdp') || null;
    const leaderFunction = meanShareFunctionSeries[0] || null;
    const leaderFunctionSummary = leaderFunction
      ? globalFunctionSummaries.find((row) => row.cofog_code === leaderFunction.cofog_code) || null
      : null;

    return {
      country_count: globalCountrySnapshots.length,
      total_spend_million_eur: totalSpend,
      provisional_count: provisionalCount,
      median_total_million_eur: totalMetric?.stats.median ?? null,
      mean_pct_of_gdp: gdpMetric?.stats.mean ?? null,
      leader_function_label: leaderFunctionSummary?.cofog_label ?? null,
      leader_function_mean_share_pct: leaderFunctionSummary?.share_stats.mean ?? null,
    };
  }, [globalCountrySnapshots, globalFunctionSummaries, globalMetricSummaries, meanShareFunctionSeries]);

  const storyLines = useMemo(() => {
    if (!summary) return [];
    const lines: string[] = [];

    const first = `${selectedCountryName} spent ${formatEur(summary.total_million_eur)} in ${summary.year}`;
    const firstSuffix = [
      summary.pct_of_gdp !== null ? `${summary.pct_of_gdp.toFixed(1)}% of GDP` : null,
      summary.amount_per_capita_eur !== null ? `${formatEur(summary.amount_per_capita_eur, 'absolute')} per resident` : null,
    ].filter(Boolean).join(', ');
    lines.push(firstSuffix ? `${first}, equal to ${firstSuffix}.` : `${first}.`);

    if (summary.previous_year && summary.delta_million_eur !== null) {
      const deltaDirection = summary.delta_million_eur >= 0 ? 'up' : 'down';
      const deltaPct = summary.delta_pct !== null ? ` (${formatSignedPercent(summary.delta_pct)})` : '';
      const gdpShift = summary.delta_pct_of_gdp !== null
        ? ` and ${formatSignedPercent(summary.delta_pct_of_gdp)} of GDP`
        : '';
      lines.push(
        `That is ${deltaDirection} ${formatSignedEur(summary.delta_million_eur)}${deltaPct} from ${summary.previous_year}${gdpShift}.`,
      );
    }

    if (summary.top_function_label && summary.top_function_share_pct !== null) {
      lines.push(
        `${summary.top_function_label} remained the largest function at ${summary.top_function_share_pct.toFixed(1)}% of the total budget.`,
      );
    }

    if (summary.largest_increase_label || summary.largest_decrease_label) {
      const parts = [
        summary.largest_increase_label && summary.largest_increase_million_eur !== null
          ? `${summary.largest_increase_label} rose the most (${formatSignedEur(summary.largest_increase_million_eur)})`
          : null,
        summary.largest_decrease_label && summary.largest_decrease_million_eur !== null
          ? `${summary.largest_decrease_label} fell the most (${formatSignedEur(summary.largest_decrease_million_eur)})`
          : null,
      ].filter(Boolean);
      if (parts.length > 0) lines.push(parts.join('; ') + '.');
    }

    return lines;
  }, [selectedCountryName, summary]);

  const globalStoryLines = useMemo(() => {
    if (!selectedYear || !globalOverview) return [];

    const lines: string[] = [];
    lines.push(
      `${globalOverview.country_count} countries report ${formatEur(globalOverview.total_spend_million_eur)} of recorded expenditure in ${selectedYear}.`,
    );

    const totalMetric = globalMetricSummaries.find((metric) => metric.key === 'total_million_eur') || null;
    if (totalMetric?.stats.median !== null && totalMetric.stats.mean !== null) {
      lines.push(
        `The median country budget is ${formatEur(totalMetric.stats.median)}, while the cross-country mean is ${formatEur(totalMetric.stats.mean)}.`,
      );
    }

    const gdpMetric = globalMetricSummaries.find((metric) => metric.key === 'pct_of_gdp') || null;
    if (gdpMetric?.highest_country_code && gdpMetric.highest_value !== null && gdpMetric.stats.mean !== null) {
      lines.push(
        `Budget intensity averages ${formatEur(gdpMetric.stats.mean, 'percent')} of GDP, with ${countryNameByCode.get(gdpMetric.highest_country_code) || gdpMetric.highest_country_code} highest at ${formatEur(gdpMetric.highest_value, 'percent')}.`,
      );
    }

    if (globalOverview.leader_function_label && globalOverview.leader_function_mean_share_pct !== null) {
      lines.push(
        `${globalOverview.leader_function_label} is the largest function on average, taking ${globalOverview.leader_function_mean_share_pct.toFixed(1)}% of national spending.`,
      );
    }

    if (globalOverview.provisional_count > 0) {
      lines.push(
        `${globalOverview.provisional_count} ${globalOverview.provisional_count === 1 ? 'country has' : 'countries have'} provisional data in the selected year, so the upper tail can still move.`,
      );
    }

    return lines;
  }, [countryNameByCode, globalMetricSummaries, globalOverview, selectedYear]);

  const isLoading = isGlobalView
    ? allExpenditureLoading || allDemographicsLoading
    : expenditureLoading || demographicsLoading;

  return (
    <div className="min-h-screen flex flex-col">
      <SiteHeader />
      <main className="container flex-1 py-8">
        <div className="brutalist-border-b pb-2 mb-6">
          <h1 className="text-lg font-extrabold tracking-tight">PUBLIC BUDGET ATLAS</h1>
          <p className="text-xs font-mono text-muted-foreground mt-1">
            Eurostat COFOG (<a className="underline" href="https://ec.europa.eu/eurostat/databrowser/view/gov_10a_exp/default/table" target="_blank" rel="noopener noreferrer">gov_10a_exp</a>) actuals by function. Global mode reports cross-country distributions for the selected year; country mode stays focused on one state’s long-run budget structure.
          </p>
        </div>

        <div className="flex flex-wrap gap-3 mb-6 items-end">
          <div>
            <label className="font-mono text-[10px] text-muted-foreground block mb-1">VIEW</label>
            <div className="flex gap-2">
              {(['global', 'country'] as BudgetView[]).map((view) => (
                <button
                  key={view}
                  type="button"
                  onClick={() => updateSearchParams({ view })}
                  className={`brutalist-border px-3 py-2 text-sm font-mono ${
                    selectedView === view ? 'bg-primary text-primary-foreground' : 'bg-card'
                  }`}
                >
                  {view === 'global' ? 'GLOBAL' : 'COUNTRY'}
                </button>
              ))}
            </div>
          </div>

          {!isGlobalView && (
            <div>
              <label className="font-mono text-[10px] text-muted-foreground block mb-1">COUNTRY</label>
              <select
                value={selectedCountry}
                onChange={(e) => updateSearchParams({ country: e.target.value.toUpperCase(), view: 'country' })}
                className="brutalist-border px-3 py-2 text-sm font-mono bg-card"
              >
                {countryOptions.map((country) => (
                  <option key={country.code} value={country.code}>{country.code} — {country.name}</option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label className="font-mono text-[10px] text-muted-foreground block mb-1">YEAR</label>
            <select
              value={selectedYear ?? ''}
              onChange={(e) => updateSearchParams({ year: e.target.value })}
              className="brutalist-border px-3 py-2 text-sm font-mono bg-card"
              disabled={availableYears.length === 0}
            >
              {availableYears.map((year) => (
                <option key={year} value={year}>{year}</option>
              ))}
            </select>
          </div>
        </div>

        {isLoading && (
          <div className="brutalist-border p-6 font-mono text-sm text-muted-foreground">
            Loading budget data…
          </div>
        )}

        {!isLoading && isGlobalView && globalCountrySnapshots.length === 0 && (
          <div className="brutalist-border p-6 font-mono text-sm text-muted-foreground">
            No cross-country budget data is available for the selected year.
          </div>
        )}

        {!isLoading && isGlobalView && globalOverview && (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3 mb-6">
              <div className="brutalist-border p-3 bg-secondary/40">
                <div className="font-mono text-[10px] text-muted-foreground">COUNTRIES · {selectedYear}</div>
                <div className="font-mono text-sm font-bold">{globalOverview.country_count}</div>
              </div>
              <div className="brutalist-border p-3 bg-secondary/40">
                <div className="font-mono text-[10px] text-muted-foreground">COMBINED SPEND</div>
                <div className="font-mono text-sm font-bold">{formatEur(globalOverview.total_spend_million_eur)}</div>
              </div>
              <div className="brutalist-border p-3 bg-secondary/40">
                <div className="font-mono text-[10px] text-muted-foreground">MEDIAN COUNTRY BUDGET</div>
                <div className="font-mono text-sm font-bold">{formatEur(globalOverview.median_total_million_eur)}</div>
              </div>
              <div className="brutalist-border p-3 bg-secondary/40">
                <div className="font-mono text-[10px] text-muted-foreground">PROVISIONAL COUNTRIES</div>
                <div className="font-mono text-sm font-bold">{globalOverview.provisional_count}</div>
              </div>
            </div>

            <section className="brutalist-border p-4 mb-6 bg-card">
              <div className="flex items-center justify-between gap-3 mb-3">
                <h2 className="font-mono text-xs font-bold text-muted-foreground">GLOBAL READOUT</h2>
                <span className="font-mono text-[10px] px-2 py-1 brutalist-border bg-secondary/40">
                  {selectedYear}
                </span>
              </div>
              <div className="space-y-2 text-sm leading-relaxed">
                {globalStoryLines.map((line) => (
                  <p key={line}>{line}</p>
                ))}
              </div>
            </section>

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 mb-6">
              <div className="brutalist-border p-4">
                <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
                  <div>
                    <h2 className="font-mono text-xs font-bold text-muted-foreground">
                      COUNTRY RANKING · {metricLabel(trendMetric)} · {selectedYear}
                    </h2>
                    {selectedGlobalMetricSummary && (
                      <p className="font-mono text-[10px] text-muted-foreground mt-1">
                        mean {formatTrendValue(selectedGlobalMetricSummary.stats.mean, trendMetric)} · median{' '}
                        {formatTrendValue(selectedGlobalMetricSummary.stats.median, trendMetric)}
                      </p>
                    )}
                  </div>
                  <div className="flex gap-2">
                    {(['total_million_eur', 'amount_per_capita_eur', 'pct_of_gdp'] as TrendMetricKey[]).map((metric) => (
                      <button
                        key={metric}
                        type="button"
                        onClick={() => setTrendMetric(metric)}
                        className={`brutalist-border px-2 py-1 font-mono text-[10px] ${
                          trendMetric === metric ? 'bg-primary text-primary-foreground' : 'bg-card'
                        }`}
                      >
                        {metricLabel(metric)}
                      </button>
                    ))}
                  </div>
                </div>
                <ResponsiveContainer width="100%" height={Math.max(360, globalRankingSeries.length * 26)}>
                  <BarChart data={globalRankingSeries} layout="vertical" margin={{ left: 20, right: 10 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(220, 15%, 85%)" />
                    <XAxis
                      type="number"
                      tickFormatter={(value) => formatTrendValue(value, trendMetric)}
                      tick={{ fontSize: 10, fontFamily: 'JetBrains Mono' }}
                    />
                    <YAxis
                      type="category"
                      dataKey="country_name"
                      width={120}
                      tick={{ fontSize: 10, fontFamily: 'JetBrains Mono' }}
                    />
                    <Tooltip
                      content={({ active, payload }) => {
                        if (!active || !payload?.[0]) return null;
                        const row = payload[0].payload as (typeof globalRankingSeries)[number];
                        return (
                          <div className="brutalist-border bg-card p-2 font-mono text-xs">
                            <div className="font-bold">{row.country_name}</div>
                            <div>{metricNarrativeLabel(trendMetric)}: {formatTrendValue(row.value, trendMetric)}</div>
                            {row.top_function_label && row.top_function_share_pct !== null && (
                              <div>largest function: {row.top_function_label} ({row.top_function_share_pct.toFixed(1)}%)</div>
                            )}
                            {row.is_provisional && <div>status: provisional</div>}
                          </div>
                        );
                      }}
                    />
                    <Bar dataKey="value">
                      {globalRankingSeries.map((row) => (
                        <Cell
                          key={row.country_code}
                          fill={row.is_provisional ? 'hsl(42, 96%, 50%)' : 'hsl(215, 65%, 45%)'}
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>

              <div className="brutalist-border p-4">
                <h2 className="font-mono text-xs font-bold mb-3 text-muted-foreground">
                  AVERAGE FUNCTION MIX · SHARE OF NATIONAL BUDGET
                </h2>
                <ResponsiveContainer width="100%" height={Math.max(320, meanShareFunctionSeries.length * 28)}>
                  <BarChart data={meanShareFunctionSeries} layout="vertical" margin={{ left: 20, right: 10 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(220, 15%, 85%)" />
                    <XAxis
                      type="number"
                      tickFormatter={(value) => `${value.toFixed(1)}%`}
                      tick={{ fontSize: 10, fontFamily: 'JetBrains Mono' }}
                    />
                    <YAxis
                      type="category"
                      dataKey="cofog_label"
                      width={140}
                      tick={{ fontSize: 10, fontFamily: 'JetBrains Mono' }}
                    />
                    <Tooltip
                      formatter={(value: number | null) => value === null ? '—' : `${value.toFixed(1)}%`}
                      labelFormatter={(label) => `${label}`}
                    />
                    <Bar dataKey="mean_share_pct">
                      {meanShareFunctionSeries.map((row) => (
                        <Cell key={row.cofog_code} fill={colorByCofog[row.cofog_code] || 'hsl(220, 20%, 50%)'} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <section className="mb-6">
              <div className="flex flex-wrap items-end justify-between gap-3 mb-3">
                <div>
                  <h2 className="font-mono text-xs font-bold text-muted-foreground">GLOBAL DISTRIBUTION STATISTICS</h2>
                  <p className="font-mono text-[10px] text-muted-foreground mt-1">
                    Mode is only shown when a value repeats exactly at source precision. Confidence intervals are 95% normal approximations for the mean across reporting countries.
                  </p>
                </div>
              </div>
              <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
                {globalMetricSummaries.map((metric) => (
                  <section key={metric.key} className="brutalist-border p-4 bg-card">
                    <div className="flex items-center justify-between gap-3 mb-4">
                      <h3 className="font-mono text-xs font-bold text-muted-foreground">{metric.label}</h3>
                      <span className="font-mono text-[10px] px-2 py-1 brutalist-border bg-secondary/40">
                        n={metric.stats.sample_size}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-3 font-mono text-xs">
                      <div>
                        <div className="text-[10px] text-muted-foreground">MEAN</div>
                        <div className="font-bold">{formatEur(metric.stats.mean, metric.unit)}</div>
                      </div>
                      <div>
                        <div className="text-[10px] text-muted-foreground">MEDIAN</div>
                        <div className="font-bold">{formatEur(metric.stats.median, metric.unit)}</div>
                      </div>
                      <div>
                        <div className="text-[10px] text-muted-foreground">MODE</div>
                        <div className="font-bold break-words">{formatMode(metric.stats.mode, metric.stats.mode_frequency, metric.unit)}</div>
                      </div>
                      <div>
                        <div className="text-[10px] text-muted-foreground">STD DEV</div>
                        <div className="font-bold">{formatEur(metric.stats.standard_deviation, metric.unit)}</div>
                      </div>
                      <div>
                        <div className="text-[10px] text-muted-foreground">95% CI</div>
                        <div className="font-bold break-words">
                          {formatConfidenceInterval(metric.stats.ci95_low, metric.stats.ci95_high, metric.unit)}
                        </div>
                      </div>
                      <div>
                        <div className="text-[10px] text-muted-foreground">IQR</div>
                        <div className="font-bold">{formatEur(metric.stats.iqr, metric.unit)}</div>
                      </div>
                    </div>
                    <div className="grid grid-cols-1 gap-2 mt-4 font-mono text-xs">
                      <div className="brutalist-border p-2 bg-secondary/30">
                        <div className="text-[10px] text-muted-foreground">LOW</div>
                        <div className="font-bold">
                          {(metric.lowest_country_code && countryNameByCode.get(metric.lowest_country_code)) || metric.lowest_country_code || '—'}
                        </div>
                        <div>{formatEur(metric.lowest_value, metric.unit)}</div>
                      </div>
                      <div className="brutalist-border p-2 bg-secondary/30">
                        <div className="text-[10px] text-muted-foreground">HIGH</div>
                        <div className="font-bold">
                          {(metric.highest_country_code && countryNameByCode.get(metric.highest_country_code)) || metric.highest_country_code || '—'}
                        </div>
                        <div>{formatEur(metric.highest_value, metric.unit)}</div>
                      </div>
                    </div>
                  </section>
                ))}
              </div>
            </section>

            <section className="brutalist-border p-4 bg-card">
              <div className="flex flex-wrap items-end justify-between gap-3 mb-3">
                <div>
                  <h2 className="font-mono text-xs font-bold text-muted-foreground">FUNCTION STATISTICS · {selectedYear}</h2>
                  <p className="font-mono text-[10px] text-muted-foreground mt-1">
                    Each row is a cross-country distribution over the per-function budget metrics already stored for each national budget.
                  </p>
                </div>
                <span className="font-mono text-[10px] px-2 py-1 brutalist-border bg-secondary/40">
                  {globalFunctionSummaries.length} functions
                </span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[1180px] border-collapse">
                  <thead>
                    <tr className="font-mono text-[10px] text-muted-foreground border-b">
                      <th className="text-left py-2 pr-4">FUNCTION</th>
                      <th className="text-left py-2 pr-4">COUNTRIES</th>
                      <th className="text-left py-2 pr-4">COMBINED TOTAL</th>
                      <th className="text-left py-2 pr-4">AVG AMOUNT</th>
                      <th className="text-left py-2 pr-4">MEDIAN AMOUNT</th>
                      <th className="text-left py-2 pr-4">AVG SHARE</th>
                      <th className="text-left py-2 pr-4">MEDIAN SHARE</th>
                      <th className="text-left py-2 pr-4">95% SHARE CI</th>
                      <th className="text-left py-2 pr-4">AVG % GDP</th>
                      <th className="text-left py-2 pr-4">MEDIAN PER CAPITA</th>
                      <th className="text-left py-2">LARGEST COUNTRY</th>
                    </tr>
                  </thead>
                  <tbody className="font-mono text-xs">
                    {globalFunctionSummaries.map((row) => (
                      <tr key={row.cofog_code} className="border-b align-top">
                        <td className="py-3 pr-4">
                          <div className="font-bold">{row.cofog_label}</div>
                          <div className="text-[10px] text-muted-foreground">{row.cofog_code}</div>
                        </td>
                        <td className="py-3 pr-4">{row.country_count}</td>
                        <td className="py-3 pr-4">{formatEur(row.total_amount_million_eur)}</td>
                        <td className="py-3 pr-4">{formatEur(row.amount_stats.mean)}</td>
                        <td className="py-3 pr-4">{formatEur(row.amount_stats.median)}</td>
                        <td className="py-3 pr-4">{formatEur(row.share_stats.mean, 'percent')}</td>
                        <td className="py-3 pr-4">{formatEur(row.share_stats.median, 'percent')}</td>
                        <td className="py-3 pr-4 break-words">
                          {formatConfidenceInterval(row.share_stats.ci95_low, row.share_stats.ci95_high, 'percent')}
                        </td>
                        <td className="py-3 pr-4">{formatEur(row.pct_of_gdp_stats.mean, 'percent')}</td>
                        <td className="py-3 pr-4">{formatEur(row.per_capita_stats.median, 'absolute')}</td>
                        <td className="py-3">
                          <div className="font-bold">
                            {(row.highest_amount_country_code && countryNameByCode.get(row.highest_amount_country_code)) || row.highest_amount_country_code || '—'}
                          </div>
                          <div>{formatEur(row.highest_amount_million_eur)}</div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        )}

        {!isLoading && !isGlobalView && expenditure.length === 0 && (
          <div className="brutalist-border p-6 font-mono text-sm text-muted-foreground">
            No budget data for {selectedCountry}. Try another country.
          </div>
        )}

        {!isLoading && !isGlobalView && expenditure.length > 0 && summary && (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3 mb-6">
              <div className="brutalist-border p-3 bg-secondary/40">
                <div className="font-mono text-[10px] text-muted-foreground">TOTAL · {summary.year}</div>
                <div className="font-mono text-sm font-bold">{formatEur(summary.total_million_eur)}</div>
              </div>
              <div className="brutalist-border p-3 bg-secondary/40">
                <div className="font-mono text-[10px] text-muted-foreground">VS {summary.previous_year ?? 'PREV'}</div>
                <div className="font-mono text-sm font-bold">{formatSignedEur(summary.delta_million_eur)}</div>
              </div>
              <div className="brutalist-border p-3 bg-secondary/40">
                <div className="font-mono text-[10px] text-muted-foreground">PER CAPITA</div>
                <div className="font-mono text-sm font-bold">{formatEur(summary.amount_per_capita_eur, 'absolute')}</div>
              </div>
              <div className="brutalist-border p-3 bg-secondary/40">
                <div className="font-mono text-[10px] text-muted-foreground">% OF GDP</div>
                <div className="font-mono text-sm font-bold">{formatEur(summary.pct_of_gdp, 'percent')}</div>
              </div>
            </div>

            <section className="brutalist-border p-4 mb-6 bg-card">
              <div className="flex items-center justify-between gap-3 mb-3">
                <h2 className="font-mono text-xs font-bold text-muted-foreground">READING THE BUDGET</h2>
                {summary.is_provisional && (
                  <span className="font-mono text-[10px] px-2 py-1 brutalist-border bg-warning/10">
                    PROVISIONAL YEAR
                  </span>
                )}
              </div>
              <div className="space-y-2 text-sm leading-relaxed">
                {storyLines.map((line) => (
                  <p key={line}>{line}</p>
                ))}
              </div>
            </section>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="brutalist-border p-4">
                <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
                  <h2 className="font-mono text-xs font-bold text-muted-foreground">
                    TOTAL TRAJECTORY · LAST 20 YEARS
                  </h2>
                  <div className="flex gap-2">
                    {(['total_million_eur', 'amount_per_capita_eur', 'pct_of_gdp'] as TrendMetricKey[]).map((metric) => (
                      <button
                        key={metric}
                        type="button"
                        onClick={() => setTrendMetric(metric)}
                        className={`brutalist-border px-2 py-1 font-mono text-[10px] ${
                          trendMetric === metric ? 'bg-primary text-primary-foreground' : 'bg-card'
                        }`}
                      >
                        {metricLabel(metric)}
                      </button>
                    ))}
                  </div>
                </div>
                <ResponsiveContainer width="100%" height={320}>
                  <LineChart data={trendSeries}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(220, 15%, 85%)" />
                    <XAxis dataKey="year" tick={{ fontSize: 10, fontFamily: 'JetBrains Mono' }} />
                    <YAxis
                      tickFormatter={(value: number) => formatTrendValue(value, trendMetric)}
                      tick={{ fontSize: 10, fontFamily: 'JetBrains Mono' }}
                    />
                    <Tooltip
                      formatter={(value: number | null) => formatTrendValue(value, trendMetric)}
                      labelFormatter={(label) => `Year ${label}`}
                    />
                    <Line
                      type="monotone"
                      dataKey={trendMetric}
                      stroke="hsl(215, 65%, 45%)"
                      strokeWidth={3}
                      dot={{ r: 2 }}
                      activeDot={{ r: 4 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>

              <div className="brutalist-border p-4">
                <h2 className="font-mono text-xs font-bold mb-3 text-muted-foreground">
                  BUDGET BY FUNCTION · {selectedYear}
                </h2>
                <ResponsiveContainer width="100%" height={320}>
                  <BarChart data={breakdown} layout="vertical" margin={{ left: 20, right: 10 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(220, 15%, 85%)" />
                    <XAxis type="number" tickFormatter={(value) => formatEur(value)} tick={{ fontSize: 10, fontFamily: 'JetBrains Mono' }} />
                    <YAxis type="category" dataKey="cofog_label" width={140} tick={{ fontSize: 10, fontFamily: 'JetBrains Mono' }} />
                    <Tooltip
                      content={({ active, payload }) => {
                        if (!active || !payload?.[0]) return null;
                        const row = payload[0].payload as (typeof breakdown)[number];
                        return (
                          <div className="brutalist-border bg-card p-2 font-mono text-xs">
                            <div className="font-bold">{row.cofog_label}</div>
                            <div>amount: {formatEur(row.amount_million_eur)}</div>
                            <div>% of GDP: {formatEur(row.pct_of_gdp, 'percent')}</div>
                            <div>% of total: {formatEur(row.pct_of_total_expenditure, 'percent')}</div>
                            {row.amount_per_capita_eur !== null && (
                              <div>per capita: {formatEur(row.amount_per_capita_eur, 'absolute')}</div>
                            )}
                          </div>
                        );
                      }}
                    />
                    <Bar dataKey="amount_million_eur">
                      {breakdown.map((row) => (
                        <Cell key={row.cofog_code} fill={colorByCofog[row.cofog_code] || 'hsl(220, 20%, 50%)'} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>

              <div className="brutalist-border p-4">
                <h2 className="font-mono text-xs font-bold mb-3 text-muted-foreground">
                  FUNCTION MIX OVER TIME · SHARE OF TOTAL
                </h2>
                <ResponsiveContainer width="100%" height={320}>
                  <AreaChart data={shareSeries}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(220, 15%, 85%)" />
                    <XAxis dataKey="year" tick={{ fontSize: 10, fontFamily: 'JetBrains Mono' }} />
                    <YAxis domain={[0, 100]} tickFormatter={(value) => `${value.toFixed(0)}%`} tick={{ fontSize: 10, fontFamily: 'JetBrains Mono' }} />
                    <Tooltip
                      formatter={(value: number, name: string) => {
                        const label = cofogFunctions.find((row) => row.code === name)?.label || name;
                        return [`${value.toFixed(1)}%`, label];
                      }}
                    />
                    {topShareFunctions.map((code) => (
                      <Area
                        key={code}
                        type="monotone"
                        dataKey={code}
                        stackId="1"
                        stroke={colorByCofog[code] || 'hsl(220, 20%, 50%)'}
                        fill={colorByCofog[code] || 'hsl(220, 20%, 50%)'}
                        fillOpacity={0.75}
                      />
                    ))}
                  </AreaChart>
                </ResponsiveContainer>
              </div>

              <div className="brutalist-border p-4">
                <h2 className="font-mono text-xs font-bold mb-3 text-muted-foreground">
                  YEAR-OVER-YEAR CHANGE · {selectedYear}
                </h2>
                {summary.previous_year === null ? (
                  <div className="font-mono text-xs text-muted-foreground p-4">
                    No earlier year is available for a year-over-year comparison.
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height={320}>
                    <BarChart data={yearOverYearChange} layout="vertical" margin={{ left: 20, right: 10 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(220, 15%, 85%)" />
                      <XAxis type="number" tickFormatter={(value) => formatSignedEur(value)} tick={{ fontSize: 10, fontFamily: 'JetBrains Mono' }} />
                      <YAxis type="category" dataKey="cofog_label" width={140} tick={{ fontSize: 10, fontFamily: 'JetBrains Mono' }} />
                      <Tooltip
                        content={({ active, payload }) => {
                          if (!active || !payload?.[0]) return null;
                          const row = payload[0].payload as (typeof yearOverYearChange)[number];
                          return (
                            <div className="brutalist-border bg-card p-2 font-mono text-xs">
                              <div className="font-bold">{row.cofog_label}</div>
                              <div>change: {formatSignedEur(row.delta_million_eur)}</div>
                              <div>
                                share shift: {row.delta_share_pct_points !== null ? formatSignedPercent(row.delta_share_pct_points) : '—'}
                              </div>
                              <div>{summary.previous_year}: {formatEur(row.previous_amount_million_eur)}</div>
                              <div>{summary.year}: {formatEur(row.current_amount_million_eur)}</div>
                            </div>
                          );
                        }}
                      />
                      <Bar dataKey="delta_million_eur">
                        {yearOverYearChange.map((row) => (
                          <Cell
                            key={row.cofog_code}
                            fill={(row.delta_million_eur || 0) >= 0 ? 'hsl(145, 65%, 38%)' : 'hsl(0, 70%, 50%)'}
                          />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>
          </>
        )}

        <div className="mt-8 brutalist-border-t pt-4 font-mono text-[10px] text-muted-foreground space-y-1">
          <div>Source: Eurostat <code>gov_10a_exp</code> (CC-BY 4.0)</div>
          <div>
            Eurostat publishes actual expenditure, not proposed budgets. Pre-vote budget documents still live in national
            ministry-of-finance PDFs and are outside this pipeline.
          </div>
          <div>Latest data usually arrives with a lag; the newest year can be provisional.</div>
          <div>Global confidence intervals on this page describe the mean across reporting countries for the selected year, not forecast uncertainty.</div>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
};

export default Budgets;
