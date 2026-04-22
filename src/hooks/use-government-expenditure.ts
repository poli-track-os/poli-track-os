import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Tables } from '@/integrations/supabase/types';

export type GovernmentExpenditureRow = Tables<'government_expenditure'>;
export type CofogFunction = Tables<'cofog_functions'>;
export type CountryDemographicsRow = Tables<'country_demographics'>;
const GOVERNMENT_EXPENDITURE_PAGE_SIZE = 1000;
const NORMAL_95_CI_Z_SCORE = 1.96;

export async function fetchAllGovernmentExpenditureRows() {
  const rows: GovernmentExpenditureRow[] = [];

  for (let from = 0; ; from += GOVERNMENT_EXPENDITURE_PAGE_SIZE) {
    const { data, error } = await supabase
      .from('government_expenditure')
      .select('*')
      .order('country_code', { ascending: true })
      .order('year', { ascending: true })
      .order('cofog_code', { ascending: true })
      .range(from, from + GOVERNMENT_EXPENDITURE_PAGE_SIZE - 1);
    if (error) throw error;

    const chunk = (data || []) as GovernmentExpenditureRow[];
    rows.push(...chunk);
    if (chunk.length < GOVERNMENT_EXPENDITURE_PAGE_SIZE) break;
  }

  return rows;
}

export async function fetchAllCountryDemographicsRows() {
  const rows: CountryDemographicsRow[] = [];

  for (let from = 0; ; from += GOVERNMENT_EXPENDITURE_PAGE_SIZE) {
    const { data, error } = await supabase
      .from('country_demographics')
      .select('*')
      .order('country_code', { ascending: true })
      .order('year', { ascending: true })
      .range(from, from + GOVERNMENT_EXPENDITURE_PAGE_SIZE - 1);
    if (error) throw error;

    const chunk = (data || []) as CountryDemographicsRow[];
    rows.push(...chunk);
    if (chunk.length < GOVERNMENT_EXPENDITURE_PAGE_SIZE) break;
  }

  return rows;
}

// All rows for a given country, ordered by year asc then cofog code asc.
export function useGovernmentExpenditure(
  countryCode: string | undefined,
  options?: { enabled?: boolean },
) {
  const normalized = countryCode?.toUpperCase();
  return useQuery({
    queryKey: ['government-expenditure', normalized],
    queryFn: async () => {
      if (!normalized) return [];
      const { data, error } = await supabase
        .from('government_expenditure')
        .select('*')
        .eq('country_code', normalized)
        .order('year', { ascending: true })
        .order('cofog_code', { ascending: true });
      if (error) throw error;
      return (data || []) as GovernmentExpenditureRow[];
    },
    enabled: Boolean(normalized) && options?.enabled !== false,
    staleTime: 1000 * 60 * 60,
  });
}

export function useAllGovernmentExpenditure(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: ['government-expenditure', 'all'],
    queryFn: fetchAllGovernmentExpenditureRows,
    enabled: options?.enabled !== false,
    staleTime: 1000 * 60 * 60,
  });
}

// COFOG reference table (labels, colors, icons, sort_order)
export function useCofogFunctions() {
  return useQuery({
    queryKey: ['cofog-functions'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('cofog_functions')
        .select('*')
        .order('sort_order', { ascending: true });
      if (error) throw error;
      return (data || []) as CofogFunction[];
    },
    staleTime: 1000 * 60 * 60 * 24,
  });
}

// Country demographics for year × country, covering the Eurostat years we
// have ingested for the supported geographies.
export function useCountryDemographics(
  countryCode: string | undefined,
  options?: { enabled?: boolean },
) {
  const normalized = countryCode?.toUpperCase();
  return useQuery({
    queryKey: ['country-demographics', normalized],
    queryFn: async () => {
      if (!normalized) return [];
      const { data, error } = await supabase
        .from('country_demographics')
        .select('*')
        .eq('country_code', normalized)
        .order('year', { ascending: true });
      if (error) throw error;
      return (data || []) as CountryDemographicsRow[];
    },
    enabled: Boolean(normalized) && options?.enabled !== false,
    staleTime: 1000 * 60 * 60,
  });
}

export function useAllCountryDemographics(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: ['country-demographics', 'all'],
    queryFn: fetchAllCountryDemographicsRows,
    enabled: options?.enabled !== false,
    staleTime: 1000 * 60 * 60,
  });
}

// Cross-country "spend on Health as % of GDP" comparison for a given year
// and cofog function. Used on the Data page for side-by-side comparison.
export function useExpenditureByFunction(cofogCode: string, year: number) {
  return useQuery({
    queryKey: ['expenditure-by-function', cofogCode, year],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('government_expenditure')
        .select('*')
        .eq('cofog_code', cofogCode)
        .eq('year', year)
        .order('pct_of_gdp', { ascending: false, nullsFirst: false });
      if (error) throw error;
      return (data || []) as GovernmentExpenditureRow[];
    },
    staleTime: 1000 * 60 * 60,
  });
}

// Given the raw rows for a single country, produce one "breakdown for year Y"
// shape suitable for the treemap / horizontal bar. Computes pct_of_gdp on
// the fly when Eurostat hasn't published it yet (recent years) using the
// country's own GDP from country_demographics.
export interface BudgetBreakdownEntry {
  cofog_code: string;
  cofog_label: string;
  amount_million_eur: number | null;
  pct_of_gdp: number | null;
  pct_of_total_expenditure: number | null;
  amount_per_capita_eur: number | null;
  is_provisional: boolean;
}

export function buildBreakdownForYear(
  rows: GovernmentExpenditureRow[],
  demographics: CountryDemographicsRow[],
  year: number,
): BudgetBreakdownEntry[] {
  const yearRows = rows.filter((r) => r.year === year);
  const demo = demographics.find((d) => d.year === year);
  const population = demo?.population ?? null;
  const gdpMillion = demo?.gdp_million_eur ?? null;

  return yearRows.map((r) => {
    let pctOfGdp = r.pct_of_gdp ?? null;
    if (pctOfGdp === null && r.amount_million_eur !== null && gdpMillion) {
      pctOfGdp = (Number(r.amount_million_eur) / Number(gdpMillion)) * 100;
    }
    let perCapita: number | null = null;
    if (r.amount_million_eur !== null && population && population > 0) {
      perCapita = (Number(r.amount_million_eur) * 1_000_000) / Number(population);
    }
    return {
      cofog_code: r.cofog_code,
      cofog_label: r.cofog_label,
      amount_million_eur: r.amount_million_eur !== null ? Number(r.amount_million_eur) : null,
      pct_of_gdp: pctOfGdp !== null ? Number(pctOfGdp) : null,
      pct_of_total_expenditure: r.pct_of_total_expenditure !== null ? Number(r.pct_of_total_expenditure) : null,
      amount_per_capita_eur: perCapita,
      is_provisional: r.is_provisional ?? false,
    };
  });
}

// EU country reference data, derived from country_demographics, returned in
// the same shape as the legacy EU_COUNTRY_DATA constant in src/pages/Data.tsx
// so we can retire that constant.
//
// Returns a Record<country_code, {population, gdp, area}> with the LATEST
// year per country. `gdp` is in billions of EUR (matching the legacy
// constant's unit, which was a small integer). `population` is the raw
// integer count. `area` is in km².
export interface EuCountryReferenceEntry {
  population: number;
  gdp: number;
  area: number;
}

export function useEuReferenceData() {
  return useQuery({
    queryKey: ['eu-reference-data'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('country_demographics')
        .select('country_code, year, population, gdp_million_eur, area_km2');
      if (error) throw error;

      // Reduce to the latest year per country.
      const latest = new Map<string, { year: number; population: number | null; gdp_million_eur: number | null; area_km2: number | null }>();
      for (const row of (data ?? []) as Array<{ country_code: string; year: number; population: number | null; gdp_million_eur: number | null; area_km2: number | null }>) {
        const cur = latest.get(row.country_code);
        if (!cur || row.year > cur.year) latest.set(row.country_code, row);
      }
      const out: Record<string, EuCountryReferenceEntry> = {};
      for (const [cc, r] of latest.entries()) {
        if (cc === 'EU27_2020') continue;
        out[cc] = {
          population: r.population ? Number(r.population) : 0,
          // Convert MIO_EUR to BIO_EUR to match the legacy constant unit.
          gdp: r.gdp_million_eur ? Math.round(Number(r.gdp_million_eur) / 1000) : 0,
          area: r.area_km2 ? Number(r.area_km2) : 0,
        };
      }
      return out;
    },
    staleTime: 1000 * 60 * 60 * 24,
  });
}

// Stacked-area time series: one entry per year, with one numeric column per
// cofog function (GFTOT excluded — we want to see the functions, not the total).
export interface BudgetTimeSeriesEntry {
  year: number;
  [cofogCode: string]: number | null;
}

export interface NumericDistributionStats {
  sample_size: number;
  mean: number | null;
  median: number | null;
  mode: number | null;
  mode_frequency: number;
  min: number | null;
  max: number | null;
  standard_deviation: number | null;
  q1: number | null;
  q3: number | null;
  iqr: number | null;
  ci95_low: number | null;
  ci95_high: number | null;
}

function quantileFromSorted(sortedValues: number[], quantile: number) {
  if (sortedValues.length === 0) return null;
  if (sortedValues.length === 1) return sortedValues[0];
  const index = (sortedValues.length - 1) * quantile;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return sortedValues[lower];
  const weight = index - lower;
  return sortedValues[lower] + (sortedValues[upper] - sortedValues[lower]) * weight;
}

export function buildNumericDistributionStats(values: Array<number | null | undefined>): NumericDistributionStats {
  const normalized = values
    .map((value) => (value === null || value === undefined ? null : Number(value)))
    .filter((value): value is number => value !== null && Number.isFinite(value))
    .sort((a, b) => a - b);

  if (normalized.length === 0) {
    return {
      sample_size: 0,
      mean: null,
      median: null,
      mode: null,
      mode_frequency: 0,
      min: null,
      max: null,
      standard_deviation: null,
      q1: null,
      q3: null,
      iqr: null,
      ci95_low: null,
      ci95_high: null,
    };
  }

  const sampleSize = normalized.length;
  const sum = normalized.reduce((total, value) => total + value, 0);
  const mean = sum / sampleSize;
  const median = quantileFromSorted(normalized, 0.5);
  const q1 = quantileFromSorted(normalized, 0.25);
  const q3 = quantileFromSorted(normalized, 0.75);
  const min = normalized[0];
  const max = normalized[normalized.length - 1];

  const frequencies = new Map<string, { value: number; count: number }>();
  for (const value of normalized) {
    const key = value.toFixed(6);
    const current = frequencies.get(key);
    frequencies.set(key, {
      value,
      count: (current?.count || 0) + 1,
    });
  }
  const modeEntry = [...frequencies.values()]
    .sort((left, right) => right.count - left.count || left.value - right.value)[0];
  const mode = modeEntry && modeEntry.count > 1 ? modeEntry.value : null;
  const modeFrequency = modeEntry && modeEntry.count > 1 ? modeEntry.count : 0;

  const sumSquaredDiffs = normalized.reduce((total, value) => total + (value - mean) ** 2, 0);
  const variance = sampleSize > 1 ? sumSquaredDiffs / (sampleSize - 1) : 0;
  const standardDeviation = Math.sqrt(variance);
  const marginOfError = sampleSize > 1
    ? NORMAL_95_CI_Z_SCORE * (standardDeviation / Math.sqrt(sampleSize))
    : null;

  return {
    sample_size: sampleSize,
    mean,
    median,
    mode,
    mode_frequency: modeFrequency,
    min,
    max,
    standard_deviation: sampleSize > 1 ? standardDeviation : null,
    q1,
    q3,
    iqr: q1 !== null && q3 !== null ? q3 - q1 : null,
    ci95_low: marginOfError !== null ? mean - marginOfError : null,
    ci95_high: marginOfError !== null ? mean + marginOfError : null,
  };
}

export function buildTimeSeries(rows: GovernmentExpenditureRow[]): BudgetTimeSeriesEntry[] {
  const byYear = new Map<number, BudgetTimeSeriesEntry>();
  for (const r of rows) {
    if (r.cofog_code === 'GFTOT') continue;
    let entry = byYear.get(r.year);
    if (!entry) {
      entry = { year: r.year };
      byYear.set(r.year, entry);
    }
    entry[r.cofog_code] = r.amount_million_eur !== null ? Number(r.amount_million_eur) : null;
  }
  return [...byYear.values()].sort((a, b) => a.year - b.year);
}

export interface BudgetTotalsSeriesEntry {
  year: number;
  total_million_eur: number | null;
  pct_of_gdp: number | null;
  amount_per_capita_eur: number | null;
  is_provisional: boolean;
}

export function buildTotalsTimeSeries(
  rows: GovernmentExpenditureRow[],
  demographics: CountryDemographicsRow[],
): BudgetTotalsSeriesEntry[] {
  const demographicsByYear = new Map<number, CountryDemographicsRow>();
  for (const row of demographics) demographicsByYear.set(row.year, row);

  const totalsByYear = new Map<number, {
    total: number | null;
    pctOfGdp: number | null;
    provisional: boolean;
  }>();
  const fallbackTotals = new Map<number, number>();
  const provisionalByYear = new Map<number, boolean>();

  for (const row of rows) {
    provisionalByYear.set(row.year, Boolean(provisionalByYear.get(row.year) || row.is_provisional));
    if (row.cofog_code === 'GFTOT') {
      totalsByYear.set(row.year, {
        total: row.amount_million_eur !== null ? Number(row.amount_million_eur) : null,
        pctOfGdp: row.pct_of_gdp !== null ? Number(row.pct_of_gdp) : null,
        provisional: Boolean(row.is_provisional),
      });
      continue;
    }
    fallbackTotals.set(row.year, (fallbackTotals.get(row.year) || 0) + (Number(row.amount_million_eur) || 0));
  }

  const years = new Set<number>([
    ...rows.map((row) => row.year),
    ...demographics.map((row) => row.year),
  ]);

  return [...years]
    .sort((a, b) => a - b)
    .map((year) => {
      const totalRow = totalsByYear.get(year);
      const total = totalRow?.total ?? fallbackTotals.get(year) ?? null;
      const demo = demographicsByYear.get(year);
      const gdpMillion = demo?.gdp_million_eur !== null && demo?.gdp_million_eur !== undefined
        ? Number(demo.gdp_million_eur)
        : null;
      const population = demo?.population !== null && demo?.population !== undefined
        ? Number(demo.population)
        : null;

      const pctOfGdp = totalRow?.pctOfGdp ?? (
        total !== null && gdpMillion && gdpMillion > 0
          ? (total / gdpMillion) * 100
          : null
      );
      const perCapita = total !== null && population && population > 0
        ? (total * 1_000_000) / population
        : null;

      return {
        year,
        total_million_eur: total,
        pct_of_gdp: pctOfGdp,
        amount_per_capita_eur: perCapita,
        is_provisional: Boolean(totalRow?.provisional || provisionalByYear.get(year)),
      };
    })
    .filter((row) => row.total_million_eur !== null);
}

export interface BudgetCountrySnapshot {
  country_code: string;
  year: number;
  total_million_eur: number | null;
  pct_of_gdp: number | null;
  amount_per_capita_eur: number | null;
  is_provisional: boolean;
  top_function_code: string | null;
  top_function_label: string | null;
  top_function_share_pct: number | null;
}

export function buildBudgetCountrySnapshots(
  rows: GovernmentExpenditureRow[],
  demographics: CountryDemographicsRow[],
  year: number,
): BudgetCountrySnapshot[] {
  const rowsByCountry = new Map<string, GovernmentExpenditureRow[]>();
  const demographicsByCountry = new Map<string, CountryDemographicsRow[]>();

  for (const row of rows) {
    if (row.year !== year) continue;
    const current = rowsByCountry.get(row.country_code) || [];
    current.push(row);
    rowsByCountry.set(row.country_code, current);
  }

  for (const row of demographics) {
    if (row.year !== year) continue;
    const current = demographicsByCountry.get(row.country_code) || [];
    current.push(row);
    demographicsByCountry.set(row.country_code, current);
  }

  return [...rowsByCountry.entries()]
    .map(([countryCode, countryRows]) => {
      const summary = buildBudgetYearSummary(countryRows, demographicsByCountry.get(countryCode) || [], year);
      if (!summary) return null;
      return {
        country_code: countryCode,
        year,
        total_million_eur: summary.total_million_eur,
        pct_of_gdp: summary.pct_of_gdp,
        amount_per_capita_eur: summary.amount_per_capita_eur,
        is_provisional: summary.is_provisional,
        top_function_code: summary.top_function_code,
        top_function_label: summary.top_function_label,
        top_function_share_pct: summary.top_function_share_pct,
      };
    })
    .filter((row): row is BudgetCountrySnapshot => Boolean(row))
    .sort((left, right) => (Number(right.total_million_eur) || 0) - (Number(left.total_million_eur) || 0));
}

export interface GlobalBudgetMetricSummary {
  key: 'total_million_eur' | 'amount_per_capita_eur' | 'pct_of_gdp';
  label: string;
  unit: 'million' | 'absolute' | 'percent';
  stats: NumericDistributionStats;
  highest_country_code: string | null;
  highest_value: number | null;
  lowest_country_code: string | null;
  lowest_value: number | null;
}

export function buildGlobalBudgetMetricSummaries(
  countrySnapshots: BudgetCountrySnapshot[],
): GlobalBudgetMetricSummary[] {
  const metricDefinitions: Array<{
    key: GlobalBudgetMetricSummary['key'];
    label: string;
    unit: GlobalBudgetMetricSummary['unit'];
  }> = [
    { key: 'total_million_eur', label: 'TOTAL SPEND', unit: 'million' },
    { key: 'amount_per_capita_eur', label: 'PER CAPITA', unit: 'absolute' },
    { key: 'pct_of_gdp', label: '% OF GDP', unit: 'percent' },
  ];

  return metricDefinitions.map((metric) => {
    const populated = countrySnapshots
      .map((row) => ({
        country_code: row.country_code,
        value: row[metric.key],
      }))
      .filter((row): row is { country_code: string; value: number } => row.value !== null && Number.isFinite(row.value));
    const sorted = [...populated].sort((left, right) => left.value - right.value);

    return {
      key: metric.key,
      label: metric.label,
      unit: metric.unit,
      stats: buildNumericDistributionStats(populated.map((row) => row.value)),
      lowest_country_code: sorted[0]?.country_code ?? null,
      lowest_value: sorted[0]?.value ?? null,
      highest_country_code: sorted[sorted.length - 1]?.country_code ?? null,
      highest_value: sorted[sorted.length - 1]?.value ?? null,
    };
  });
}

export interface BudgetShareTimeSeriesEntry {
  year: number;
  [cofogCode: string]: number | null;
}

export function buildShareTimeSeries(rows: GovernmentExpenditureRow[]): BudgetShareTimeSeriesEntry[] {
  const totalsByYear = new Map<number, number>();
  const functionRows = rows.filter((row) => row.cofog_code !== 'GFTOT');

  for (const row of rows) {
    if (row.cofog_code !== 'GFTOT' || row.amount_million_eur === null) continue;
    totalsByYear.set(row.year, Number(row.amount_million_eur));
  }

  if (totalsByYear.size === 0) {
    for (const row of functionRows) {
      totalsByYear.set(row.year, (totalsByYear.get(row.year) || 0) + (Number(row.amount_million_eur) || 0));
    }
  }

  const byYear = new Map<number, BudgetShareTimeSeriesEntry>();
  for (const row of functionRows) {
    const total = totalsByYear.get(row.year) || 0;
    let entry = byYear.get(row.year);
    if (!entry) {
      entry = { year: row.year };
      byYear.set(row.year, entry);
    }
    entry[row.cofog_code] = total > 0 && row.amount_million_eur !== null
      ? (Number(row.amount_million_eur) / total) * 100
      : null;
  }
  return [...byYear.values()].sort((a, b) => a.year - b.year);
}

export interface BudgetFunctionCountrySnapshot {
  country_code: string;
  year: number;
  cofog_code: string;
  cofog_label: string;
  amount_million_eur: number | null;
  pct_of_gdp: number | null;
  pct_of_total_expenditure: number | null;
  amount_per_capita_eur: number | null;
  is_provisional: boolean;
}

export function buildBudgetFunctionCountrySnapshots(
  rows: GovernmentExpenditureRow[],
  demographics: CountryDemographicsRow[],
  year: number,
): BudgetFunctionCountrySnapshot[] {
  const rowsByCountry = new Map<string, GovernmentExpenditureRow[]>();
  const demographicsByCountry = new Map<string, CountryDemographicsRow[]>();

  for (const row of rows) {
    if (row.year !== year) continue;
    const current = rowsByCountry.get(row.country_code) || [];
    current.push(row);
    rowsByCountry.set(row.country_code, current);
  }

  for (const row of demographics) {
    if (row.year !== year) continue;
    const current = demographicsByCountry.get(row.country_code) || [];
    current.push(row);
    demographicsByCountry.set(row.country_code, current);
  }

  return [...rowsByCountry.entries()].flatMap(([countryCode, countryRows]) =>
    buildBreakdownForYear(countryRows, demographicsByCountry.get(countryCode) || [], year)
      .filter((row) => row.cofog_code !== 'GFTOT')
      .map((row) => ({
        country_code: countryCode,
        year,
        cofog_code: row.cofog_code,
        cofog_label: row.cofog_label,
        amount_million_eur: row.amount_million_eur,
        pct_of_gdp: row.pct_of_gdp,
        pct_of_total_expenditure: row.pct_of_total_expenditure,
        amount_per_capita_eur: row.amount_per_capita_eur,
        is_provisional: row.is_provisional,
      })),
  );
}

export interface GlobalBudgetFunctionSummary {
  cofog_code: string;
  cofog_label: string;
  country_count: number;
  provisional_count: number;
  total_amount_million_eur: number;
  amount_stats: NumericDistributionStats;
  share_stats: NumericDistributionStats;
  pct_of_gdp_stats: NumericDistributionStats;
  per_capita_stats: NumericDistributionStats;
  highest_amount_country_code: string | null;
  highest_amount_million_eur: number | null;
  lowest_amount_country_code: string | null;
  lowest_amount_million_eur: number | null;
}

export function buildGlobalBudgetFunctionSummaries(
  functionSnapshots: BudgetFunctionCountrySnapshot[],
): GlobalBudgetFunctionSummary[] {
  const rowsByFunction = new Map<string, BudgetFunctionCountrySnapshot[]>();

  for (const row of functionSnapshots) {
    const current = rowsByFunction.get(row.cofog_code) || [];
    current.push(row);
    rowsByFunction.set(row.cofog_code, current);
  }

  return [...rowsByFunction.entries()]
    .map(([cofogCode, rowsForFunction]) => {
      const sortedAmounts = rowsForFunction
        .filter((row): row is BudgetFunctionCountrySnapshot & { amount_million_eur: number } =>
          row.amount_million_eur !== null && Number.isFinite(row.amount_million_eur))
        .sort((left, right) => left.amount_million_eur - right.amount_million_eur);

      return {
        cofog_code: cofogCode,
        cofog_label: rowsForFunction[0]?.cofog_label || cofogCode,
        country_count: rowsForFunction.length,
        provisional_count: rowsForFunction.filter((row) => row.is_provisional).length,
        total_amount_million_eur: rowsForFunction.reduce((total, row) => total + (row.amount_million_eur || 0), 0),
        amount_stats: buildNumericDistributionStats(rowsForFunction.map((row) => row.amount_million_eur)),
        share_stats: buildNumericDistributionStats(rowsForFunction.map((row) => row.pct_of_total_expenditure)),
        pct_of_gdp_stats: buildNumericDistributionStats(rowsForFunction.map((row) => row.pct_of_gdp)),
        per_capita_stats: buildNumericDistributionStats(rowsForFunction.map((row) => row.amount_per_capita_eur)),
        lowest_amount_country_code: sortedAmounts[0]?.country_code ?? null,
        lowest_amount_million_eur: sortedAmounts[0]?.amount_million_eur ?? null,
        highest_amount_country_code: sortedAmounts[sortedAmounts.length - 1]?.country_code ?? null,
        highest_amount_million_eur: sortedAmounts[sortedAmounts.length - 1]?.amount_million_eur ?? null,
      };
    })
    .sort((left, right) => right.total_amount_million_eur - left.total_amount_million_eur);
}

export interface BudgetChangeEntry {
  cofog_code: string;
  cofog_label: string;
  current_amount_million_eur: number | null;
  previous_amount_million_eur: number | null;
  delta_million_eur: number | null;
  current_share_pct: number | null;
  previous_share_pct: number | null;
  delta_share_pct_points: number | null;
}

export function buildYearOverYearChange(rows: GovernmentExpenditureRow[], year: number): BudgetChangeEntry[] {
  const years = [...new Set(rows.map((row) => row.year))].sort((a, b) => a - b);
  const previousYear = [...years].reverse().find((candidate) => candidate < year);
  if (!previousYear) return [];

  const current = buildBreakdownForYear(rows, [], year).filter((row) => row.cofog_code !== 'GFTOT');
  const previous = buildBreakdownForYear(rows, [], previousYear).filter((row) => row.cofog_code !== 'GFTOT');
  const currentByCode = new Map(current.map((row) => [row.cofog_code, row]));
  const previousByCode = new Map(previous.map((row) => [row.cofog_code, row]));
  const codes = new Set<string>([...currentByCode.keys(), ...previousByCode.keys()]);

  return [...codes]
    .map((code) => {
      const currentRow = currentByCode.get(code) || previousByCode.get(code);
      const previousRow = previousByCode.get(code);
      const currentAmount = currentByCode.get(code)?.amount_million_eur ?? null;
      const previousAmount = previousRow?.amount_million_eur ?? null;
      return {
        cofog_code: code,
        cofog_label: currentRow?.cofog_label || code,
        current_amount_million_eur: currentAmount,
        previous_amount_million_eur: previousAmount,
        delta_million_eur: currentAmount !== null || previousAmount !== null
          ? (currentAmount || 0) - (previousAmount || 0)
          : null,
        current_share_pct: currentByCode.get(code)?.pct_of_total_expenditure ?? null,
        previous_share_pct: previousRow?.pct_of_total_expenditure ?? null,
        delta_share_pct_points:
          currentByCode.get(code)?.pct_of_total_expenditure !== null ||
            previousRow?.pct_of_total_expenditure !== null
            ? (currentByCode.get(code)?.pct_of_total_expenditure || 0) - (previousRow?.pct_of_total_expenditure || 0)
            : null,
      };
    })
    .sort((a, b) => Math.abs(b.delta_million_eur || 0) - Math.abs(a.delta_million_eur || 0));
}

export interface BudgetYearSummary {
  year: number;
  previous_year: number | null;
  total_million_eur: number | null;
  pct_of_gdp: number | null;
  amount_per_capita_eur: number | null;
  is_provisional: boolean;
  delta_million_eur: number | null;
  delta_pct: number | null;
  delta_pct_of_gdp: number | null;
  top_function_code: string | null;
  top_function_label: string | null;
  top_function_share_pct: number | null;
  largest_increase_label: string | null;
  largest_increase_million_eur: number | null;
  largest_decrease_label: string | null;
  largest_decrease_million_eur: number | null;
}

export function buildBudgetYearSummary(
  rows: GovernmentExpenditureRow[],
  demographics: CountryDemographicsRow[],
  year: number,
): BudgetYearSummary | null {
  const totals = buildTotalsTimeSeries(rows, demographics);
  const current = totals.find((entry) => entry.year === year);
  if (!current) return null;

  const previous = [...totals].reverse().find((entry) => entry.year < year) || null;
  const breakdown = buildBreakdownForYear(rows, demographics, year)
    .filter((entry) => entry.cofog_code !== 'GFTOT')
    .sort((a, b) => (b.amount_million_eur ?? 0) - (a.amount_million_eur ?? 0));
  const topFunction = breakdown[0] || null;
  const changes = buildYearOverYearChange(rows, year);
  const largestIncrease = changes.find((entry) => (entry.delta_million_eur || 0) > 0) || null;
  const largestDecrease = [...changes].reverse().find((entry) => (entry.delta_million_eur || 0) < 0) || null;

  const deltaMillion = previous && current.total_million_eur !== null && previous.total_million_eur !== null
    ? current.total_million_eur - previous.total_million_eur
    : null;
  const deltaPct = previous && previous.total_million_eur && deltaMillion !== null
    ? (deltaMillion / previous.total_million_eur) * 100
    : null;
  const deltaPctOfGdp =
    previous && current.pct_of_gdp !== null && previous.pct_of_gdp !== null
      ? current.pct_of_gdp - previous.pct_of_gdp
      : null;

  return {
    year,
    previous_year: previous?.year ?? null,
    total_million_eur: current.total_million_eur,
    pct_of_gdp: current.pct_of_gdp,
    amount_per_capita_eur: current.amount_per_capita_eur,
    is_provisional: current.is_provisional,
    delta_million_eur: deltaMillion,
    delta_pct: deltaPct,
    delta_pct_of_gdp: deltaPctOfGdp,
    top_function_code: topFunction?.cofog_code ?? null,
    top_function_label: topFunction?.cofog_label ?? null,
    top_function_share_pct: topFunction?.pct_of_total_expenditure ?? null,
    largest_increase_label: largestIncrease?.cofog_label ?? null,
    largest_increase_million_eur: largestIncrease?.delta_million_eur ?? null,
    largest_decrease_label: largestDecrease?.cofog_label ?? null,
    largest_decrease_million_eur: largestDecrease?.delta_million_eur ?? null,
  };
}
