// Handler for GET /functions/v1/page/proposal/{id}
//
// Backs ProposalDetail.tsx. Resolves sponsor strings to politician rows by
// name-match within the same country_code and surfaces related political
// events either tagged with the proposal entity or whose title mentions
// the proposal.

import { ok, fail, type EnvelopeContext, type ProvenanceEntry } from "../_shared/envelope.ts";

export async function handleProposal(ctx: EnvelopeContext, params: Record<string, string>) {
  const { supabase } = ctx;
  const id = params.id;
  if (!id) return fail("MISSING_PARAM", "path param 'id' is required", 400);

  const { data: proposal, error: propErr } = await supabase
    .from("proposals")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (propErr) return fail("QUERY_FAILED", propErr.message, 500);
  if (!proposal) return fail("NOT_FOUND", `proposal ${id} not found`, 404);

  const p = proposal as Record<string, unknown>;
  const countryCode = (p.country_code as string) || "";
  const sponsorNames = ((p.sponsors as string[] | null) || []).filter(Boolean);
  const proposalTitle = (p.title as string) || "";

  const [sponsorsRes, eventsByEntityRes, eventsByTitleRes] = await Promise.all([
    sponsorNames.length > 0
      ? supabase
        .from("politicians")
        .select("*")
        .eq("country_code", countryCode)
        .in("name", sponsorNames)
      : Promise.resolve({ data: [], error: null }),
    p.entity_id
      ? supabase
        .from("political_events")
        .select(
          "id, politician_id, event_type, title, description, event_timestamp, source, source_url, entities",
        )
        .contains("entities", [p.entity_id as string])
        .order("event_timestamp", { ascending: false })
        .limit(50)
      : Promise.resolve({ data: [], error: null }),
    proposalTitle
      ? supabase
        .from("political_events")
        .select(
          "id, politician_id, event_type, title, description, event_timestamp, source, source_url, entities",
        )
        .ilike("title", `%${proposalTitle.slice(0, 60)}%`)
        .order("event_timestamp", { ascending: false })
        .limit(20)
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (sponsorsRes.error) return fail("QUERY_FAILED", sponsorsRes.error.message, 500);
  if (eventsByEntityRes.error) return fail("QUERY_FAILED", eventsByEntityRes.error.message, 500);
  if (eventsByTitleRes.error) return fail("QUERY_FAILED", eventsByTitleRes.error.message, 500);

  // Merge + dedupe the related events by id.
  const seenEvents = new Set<string>();
  const related_events: Record<string, unknown>[] = [];
  for (const row of ([...(eventsByEntityRes.data || []), ...(eventsByTitleRes.data || [])] as Array<Record<string, unknown>>)) {
    const rid = row.id as string;
    if (!rid || seenEvents.has(rid)) continue;
    seenEvents.add(rid);
    related_events.push(row);
  }

  const provenance: ProvenanceEntry[] = [
    {
      kind: "proposal",
      id,
      data_source: (p.data_source as string) || "national_parliaments",
      source_url: (p.source_url as string | null) || null,
      trust_level: 1,
    },
    { kind: "politicians", data_source: "mixed", trust_level: 1 },
  ];
  if (related_events.length > 0) {
    provenance.push({ kind: "political_events", data_source: "mixed", trust_level: 2 });
  }

  return ok(
    {
      proposal: p,
      sponsor_politicians: sponsorsRes.data || [],
      related_events,
    },
    {
      cacheTtlSeconds: 300,
      rowCounts: {
        sponsor_politicians: (sponsorsRes.data || []).length,
        related_events: related_events.length,
      },
      provenance,
    },
  );
}
