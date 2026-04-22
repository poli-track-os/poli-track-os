// Handler for GET /functions/v1/page/data
//
// Data.tsx rollup. One-shot counts + breakdowns for the status dashboard.
// Counts use head-select with { count: 'exact' } to avoid shipping rows.

import { ok, fail, type EnvelopeContext, type ProvenanceEntry } from "../_shared/envelope.ts";

export async function handleData(ctx: EnvelopeContext) {
  const { supabase } = ctx;

  const [
    polCountRes,
    eventCountRes,
    propCountRes,
    polMetaRes,
    propMetaRes,
    demoRes,
    runsRes,
  ] = await Promise.all([
    supabase.from("politicians").select("id", { count: "exact", head: true }),
    supabase.from("political_events").select("id", { count: "exact", head: true }),
    supabase.from("proposals").select("id", { count: "exact", head: true }),
    supabase.from("politicians").select("country_code, country_name, continent"),
    supabase.from("proposals").select("country_code, country_name, status, policy_area"),
    supabase
      .from("country_demographics")
      .select("country_code, year, population, gdp_million_eur, area_km2"),
    supabase
      .from("scrape_runs")
      .select("*")
      .order("started_at", { ascending: false })
      .limit(10),
  ]);

  if (polCountRes.error) return fail("QUERY_FAILED", polCountRes.error.message, 500);
  if (eventCountRes.error) return fail("QUERY_FAILED", eventCountRes.error.message, 500);
  if (propCountRes.error) return fail("QUERY_FAILED", propCountRes.error.message, 500);
  if (polMetaRes.error) return fail("QUERY_FAILED", polMetaRes.error.message, 500);
  if (propMetaRes.error) return fail("QUERY_FAILED", propMetaRes.error.message, 500);

  type PolMeta = { country_code: string; country_name: string; continent: string | null };
  const countries = new Map<string, { code: string; name: string; count: number }>();
  for (const r of (polMetaRes.data || []) as PolMeta[]) {
    const existing = countries.get(r.country_code) || { code: r.country_code, name: r.country_name, count: 0 };
    existing.count++;
    countries.set(r.country_code, existing);
  }
  const by_country = Array.from(countries.values()).sort((a, b) => b.count - a.count);

  type PropMeta = { country_code: string; country_name: string; status: string | null; policy_area: string | null };
  const statusCounts: Record<string, number> = {};
  const areaCounts: Record<string, number> = {};
  for (const r of (propMetaRes.data || []) as PropMeta[]) {
    if (r.status) statusCounts[r.status] = (statusCounts[r.status] || 0) + 1;
    if (r.policy_area) areaCounts[r.policy_area] = (areaCounts[r.policy_area] || 0) + 1;
  }
  const by_status = Object.entries(statusCounts)
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);
  const by_area = Object.entries(areaCounts)
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);

  // Latest-year demographics per country.
  type DemoRow = {
    country_code: string;
    year: number;
    population: number | null;
    gdp_million_eur: number | null;
    area_km2: number | null;
  };
  const latestByCountry = new Map<string, DemoRow>();
  for (const r of (demoRes.data || []) as DemoRow[]) {
    const cur = latestByCountry.get(r.country_code);
    if (!cur || r.year > cur.year) latestByCountry.set(r.country_code, r);
  }
  const demographics = Array.from(latestByCountry.values()).map((r) => ({
    country_code: r.country_code,
    year: r.year,
    population: r.population,
    gdp_million_eur: r.gdp_million_eur,
    area_km2: r.area_km2,
  }));

  const provenance: ProvenanceEntry[] = [
    { kind: "politicians", data_source: "mixed", trust_level: 1 },
    { kind: "proposals", data_source: "national_parliaments", trust_level: 1 },
    { kind: "political_events", data_source: "mixed", trust_level: 2 },
    { kind: "country_demographics", data_source: "eurostat", trust_level: 1 },
    { kind: "scrape_runs", data_source: "internal", trust_level: 1 },
  ];

  return ok(
    {
      stats: {
        politicians_total: polCountRes.count ?? 0,
        events_total: eventCountRes.count ?? 0,
        proposals_total: propCountRes.count ?? 0,
        countries_covered: countries.size,
      },
      by_country,
      by_status,
      by_area,
      demographics,
      scrape_runs_recent: runsRes.data || [],
    },
    {
      cacheTtlSeconds: 1800,
      rowCounts: {
        countries: by_country.length,
        runs: (runsRes.data || []).length,
      },
      provenance,
    },
  );
}
