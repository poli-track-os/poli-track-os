import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import {
  buildReportSourceUrl,
  parseReports,
  reportEventTimestamp,
} from "./parsers.ts";

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

// legislation_sponsored events for MEPs.
//
// Source: https://www.europarl.europa.eu/meps/en/{id}/{SLUG}/main-activities/reports
//
// Each report appears on this page with:
//   - the full report title wrapped in an <h3>
//   - an identifier like "A10-0013/2026"
//   - a publication date like "04-02-2026"
//   - an owning committee short code (e.g. "JURI")
//
// We emit one political_events row per report with event_type
// 'legislation_sponsored', source 'parliamentary_record', trust_level 1.

interface MepRow {
  id: string;
  name: string;
  external_id: string;
}

function slugifyMepName(name: string): string {
  return name.toUpperCase().replace(/[^A-Z\s]/g, "").replace(/\s+/g, "_");
}

async function fetchReportsPage(externalId: string, name: string): Promise<string | null> {
  const slug = slugifyMepName(name);
  const url = `https://www.europarl.europa.eu/meps/en/${externalId}/${slug}/main-activities/reports`;
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

  let batchSize = 30;
  let politicianIds: string[] | null = null;
  let parentRunId: string | null = null;
  try {
    const body = await req.json();
    batchSize = Math.min(body.batchSize || 30, 200);
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
    let query = supabase
      .from("politicians")
      .select("id, name, external_id")
      .eq("data_source", "eu_parliament")
      .not("external_id", "is", null)
      .order("updated_at", { ascending: true })
      .limit(batchSize);
    if (politicianIds) query = query.in("id", politicianIds);

    const { data, error } = await query;
    if (error) throw error;
    const meps = (data || []) as MepRow[];

    let eventsWritten = 0;
    let processed = 0;
    // Wall-clock cutoff so we never hit the edge function WORKER_LIMIT.
    const deadline = Date.now() + 90_000;

    for (const mep of meps) {
      if (Date.now() > deadline) break;
      processed++;
      const html = await fetchReportsPage(mep.external_id, mep.name);
      await new Promise((r) => setTimeout(r, 150));
      if (!html) continue;

      const reports = parseReports(html);

      if (reports.length > 0) {
        const rows = reports.map((r) => ({
          politician_id: mep.id,
          event_type: "legislation_sponsored" as const,
          title: r.reportId ? `${r.reportId}: ${r.title.substring(0, 180)}` : r.title.substring(0, 220),
          description: [
            r.committee ? `Committee: ${r.committee}` : null,
            r.reportId ? `Report ID: ${r.reportId}` : null,
            "Rapporteur attribution from EP main-activities page.",
          ].filter(Boolean).join(" · "),
          source: "parliamentary_record" as const,
          source_url: buildReportSourceUrl(mep.external_id, r.reportId),
          // Stable epoch sentinel when date is unknown so reruns stay
          // idempotent against the unique index.
          event_timestamp: reportEventTimestamp(r.date),
          raw_data: { reportId: r.reportId, committee: r.committee, date: r.date },
          evidence_count: 1,
          trust_level: 1,
          entities: r.committee ? [`#${r.committee}`] : [],
        }));

        // CRITICAL: check the error on the upsert. The previous version
        // silently swallowed errors (constraint target mismatches, etc.)
        // and reported "0 events" with a green status.
        const { data: ins, error: upsertErr } = await supabase
          .from("political_events")
          .upsert(rows, { onConflict: "politician_id,source_url,event_timestamp", ignoreDuplicates: true })
          .select("id");
        if (upsertErr) {
          console.error(`political_events upsert failed for mep ${mep.id}: ${upsertErr.message}`);
          throw upsertErr;
        }
        eventsWritten += ins?.length ?? 0;
      }

      // Advance the cursor: bump updated_at so this MEP rotates to the
      // back of the order-by-updated_at queue. Without this the scraper
      // would re-process the same first batch on every cron invocation,
      // because it doesn't otherwise touch the politicians row.
      await supabase
        .from("politicians")
        .update({ updated_at: new Date().toISOString() })
        .eq("id", mep.id);
    }

    const hasMore = processed < meps.length;

    if (runId) {
      await supabase.from("scrape_runs").update({
        status: "completed",
        records_fetched: meps.length,
        records_created: eventsWritten,
        completed_at: new Date().toISOString(),
      }).eq("id", runId);
    }

    return new Response(
      JSON.stringify({ success: true, scanned: meps.length, processed, events: eventsWritten, has_more: hasMore }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("mep-reports scrape error:", error);
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
