import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

function serializeError(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (typeof e === "object" && e !== null) {
    const obj = e as Record<string, unknown>;
    const parts = [obj.message, obj.code, obj.details, obj.hint]
      .filter((v): v is string => typeof v === "string" && v.length > 0);
    if (parts.length > 0) return parts.join(" | ");
    try { return JSON.stringify(e); } catch { /* fall through */ }
  }
  return String(e);
}


const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Scrapes committee + delegation membership for every MEP with an
// external_id, using each MEP's public home page. Updates the
// politicians.committees array and emits one committee_join event per
// membership so the UI's event timeline reflects the assignments.
//
// Source: https://www.europarl.europa.eu/meps/en/{external_id}/{SLUG}/home
//
// The HTML markup exposes each assignment as:
//   <[tag] title="Committee on ..."> ... [abbreviation] ...
// A single regex over the page reliably captures (committee_full_name, abbreviation) pairs.

interface MepRow {
  id: string;
  name: string;
  external_id: string;
  committees: string[] | null;
}

function slugifyMepName(name: string): string {
  return name
    .toUpperCase()
    .replace(/[^A-Z\s]/g, "")
    .replace(/\s+/g, "_");
}

const COMMITTEE_TITLE_RE =
  /title="(Committee on [^"]+|Delegation (?:for|to)[^"]+)"[^>]*>([^<]+)</gi;

interface MepCommittees {
  committees: string[];     // Committee on X
  delegations: string[];    // Delegation for/to Y
  rawLabels: string[];      // full strings including the short label
}

function parseCommittees(html: string): MepCommittees {
  const seenFull = new Set<string>();
  const committees: string[] = [];
  const delegations: string[] = [];
  const rawLabels: string[] = [];

  let match: RegExpExecArray | null;
  // Reset lastIndex because the regex is a module-level /g RegExp.
  COMMITTEE_TITLE_RE.lastIndex = 0;
  while ((match = COMMITTEE_TITLE_RE.exec(html))) {
    const full = match[1].trim();
    if (seenFull.has(full)) continue;
    seenFull.add(full);

    const abbr = match[2].trim();
    rawLabels.push(`${abbr} (${full})`);
    if (full.startsWith("Committee on")) committees.push(full);
    else delegations.push(full);
  }

  return { committees, delegations, rawLabels };
}

async function fetchMepHome(externalId: string, name: string): Promise<string | null> {
  const slug = slugifyMepName(name);
  const url = `https://www.europarl.europa.eu/meps/en/${externalId}/${slug}/home`;
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "PoliticalTracker/1.0" },
      signal: AbortSignal.timeout(12000),
    });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  let batchSize = 50;
  let politicianIds: string[] | null = null;
  let parentRunId: string | null = null;
  try {
    const body = await req.json();
    batchSize = Math.min(body.batchSize || 50, 200);
    politicianIds = Array.isArray(body.politicianIds) && body.politicianIds.length > 0
      ? body.politicianIds
      : null;
    parentRunId = body.parentRunId || null;
  } catch { /* defaults */ }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { data: run } = await supabase
    .from("scrape_runs")
    .insert({ source_type: "parliamentary_record", status: "running", parent_run_id: parentRunId })
    .select()
    .single();
  const runId = run?.id;

  try {
    // Only MEPs have the public /home URL we scrape here.
    let query = supabase
      .from("politicians")
      .select("id, name, external_id, committees")
      .eq("data_source", "eu_parliament")
      .not("external_id", "is", null)
      .order("updated_at", { ascending: true })
      .limit(batchSize);

    if (politicianIds) query = query.in("id", politicianIds);

    const { data, error } = await query;
    if (error) throw error;
    const targets = (data || []) as MepRow[];

    let updatedCount = 0;
    let eventsInserted = 0;
    let processed = 0;

    // Supabase edge functions get killed around the 2-minute wall clock
    // mark. Stop early at ~90s so the function always exits cleanly and
    // signals has_more so the caller can loop.
    const deadline = Date.now() + 90_000;

    for (const mep of targets) {
      if (Date.now() > deadline) break;
      processed++;
      const html = await fetchMepHome(mep.external_id!, mep.name);
      await new Promise((r) => setTimeout(r, 150));
      if (!html) continue;

      const { committees, delegations, rawLabels } = parseCommittees(html);
      if (committees.length === 0 && delegations.length === 0) continue;

      const combined = [...committees, ...delegations];
      const existing = new Set((mep.committees || []).map((c) => c.toLowerCase()));
      const newMemberships = combined.filter((c) => !existing.has(c.toLowerCase()));

      // Update the denormalized array on politicians
      if (combined.length > 0) {
        await supabase
          .from("politicians")
          .update({ committees: combined })
          .eq("id", mep.id);
        updatedCount++;
      }

      // Emit one committee_join event per new membership so the UI's
      // event timeline shows when we first learned about each assignment.
      const timestamp = new Date().toISOString();
      const eventRows = newMemberships.map((m) => ({
        politician_id: mep.id,
        event_type: "committee_join" as const,
        title: `Joined ${m}`,
        description: `Tracked as a current member of ${m}. Labels on source page: ${rawLabels.slice(0, 6).join(", ")}.`,
        source: "parliamentary_record" as const,
        source_url: `https://www.europarl.europa.eu/meps/en/${mep.external_id}`,
        event_timestamp: timestamp,
        raw_data: { committees, delegations },
        evidence_count: 1,
        trust_level: 1,
      }));

      if (eventRows.length > 0) {
        const { data: inserted } = await supabase
          .from("political_events")
          .upsert(eventRows, { onConflict: "politician_id,source_url,event_timestamp", ignoreDuplicates: true })
          .select("id");
        eventsInserted += inserted?.length ?? 0;
      }
    }

    const hasMore = processed < targets.length;

    if (runId) {
      await supabase.from("scrape_runs").update({
        status: "completed",
        records_fetched: targets.length,
        records_updated: updatedCount,
        records_created: eventsInserted,
        completed_at: new Date().toISOString(),
      }).eq("id", runId);
    }

    return new Response(
      JSON.stringify({
        success: true,
        scanned: targets.length,
        processed,
        politicians_updated: updatedCount,
        events_inserted: eventsInserted,
        has_more: hasMore,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("mep-committees scrape error:", error);
    if (runId) {
      await supabase.from("scrape_runs").update({
        status: "failed",
        error_message: serializeError(error),
        completed_at: new Date().toISOString(),
      }).eq("id", runId);
    }
    return new Response(
      JSON.stringify({ success: false, error: serializeError(error) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
