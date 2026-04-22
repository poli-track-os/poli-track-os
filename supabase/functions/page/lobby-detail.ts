// Handler for GET /functions/v1/page/lobby/{transparency_id}
//
// Full profile for one lobby organisation — spend history across all
// years and meetings joined to the politician they met.

import { ok, fail, type EnvelopeContext, type ProvenanceEntry } from "../_shared/envelope.ts";

export async function handleLobbyDetail(ctx: EnvelopeContext, params: Record<string, string>) {
  const { supabase } = ctx;
  const transparencyId = params.transparency_id;
  if (!transparencyId) return fail("MISSING_PARAM", "path param 'transparency_id' is required", 400);

  const { data: org, error: orgErr } = await supabase
    .from("lobby_organisations")
    .select("*")
    .eq("transparency_id", transparencyId)
    .maybeSingle();
  if (orgErr) return fail("QUERY_FAILED", orgErr.message, 500);
  if (!org) return fail("NOT_FOUND", `lobby organisation ${transparencyId} not found`, 404);

  const orgRow = org as Record<string, unknown> & { id: string };

  const [spendRes, meetingsRes] = await Promise.all([
    supabase
      .from("lobby_spend")
      .select("*")
      .eq("lobby_id", orgRow.id)
      .order("year", { ascending: true }),
    supabase
      .from("lobby_meetings")
      .select(
        "*, politicians(id, name, party_abbreviation, country_code, country_name, photo_url, role)",
      )
      .eq("lobby_id", orgRow.id)
      .order("meeting_date", { ascending: false })
      .limit(200),
  ]);

  if (spendRes.error) return fail("QUERY_FAILED", spendRes.error.message, 500);
  if (meetingsRes.error) return fail("QUERY_FAILED", meetingsRes.error.message, 500);

  const provenance: ProvenanceEntry[] = [
    {
      kind: "lobby_organisations",
      id: transparencyId,
      data_source: "eu_transparency_register",
      trust_level: 1,
    },
    { kind: "lobby_spend", data_source: "eu_transparency_register", trust_level: 1 },
    { kind: "lobby_meetings", data_source: "eu_transparency_register", trust_level: 1 },
  ];

  return ok(
    {
      organisation: orgRow,
      spend_history: spendRes.data || [],
      meetings: meetingsRes.data || [],
    },
    {
      cacheTtlSeconds: 600,
      rowCounts: {
        spend_history: (spendRes.data || []).length,
        meetings: (meetingsRes.data || []).length,
      },
      provenance,
    },
  );
}
