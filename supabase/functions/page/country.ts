// Handler for GET /functions/v1/page/country/{code}
//
// Composite shape matching CountryDetail.tsx:
//   {
//     country:            Row<country_metadata>
//     politicians:        Row<politicians>[] (sorted by name)
//     politicians_by_party: { [abbr]: Row<politicians>[] }
//     parties:            Record<string, Row<party_metadata>>
//     proposals:          Row<proposals>[]
//     budget_latest:      { year, total, breakdown: ... } | null
//     demographics:       Row<country_demographics>[] (recent 5 years)
//   }

import { ok, fail, type EnvelopeContext, type ProvenanceEntry } from "../_shared/envelope.ts";

export async function handleCountry(ctx: EnvelopeContext, params: Record<string, string>) {
  const { supabase } = ctx;
  const codeRaw = params.code;
  if (!codeRaw) return fail("MISSING_PARAM", "path param 'code' is required", 400);
  const code = codeRaw.toUpperCase();

  const [countryRes, politiciansRes, proposalsRes, expRes, demoRes] = await Promise.all([
    supabase.from("country_metadata").select("*").eq("country_code", code).maybeSingle(),
    supabase.from("politicians").select("*").eq("country_code", code).order("name"),
    supabase
      .from("proposals")
      .select("*")
      .eq("country_code", code)
      .order("submitted_date", { ascending: false, nullsFirst: false })
      .limit(100),
    supabase
      .from("government_expenditure")
      .select("year, cofog_code, cofog_label, amount_million_eur")
      .eq("country_code", code)
      .order("year", { ascending: false })
      .limit(2000),
    supabase
      .from("country_demographics")
      .select("*")
      .eq("country_code", code)
      .order("year", { ascending: false })
      .limit(10),
  ]);

  if (countryRes.error) return fail("QUERY_FAILED", countryRes.error.message, 500);
  if (politiciansRes.error) return fail("QUERY_FAILED", politiciansRes.error.message, 500);
  if (proposalsRes.error) return fail("QUERY_FAILED", proposalsRes.error.message, 500);

  if (!countryRes.data && (politiciansRes.data || []).length === 0) {
    return fail("NOT_FOUND", `no data for country ${code}`, 404);
  }

  const politicians = (politiciansRes.data || []) as Array<Record<string, unknown>>;
  const politiciansByParty: Record<string, typeof politicians> = {};
  for (const p of politicians) {
    const key = (p.party_abbreviation as string) || "Independent";
    (politiciansByParty[key] ||= []).push(p);
  }

  // Party metadata for every party present.
  const partyAbbrs = [...new Set(Object.keys(politiciansByParty))].filter((k) => k !== "Independent");
  let parties: Record<string, Record<string, unknown>> = {};
  if (partyAbbrs.length > 0) {
    const { data: partyRows } = await supabase
      .from("party_metadata")
      .select("*")
      .in("party_abbreviation", partyAbbrs)
      .eq("country_code", code);
    parties = Object.fromEntries(
      ((partyRows || []) as Array<{ party_abbreviation: string }>).map((row) => [
        row.party_abbreviation,
        row as Record<string, unknown>,
      ]),
    );
  }

  // Latest-year budget snapshot. We only need totals + top functions.
  let budgetLatest: Record<string, unknown> | null = null;
  if (!expRes.error && (expRes.data || []).length > 0) {
    const rows = (expRes.data || []) as Array<{
      year: number;
      cofog_code: string | null;
      cofog_label: string | null;
      amount_million_eur: number | null;
    }>;
    const latestYear = Math.max(...rows.map((r) => r.year));
    const latestRows = rows.filter((r) => r.year === latestYear);
    const totalRow = latestRows.find((r) => r.cofog_code === "GFTOT");
    const total = totalRow
      ? Number(totalRow.amount_million_eur) || 0
      : latestRows.reduce((acc, r) => acc + (Number(r.amount_million_eur) || 0), 0);
    const breakdown = latestRows
      .filter((r) => r.cofog_code && r.cofog_code !== "GFTOT")
      .map((r) => ({
        cofog_code: r.cofog_code!,
        cofog_label: r.cofog_label,
        amount_million_eur: Number(r.amount_million_eur) || 0,
      }))
      .sort((a, b) => b.amount_million_eur - a.amount_million_eur);
    budgetLatest = { year: latestYear, total_million_eur: total, breakdown };
  }

  const provenance: ProvenanceEntry[] = [
    { kind: "country_metadata", id: code, data_source: "wikipedia", trust_level: 2 },
    { kind: "politicians", data_source: "mixed", trust_level: 1 },
    { kind: "proposals", data_source: "national_parliaments", trust_level: 1 },
  ];
  if (budgetLatest) {
    provenance.push({ kind: "government_expenditure", data_source: "eurostat_cofog", trust_level: 1 });
  }

  return ok(
    {
      country: countryRes.data,
      politicians,
      politicians_by_party: politiciansByParty,
      parties,
      proposals: proposalsRes.data || [],
      budget_latest: budgetLatest,
      demographics: demoRes.data || [],
    },
    {
      cacheTtlSeconds: 600,
      rowCounts: {
        politicians: politicians.length,
        parties: Object.keys(parties).length,
        proposals: (proposalsRes.data || []).length,
      },
      provenance,
    },
  );
}
