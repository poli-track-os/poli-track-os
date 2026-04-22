import { describe, expect, it } from "vitest";
import {
  buildBreakdownForYear,
  buildBudgetCountrySnapshots,
  buildBudgetFunctionCountrySnapshots,
  buildBudgetYearSummary,
  buildGlobalBudgetFunctionSummaries,
  buildGlobalBudgetMetricSummaries,
  buildNumericDistributionStats,
  buildShareTimeSeries,
  buildTimeSeries,
  buildTotalsTimeSeries,
  buildYearOverYearChange,
  type GovernmentExpenditureRow,
  type CountryDemographicsRow,
} from "../hooks/use-government-expenditure";

const row = (overrides: Partial<GovernmentExpenditureRow>): GovernmentExpenditureRow => ({
  id: "00000000-0000-0000-0000-000000000000",
  country_code: "DE",
  year: 2022,
  cofog_code: "GF07",
  cofog_label: "Health",
  amount_million_eur: 100 as unknown as GovernmentExpenditureRow['amount_million_eur'],
  pct_of_gdp: null,
  pct_of_total_expenditure: null,
  sector: "S13",
  na_item: "TE",
  is_provisional: false,
  data_source: "eurostat_cofog",
  source_url: null,
  fetched_at: "2026-04-15T00:00:00Z",
  created_at: "2026-04-15T00:00:00Z",
  updated_at: "2026-04-15T00:00:00Z",
  ...overrides,
});

const demo = (overrides: Partial<CountryDemographicsRow>): CountryDemographicsRow => ({
  country_code: "DE",
  year: 2022,
  population: 83_000_000,
  gdp_million_eur: 3_900_000 as unknown as CountryDemographicsRow['gdp_million_eur'],
  gdp_per_capita_eur: null,
  area_km2: null,
  data_source: "eurostat_macro",
  source_url: null,
  fetched_at: "2026-04-15T00:00:00Z",
  created_at: "2026-04-15T00:00:00Z",
  updated_at: "2026-04-15T00:00:00Z",
  ...overrides,
});

describe("buildBreakdownForYear", () => {
  it("computes pct_of_gdp on the fly when Eurostat hasn't published it", () => {
    const rows = [row({ cofog_code: "GF07", amount_million_eur: 329207 as unknown as GovernmentExpenditureRow['amount_million_eur'] })];
    const demos = [demo({})];
    const breakdown = buildBreakdownForYear(rows, demos, 2022);
    expect(breakdown).toHaveLength(1);
    // 329_207 / 3_900_000 * 100 ≈ 8.44%
    expect(breakdown[0].pct_of_gdp).toBeCloseTo(8.4412, 1);
  });

  it("uses published pct_of_gdp when available", () => {
    const rows = [row({ cofog_code: "GF07", amount_million_eur: 329207 as unknown as GovernmentExpenditureRow['amount_million_eur'], pct_of_gdp: 8.4 as unknown as GovernmentExpenditureRow['pct_of_gdp'] })];
    const demos = [demo({})];
    const breakdown = buildBreakdownForYear(rows, demos, 2022);
    expect(breakdown[0].pct_of_gdp).toBe(8.4);
  });

  it("computes amount_per_capita_eur from population and amount", () => {
    const rows = [row({ amount_million_eur: 329207 as unknown as GovernmentExpenditureRow['amount_million_eur'] })];
    const demos = [demo({ population: 83_000_000 })];
    const breakdown = buildBreakdownForYear(rows, demos, 2022);
    // 329_207_000_000 / 83_000_000 ≈ 3966 EUR per capita
    expect(breakdown[0].amount_per_capita_eur).toBeCloseTo(3966, 0);
  });

  it("yields null per-capita when population is missing", () => {
    const rows = [row({})];
    const demos = [demo({ population: null })];
    const breakdown = buildBreakdownForYear(rows, demos, 2022);
    expect(breakdown[0].amount_per_capita_eur).toBeNull();
  });

  it("returns empty when no rows exist for the requested year", () => {
    const rows = [row({ year: 2021 })];
    const demos = [demo({ year: 2021 })];
    expect(buildBreakdownForYear(rows, demos, 2022)).toEqual([]);
  });
});

describe("buildTimeSeries", () => {
  it("groups by year and produces one column per cofog function (excluding GFTOT)", () => {
    const rows = [
      row({ year: 2020, cofog_code: "GF07", amount_million_eur: 100 as unknown as GovernmentExpenditureRow['amount_million_eur'] }),
      row({ year: 2020, cofog_code: "GF09", amount_million_eur: 80 as unknown as GovernmentExpenditureRow['amount_million_eur'] }),
      row({ year: 2020, cofog_code: "GFTOT", amount_million_eur: 500 as unknown as GovernmentExpenditureRow['amount_million_eur'] }),
      row({ year: 2021, cofog_code: "GF07", amount_million_eur: 110 as unknown as GovernmentExpenditureRow['amount_million_eur'] }),
      row({ year: 2021, cofog_code: "GF09", amount_million_eur: 85 as unknown as GovernmentExpenditureRow['amount_million_eur'] }),
    ];
    const series = buildTimeSeries(rows);
    expect(series).toHaveLength(2);
    expect(series[0]).toEqual({ year: 2020, GF07: 100, GF09: 80 });
    expect(series[1]).toEqual({ year: 2021, GF07: 110, GF09: 85 });
    // GFTOT must NOT appear
    expect(series[0].GFTOT).toBeUndefined();
  });

  it("sorts by year ascending regardless of input order", () => {
    const rows = [
      row({ year: 2022, cofog_code: "GF07" }),
      row({ year: 2020, cofog_code: "GF07" }),
      row({ year: 2021, cofog_code: "GF07" }),
    ];
    const series = buildTimeSeries(rows);
    expect(series.map((s) => s.year)).toEqual([2020, 2021, 2022]);
  });
});

describe("buildTotalsTimeSeries", () => {
  it("uses GFTOT rows and derives %GDP + per-capita metrics", () => {
    const rows = [
      row({
        year: 2022,
        cofog_code: "GFTOT",
        cofog_label: "Total expenditure",
        amount_million_eur: 500 as unknown as GovernmentExpenditureRow["amount_million_eur"],
      }),
    ];
    const demos = [
      demo({
        year: 2022,
        population: 50_000_000,
        gdp_million_eur: 2_000 as unknown as CountryDemographicsRow["gdp_million_eur"],
      }),
    ];
    const totals = buildTotalsTimeSeries(rows, demos);
    expect(totals).toEqual([
      {
        year: 2022,
        total_million_eur: 500,
        pct_of_gdp: 25,
        amount_per_capita_eur: 10,
        is_provisional: false,
      },
    ]);
  });

  it("falls back to summed function rows when GFTOT is missing", () => {
    const rows = [
      row({ year: 2021, cofog_code: "GF07", amount_million_eur: 100 as unknown as GovernmentExpenditureRow["amount_million_eur"] }),
      row({ year: 2021, cofog_code: "GF09", amount_million_eur: 80 as unknown as GovernmentExpenditureRow["amount_million_eur"], is_provisional: true }),
    ];
    const totals = buildTotalsTimeSeries(rows, []);
    expect(totals).toEqual([
      {
        year: 2021,
        total_million_eur: 180,
        pct_of_gdp: null,
        amount_per_capita_eur: null,
        is_provisional: true,
      },
    ]);
  });
});

describe("buildShareTimeSeries", () => {
  it("converts function rows into shares of total per year", () => {
    const rows = [
      row({ year: 2020, cofog_code: "GFTOT", amount_million_eur: 400 as unknown as GovernmentExpenditureRow["amount_million_eur"] }),
      row({ year: 2020, cofog_code: "GF07", amount_million_eur: 100 as unknown as GovernmentExpenditureRow["amount_million_eur"] }),
      row({ year: 2020, cofog_code: "GF09", amount_million_eur: 60 as unknown as GovernmentExpenditureRow["amount_million_eur"] }),
    ];
    expect(buildShareTimeSeries(rows)).toEqual([
      { year: 2020, GF07: 25, GF09: 15 },
    ]);
  });
});

describe("buildYearOverYearChange", () => {
  it("computes delta in amount and share between consecutive years", () => {
    const rows = [
      row({ year: 2021, cofog_code: "GFTOT", amount_million_eur: 400 as unknown as GovernmentExpenditureRow["amount_million_eur"] }),
      row({ year: 2021, cofog_code: "GF07", amount_million_eur: 100 as unknown as GovernmentExpenditureRow["amount_million_eur"], pct_of_total_expenditure: 25 as unknown as GovernmentExpenditureRow["pct_of_total_expenditure"] }),
      row({ year: 2021, cofog_code: "GF09", cofog_label: "Education", amount_million_eur: 80 as unknown as GovernmentExpenditureRow["amount_million_eur"], pct_of_total_expenditure: 20 as unknown as GovernmentExpenditureRow["pct_of_total_expenditure"] }),
      row({ year: 2022, cofog_code: "GFTOT", amount_million_eur: 450 as unknown as GovernmentExpenditureRow["amount_million_eur"] }),
      row({ year: 2022, cofog_code: "GF07", amount_million_eur: 120 as unknown as GovernmentExpenditureRow["amount_million_eur"], pct_of_total_expenditure: 26.7 as unknown as GovernmentExpenditureRow["pct_of_total_expenditure"] }),
      row({ year: 2022, cofog_code: "GF09", cofog_label: "Education", amount_million_eur: 70 as unknown as GovernmentExpenditureRow["amount_million_eur"], pct_of_total_expenditure: 15.6 as unknown as GovernmentExpenditureRow["pct_of_total_expenditure"] }),
    ];
    const changes = buildYearOverYearChange(rows, 2022);
    expect(changes[0].cofog_code).toBe("GF07");
    expect(changes[0].delta_million_eur).toBe(20);
    expect(changes[0].delta_share_pct_points).toBeCloseTo(1.7, 5);
    expect(changes[1].cofog_code).toBe("GF09");
    expect(changes[1].delta_million_eur).toBe(-10);
    expect(changes[1].delta_share_pct_points).toBeCloseTo(-4.4, 5);
  });
});

describe("buildBudgetYearSummary", () => {
  it("summarizes total trend, top function, and largest movers", () => {
    const rows = [
      row({ year: 2021, cofog_code: "GFTOT", amount_million_eur: 400 as unknown as GovernmentExpenditureRow["amount_million_eur"], pct_of_gdp: 20 as unknown as GovernmentExpenditureRow["pct_of_gdp"] }),
      row({ year: 2021, cofog_code: "GF07", amount_million_eur: 100 as unknown as GovernmentExpenditureRow["amount_million_eur"], pct_of_total_expenditure: 25 as unknown as GovernmentExpenditureRow["pct_of_total_expenditure"] }),
      row({ year: 2021, cofog_code: "GF09", cofog_label: "Education", amount_million_eur: 80 as unknown as GovernmentExpenditureRow["amount_million_eur"], pct_of_total_expenditure: 20 as unknown as GovernmentExpenditureRow["pct_of_total_expenditure"] }),
      row({ year: 2022, cofog_code: "GFTOT", amount_million_eur: 450 as unknown as GovernmentExpenditureRow["amount_million_eur"], pct_of_gdp: 21 as unknown as GovernmentExpenditureRow["pct_of_gdp"] }),
      row({ year: 2022, cofog_code: "GF07", amount_million_eur: 120 as unknown as GovernmentExpenditureRow["amount_million_eur"], pct_of_total_expenditure: 26.7 as unknown as GovernmentExpenditureRow["pct_of_total_expenditure"] }),
      row({ year: 2022, cofog_code: "GF09", cofog_label: "Education", amount_million_eur: 70 as unknown as GovernmentExpenditureRow["amount_million_eur"], pct_of_total_expenditure: 15.6 as unknown as GovernmentExpenditureRow["pct_of_total_expenditure"] }),
    ];
    const demos = [
      demo({ year: 2021, population: 50_000_000, gdp_million_eur: 2_000 as unknown as CountryDemographicsRow["gdp_million_eur"] }),
      demo({ year: 2022, population: 50_000_000, gdp_million_eur: 2_100 as unknown as CountryDemographicsRow["gdp_million_eur"] }),
    ];
    expect(buildBudgetYearSummary(rows, demos, 2022)).toMatchObject({
      year: 2022,
      previous_year: 2021,
      total_million_eur: 450,
      delta_million_eur: 50,
      delta_pct: 12.5,
      delta_pct_of_gdp: 1,
      top_function_label: "Health",
      top_function_share_pct: 26.7,
      largest_increase_label: "Health",
      largest_increase_million_eur: 20,
      largest_decrease_label: "Education",
      largest_decrease_million_eur: -10,
    });
  });
});

describe("buildNumericDistributionStats", () => {
  it("computes central tendency, spread, and a repeated-value mode", () => {
    const stats = buildNumericDistributionStats([10, 20, 20, 40]);
    expect(stats.sample_size).toBe(4);
    expect(stats.mean).toBe(22.5);
    expect(stats.median).toBe(20);
    expect(stats.mode).toBe(20);
    expect(stats.mode_frequency).toBe(2);
    expect(stats.min).toBe(10);
    expect(stats.max).toBe(40);
    expect(stats.standard_deviation).toBeCloseTo(12.58, 1);
    expect(stats.iqr).toBe(7.5);
    expect(stats.ci95_low).toBeLessThan(stats.mean!);
    expect(stats.ci95_high).toBeGreaterThan(stats.mean!);
  });

  it("returns null statistics for an empty distribution", () => {
    expect(buildNumericDistributionStats([])).toEqual({
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
    });
  });

  it("withholds spread and confidence interval when only one observation exists", () => {
    const stats = buildNumericDistributionStats([42]);
    expect(stats.sample_size).toBe(1);
    expect(stats.mean).toBe(42);
    expect(stats.median).toBe(42);
    expect(stats.standard_deviation).toBeNull();
    expect(stats.ci95_low).toBeNull();
    expect(stats.ci95_high).toBeNull();
  });
});

describe("global budget aggregation helpers", () => {
  it("builds cross-country budget snapshots and metric summaries for a selected year", () => {
    const rows = [
      row({ country_code: "DE", year: 2022, cofog_code: "GFTOT", cofog_label: "Total expenditure", amount_million_eur: 500 as any, pct_of_gdp: 25 as any }),
      row({ country_code: "DE", year: 2022, cofog_code: "GF07", cofog_label: "Health", amount_million_eur: 120 as any, pct_of_total_expenditure: 24 as any }),
      row({ country_code: "DE", year: 2022, cofog_code: "GF09", cofog_label: "Education", amount_million_eur: 100 as any, pct_of_total_expenditure: 20 as any }),
      row({ country_code: "FR", year: 2022, cofog_code: "GFTOT", cofog_label: "Total expenditure", amount_million_eur: 700 as any, pct_of_gdp: 28 as any }),
      row({ country_code: "FR", year: 2022, cofog_code: "GF07", cofog_label: "Health", amount_million_eur: 140 as any, pct_of_total_expenditure: 20 as any }),
      row({ country_code: "FR", year: 2022, cofog_code: "GF09", cofog_label: "Education", amount_million_eur: 150 as any, pct_of_total_expenditure: 21.4 as any }),
    ];
    const demos = [
      demo({ country_code: "DE", year: 2022, population: 50_000_000, gdp_million_eur: 2_000 as any }),
      demo({ country_code: "FR", year: 2022, population: 70_000_000, gdp_million_eur: 2_500 as any }),
    ];

    const snapshots = buildBudgetCountrySnapshots(rows, demos, 2022);
    expect(snapshots.map((row) => row.country_code)).toEqual(["FR", "DE"]);
    expect(snapshots[0]).toMatchObject({
      country_code: "FR",
      total_million_eur: 700,
      pct_of_gdp: 28,
      top_function_label: "Education",
    });

    const metricSummaries = buildGlobalBudgetMetricSummaries(snapshots);
    const totalMetric = metricSummaries.find((metric) => metric.key === "total_million_eur");
    expect(totalMetric).toMatchObject({
      highest_country_code: "FR",
      highest_value: 700,
      lowest_country_code: "DE",
      lowest_value: 500,
    });
    expect(totalMetric?.stats.mean).toBe(600);
    expect(totalMetric?.stats.median).toBe(600);
  });

  it("summarizes per-function distributions across countries", () => {
    const rows = [
      row({ country_code: "DE", year: 2022, cofog_code: "GFTOT", cofog_label: "Total expenditure", amount_million_eur: 500 as any }),
      row({ country_code: "DE", year: 2022, cofog_code: "GF07", cofog_label: "Health", amount_million_eur: 120 as any, pct_of_total_expenditure: 24 as any }),
      row({ country_code: "FR", year: 2022, cofog_code: "GFTOT", cofog_label: "Total expenditure", amount_million_eur: 700 as any }),
      row({ country_code: "FR", year: 2022, cofog_code: "GF07", cofog_label: "Health", amount_million_eur: 140 as any, pct_of_total_expenditure: 20 as any }),
    ];
    const demos = [
      demo({ country_code: "DE", year: 2022, population: 50_000_000, gdp_million_eur: 2_000 as any }),
      demo({ country_code: "FR", year: 2022, population: 70_000_000, gdp_million_eur: 2_500 as any }),
    ];

    const functionSnapshots = buildBudgetFunctionCountrySnapshots(rows, demos, 2022);
    const summaries = buildGlobalBudgetFunctionSummaries(functionSnapshots);
    expect(summaries).toHaveLength(1);
    expect(summaries[0]).toMatchObject({
      cofog_code: "GF07",
      cofog_label: "Health",
      country_count: 2,
      total_amount_million_eur: 260,
      highest_amount_country_code: "FR",
      highest_amount_million_eur: 140,
      lowest_amount_country_code: "DE",
      lowest_amount_million_eur: 120,
    });
    expect(summaries[0].share_stats.mean).toBe(22);
    expect(summaries[0].amount_stats.median).toBe(130);
  });
});
