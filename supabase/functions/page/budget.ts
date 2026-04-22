// Handler for GET /functions/v1/page/budget/{country}?year=
//
// Backs Budgets.tsx for a single country/year view. Builds a breakdown
// from government_expenditure + cofog_functions for labels, plus a yearly
// time series of totals and the latest demographics for context.

import { ok, fail, intParam, type EnvelopeContext, type ProvenanceEntry } from "../_shared/envelope.ts";

export async function handleBudget(ctx: EnvelopeContext, params: Record<string, string>) {
  const { supabase, url } = ctx;
  const country = (params.country || "").toUpperCase();
  if (!country) return fail("MISSING_PARAM", "path param 'country' is required", 400);
  const yearParam = intParam(url, "year", 0) || null;

  const [expRes, cofogRes, demoRes] = await Promise.all([
    supabase
      .from("government_expenditure")
      .select("year, cofog_code, cofog_label, amount_million_eur, pct_of_total_expenditure")
      .eq("country_code", country)
      .order("year", { ascending: false })
      .limit(5000),
    supabase.from("cofog_functions").select("code, label").order("sort_order"),
    supabase
      .from("country_demographics")
      .select("year, population, gdp_million_eur, area_km2")
      .eq("country_code", country)
      .order("year", { ascending: false }),
  ]);

  if (expRes.error) return fail("QUERY_FAILED", expRes.error.message, 500);
  if (cofogRes.error) return fail("QUERY_FAILED", cofogRes.error.message, 500);

  type ExpRow = {
    year: number;
    cofog_code: string;
    cofog_label: string;
    amount_million_eur: number | null;
    pct_of_total_expenditure: number | null;
  };
  const rows = (expRes.data || []) as ExpRow[];
  if (rows.length === 0) {
    return fail("NOT_FOUND", `no expenditure data for country ${country}`, 404);
  }

  const allYears = [...new Set(rows.map((r) => r.year))].sort((a, b) => b - a);
  const year = yearParam && allYears.includes(yearParam) ? yearParam : allYears[0];

  const labelByCode = new Map<string, string>(
    ((cofogRes.data || []) as Array<{ code: string; label: string }>).map((r) => [r.code, r.label]),
  );

  const yearRows = rows.filter((r) => r.year === year);
  // GFTOT = total expenditure across all functions in the COFOG schema.
  const totalRow = yearRows.find((r) => r.cofog_code === "GFTOT");
  const total_eur_million = totalRow?.amount_million_eur !== null && totalRow?.amount_million_eur !== undefined
    ? Number(totalRow.amount_million_eur)
    : yearRows
      .filter((r) => r.cofog_code !== "GFTOT")
      .reduce((acc, r) => acc + (Number(r.amount_million_eur) || 0), 0);

  const breakdown = yearRows
    .filter((r) => r.cofog_code !== "GFTOT")
    .map((r) => {
      const amount = Number(r.amount_million_eur) || 0;
      const pct = r.pct_of_total_expenditure !== null
        ? Number(r.pct_of_total_expenditure)
        : total_eur_million > 0
          ? (amount / total_eur_million) * 100
          : 0;
      return {
        cofog_function: r.cofog_code,
        name: labelByCode.get(r.cofog_code) || r.cofog_label,
        amount_eur_million: amount,
        pct_of_total: pct,
      };
    })
    .sort((a, b) => b.amount_eur_million - a.amount_eur_million);

  const timeseriesMap = new Map<number, number>();
  for (const r of rows) {
    if (r.cofog_code !== "GFTOT") continue;
    if (r.amount_million_eur === null) continue;
    timeseriesMap.set(r.year, Number(r.amount_million_eur));
  }
  // Fallback: if no GFTOT rows, sum the per-function rows by year.
  if (timeseriesMap.size === 0) {
    const byYear = new Map<number, number>();
    for (const r of rows) {
      byYear.set(r.year, (byYear.get(r.year) || 0) + (Number(r.amount_million_eur) || 0));
    }
    for (const [y, t] of byYear) timeseriesMap.set(y, t);
  }
  const timeseries = Array.from(timeseriesMap.entries())
    .map(([y, total]) => ({ year: y, total }))
    .sort((a, b) => a.year - b.year);

  type DemoRow = {
    year: number;
    population: number | null;
    gdp_million_eur: number | null;
    area_km2: number | null;
  };
  const demoRows = (demoRes.data || []) as DemoRow[];
  const demoForYear = demoRows.find((d) => d.year === year) || demoRows[0] || null;
  const demographics = demoForYear
    ? {
      population: demoForYear.population,
      gdp: demoForYear.gdp_million_eur,
    }
    : { population: null, gdp: null };

  const provenance: ProvenanceEntry[] = [
    { kind: "government_expenditure", data_source: "eurostat_cofog", trust_level: 1 },
    { kind: "cofog_functions", data_source: "eurostat", trust_level: 1 },
    { kind: "country_demographics", data_source: "eurostat", trust_level: 1 },
  ];

  return ok(
    {
      country,
      year,
      total_eur_million,
      breakdown,
      timeseries,
      demographics,
    },
    {
      cacheTtlSeconds: 3600,
      rowCounts: {
        breakdown: breakdown.length,
        timeseries: timeseries.length,
      },
      provenance,
    },
  );
}
