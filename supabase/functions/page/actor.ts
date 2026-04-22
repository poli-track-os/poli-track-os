// Handler for GET /functions/v1/page/actor/{id}
//
// This is the flagship Layer 3 aggregator. Replicates what ActorDetail.tsx
// assembles from nine separate React hooks — but server-side and in one
// round trip.
//
// Shape it returns:
//   {
//     politician:   Row<politicians>
//     events:       Row<political_events>[]
//     finances:     Row<politician_finances> | null        (latest year only)
//     investments:  Row<politician_investments>[]
//     position:     Row<politician_positions> | null       (latest row)
//     associates:   Row<politician_associations>[] (deduped, both directions)
//     lobby_meetings: Array<lobby_meetings + organisation>
//     committees:   string[]                               (from politicians.committees)
//     country:      Row<country_metadata> | null
//     party:        { summary, wikipedia_url, ... } | null (best effort)
//   }

import { ok, fail, type EnvelopeContext, type ProvenanceEntry } from "../_shared/envelope.ts";

export async function handleActor(ctx: EnvelopeContext, params: Record<string, string>) {
  const { supabase } = ctx;
  const id = params.id;
  if (!id) return fail("MISSING_PARAM", "path param 'id' is required", 400);

  const { data: politician, error: polErr } = await supabase
    .from("politicians")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (polErr) return fail("QUERY_FAILED", polErr.message, 500);
  if (!politician) return fail("NOT_FOUND", `politician ${id} not found`, 404);

  type Politician = typeof politician & Record<string, unknown>;
  const p = politician as Politician;

  // All the dependent queries fan out in parallel.
  const [
    eventsRes,
    financesRes,
    investmentsRes,
    positionRes,
    associatesOutRes,
    associatesInRes,
    lobbyMeetingsRes,
    countryMetaRes,
  ] = await Promise.all([
    supabase
      .from("political_events")
      .select(
        "id, event_type, title, description, event_timestamp, source, source_url, source_handle, sentiment, evidence_count, trust_level, entities",
      )
      .eq("politician_id", id)
      .order("event_timestamp", { ascending: false })
      .limit(200),
    supabase
      .from("politician_finances")
      .select("*")
      .eq("politician_id", id)
      .order("declaration_year", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("politician_investments")
      .select("*")
      .eq("politician_id", id)
      .order("estimated_value", { ascending: false }),
    supabase
      .from("politician_positions")
      .select(
        "*, politicians!inner(name, party_name, party_abbreviation, country_code)",
      )
      .eq("politician_id", id)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("politician_associations")
      .select(
        "id, associate_id, relationship_type, strength, context, is_domestic, politicians!politician_associations_associate_id_fkey(id, name, party_abbreviation, country_code, country_name, photo_url, role)",
      )
      .eq("politician_id", id)
      .order("strength", { ascending: false })
      .limit(20),
    supabase
      .from("politician_associations")
      .select(
        "id, politician_id, relationship_type, strength, context, is_domestic, politicians!politician_associations_politician_id_fkey(id, name, party_abbreviation, country_code, country_name, photo_url, role)",
      )
      .eq("associate_id", id)
      .order("strength", { ascending: false })
      .limit(20),
    supabase
      .from("lobby_meetings")
      .select(
        "*, lobby_organisations(id, name, transparency_id, category, country_code)",
      )
      .eq("politician_id", id)
      .order("meeting_date", { ascending: false })
      .limit(50),
    supabase
      .from("country_metadata")
      .select("*")
      .eq("country_code", (p.country_code as string))
      .maybeSingle(),
  ]);

  if (eventsRes.error) return fail("QUERY_FAILED", eventsRes.error.message, 500);
  if (financesRes.error) return fail("QUERY_FAILED", financesRes.error.message, 500);
  if (investmentsRes.error) return fail("QUERY_FAILED", investmentsRes.error.message, 500);
  if (associatesOutRes.error) return fail("QUERY_FAILED", associatesOutRes.error.message, 500);
  if (associatesInRes.error) return fail("QUERY_FAILED", associatesInRes.error.message, 500);
  if (lobbyMeetingsRes.error) return fail("QUERY_FAILED", lobbyMeetingsRes.error.message, 500);
  // country metadata + position can be null; no error unwrap.

  const seen = new Set<string>();
  const associates: unknown[] = [];
  for (const r of (associatesOutRes.data || []) as Array<Record<string, unknown>>) {
    const otherId = r.associate_id as string;
    if (!otherId || seen.has(otherId)) continue;
    seen.add(otherId);
    associates.push({ ...r, direction: "outgoing" });
  }
  for (const r of (associatesInRes.data || []) as Array<Record<string, unknown>>) {
    const otherId = r.politician_id as string;
    if (!otherId || seen.has(otherId)) continue;
    seen.add(otherId);
    associates.push({ ...r, direction: "incoming" });
  }

  // Fetch party metadata — best-effort. Party metadata lives in a view, so
  // we tolerate missing rows.
  let party: Record<string, unknown> | null = null;
  const partyAbbr = p.party_abbreviation as string | null;
  const countryCode = p.country_code as string | null;
  if (partyAbbr && countryCode) {
    const { data: partyRow } = await supabase
      .from("party_metadata")
      .select("*")
      .eq("party_abbreviation", partyAbbr)
      .eq("country_code", countryCode)
      .maybeSingle();
    party = (partyRow as Record<string, unknown> | null) || null;
  }

  const provenance: ProvenanceEntry[] = [
    {
      kind: "politician",
      id,
      data_source: (p.data_source as string) || "mixed",
      source_url: (p.source_url as string | null) || null,
      trust_level: 1,
    },
    {
      kind: "political_events",
      data_source: "mixed",
      trust_level: 2,
    },
  ];
  if (lobbyMeetingsRes.data && lobbyMeetingsRes.data.length > 0) {
    provenance.push({
      kind: "lobby_meetings",
      data_source: "eu_transparency_register",
      trust_level: 1,
    });
  }

  return ok(
    {
      politician: p,
      events: eventsRes.data || [],
      finances: financesRes.data || null,
      investments: investmentsRes.data || [],
      position: positionRes.data || null,
      associates,
      lobby_meetings: lobbyMeetingsRes.data || [],
      committees: (p.committees as string[] | null) || [],
      country: countryMetaRes.data || null,
      party,
    },
    {
      cacheTtlSeconds: 300,
      rowCounts: {
        events: (eventsRes.data || []).length,
        investments: (investmentsRes.data || []).length,
        associates: associates.length,
        lobby_meetings: (lobbyMeetingsRes.data || []).length,
      },
      provenance,
    },
  );
}
