// Handler for GET /functions/v1/page/party/{country}/{party}
//
// Backs PartyDetail.tsx: party metadata (best-effort), members within the
// given country, top proposals from that country, and a deduped list of
// committees each member sits on.

import { ok, fail, type EnvelopeContext, type ProvenanceEntry } from "../_shared/envelope.ts";

export async function handleParty(ctx: EnvelopeContext, params: Record<string, string>) {
  const { supabase } = ctx;
  const country = (params.country || "").toUpperCase();
  const party = params.party || "";
  if (!country || !party) {
    return fail("MISSING_PARAM", "path params 'country' and 'party' are required", 400);
  }

  const [politiciansRes, proposalsRes] = await Promise.all([
    supabase
      .from("politicians")
      .select("*")
      .eq("country_code", country)
      .eq("party_abbreviation", party)
      .order("name"),
    supabase
      .from("proposals")
      .select("*")
      .eq("country_code", country)
      .order("submitted_date", { ascending: false, nullsFirst: false })
      .limit(20),
  ]);

  if (politiciansRes.error) return fail("QUERY_FAILED", politiciansRes.error.message, 500);
  if (proposalsRes.error) return fail("QUERY_FAILED", proposalsRes.error.message, 500);

  // Party metadata lives in a view that isn't in the generated types —
  // treat it as best-effort, same as actor.ts.
  let partyRow: Record<string, unknown> | null = null;
  try {
    const { data } = await supabase
      .from("party_metadata")
      .select("*")
      .eq("country_code", country)
      .eq("party_abbreviation", party)
      .maybeSingle();
    partyRow = (data as Record<string, unknown> | null) || null;
  } catch {
    partyRow = null;
  }

  const politicians = (politiciansRes.data || []) as Array<Record<string, unknown>>;
  if (!partyRow && politicians.length === 0) {
    return fail("NOT_FOUND", `no data for party ${party} in ${country}`, 404);
  }

  const seen = new Set<string>();
  const committees: string[] = [];
  for (const p of politicians) {
    const list = (p.committees as string[] | null) || [];
    for (const c of list) {
      if (!c || seen.has(c)) continue;
      seen.add(c);
      committees.push(c);
    }
  }
  committees.sort((a, b) => a.localeCompare(b));

  const provenance: ProvenanceEntry[] = [
    { kind: "politicians", data_source: "mixed", trust_level: 1 },
    { kind: "proposals", data_source: "national_parliaments", trust_level: 1 },
  ];
  if (partyRow) {
    provenance.push({ kind: "party_metadata", data_source: "wikipedia", trust_level: 2 });
  }

  return ok(
    {
      party: partyRow,
      politicians,
      proposals: proposalsRes.data || [],
      committees,
    },
    {
      cacheTtlSeconds: 600,
      rowCounts: {
        politicians: politicians.length,
        proposals: (proposalsRes.data || []).length,
        committees: committees.length,
      },
      provenance,
    },
  );
}
