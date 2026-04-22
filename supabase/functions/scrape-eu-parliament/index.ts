import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { XMLParser } from "https://esm.sh/fast-xml-parser@4.5.0";

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

// Country name to ISO code mapping for EU member states
const COUNTRY_CODES: Record<string, string> = {
  "Austria": "AT", "Belgium": "BE", "Bulgaria": "BG", "Croatia": "HR",
  "Cyprus": "CY", "Czech Republic": "CZ", "Czechia": "CZ",
  "Denmark": "DK", "Estonia": "EE", "Finland": "FI", "France": "FR",
  "Germany": "DE", "Greece": "GR", "Hungary": "HU", "Ireland": "IE",
  "Italy": "IT", "Latvia": "LV", "Lithuania": "LT", "Luxembourg": "LU",
  "Malta": "MT", "Netherlands": "NL", "Poland": "PL", "Portugal": "PT",
  "Romania": "RO", "Slovakia": "SK", "Slovenia": "SI", "Spain": "ES",
  "Sweden": "SE",
};

interface MepEntry {
  fullName: string;
  country: string;
  politicalGroup: string;
  nationalPoliticalGroup: string;
  id: string;
}

// P2.1: real XML parser — no more regex on angle-bracketed strings.
function parseXmlMeps(xml: string): MepEntry[] {
  const parser = new XMLParser({
    ignoreAttributes: true,
    trimValues: true,
    parseTagValue: false,
    isArray: (tagName) => tagName === "mep",
  });
  const doc = parser.parse(xml) as { meps?: { mep?: any[] } };
  const meps = doc.meps?.mep ?? [];
  return meps
    .map((m: any) => ({
      fullName: String(m.fullName ?? ""),
      country: String(m.country ?? ""),
      politicalGroup: String(m.politicalGroup ?? ""),
      nationalPoliticalGroup: String(m.nationalPoliticalGroup ?? ""),
      id: String(m.id ?? ""),
    }))
    .filter((m: MepEntry) => m.fullName && m.id);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  let offset = 0;
  // The EP directory currently returns ~718 MEPs. The function does one
  // XML fetch + one bulk upsert with no per-row network calls, so there's
  // no wall-clock risk from a single full-directory pass. Default high.
  let batchSize = 1000;
  try {
    const body = await req.json();
    offset = body.offset || 0;
    batchSize = Math.min(body.batchSize || 1000, 1000);
  } catch { /* defaults */ }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const { data: run } = await supabase
    .from("scrape_runs")
    .insert({ source_type: "eu_parliament", status: "running" })
    .select()
    .single();
  const runId = run?.id;

  try {
    console.log("Fetching current MEPs from EP XML directory...");
    const res = await fetch("https://www.europarl.europa.eu/meps/en/full-list/xml", {
      signal: AbortSignal.timeout(15000),
    });

    if (!res.ok) throw new Error(`EP XML endpoint returned ${res.status}`);

    const xml = await res.text();
    const allMeps = parseXmlMeps(xml);
    console.log(`Parsed ${allMeps.length} MEPs from XML`);

    const batch = allMeps.slice(offset, offset + batchSize);
    let created = 0;
    let updated = 0;
    const createdIds: string[] = [];

    // P2.4: upsert on external_id so reruns are idempotent.
    const records = batch.map((mep) => ({
      external_id: mep.id,
      name: mep.fullName,
      country_code: COUNTRY_CODES[mep.country] || "EU",
      country_name: mep.country || "European Union",
      role: "Member of European Parliament",
      jurisdiction: "eu",
      continent: "Europe",
      party_name: mep.politicalGroup || null,
      party_abbreviation: mep.nationalPoliticalGroup || null,
      data_source: "eu_parliament" as const,
      source_url: `https://www.europarl.europa.eu/meps/en/${mep.id}`,
      photo_url: `https://www.europarl.europa.eu/mepphoto/${mep.id}.jpg`,
    }));

    // Pull every existing MEP row so we can classify created vs updated
    // deterministically. Fetching the full politicians(eu_parliament)
    // set avoids a giant .in() URL — the whole MEP slate is only ~700
    // rows anyway.
    const { data: existing, error: existingErr } = await supabase
      .from("politicians")
      .select("id, external_id")
      .eq("data_source", "eu_parliament");
    if (existingErr) throw existingErr;
    const existingByExtId = new Map<string, string>();
    for (const row of existing || []) {
      if (row.external_id) existingByExtId.set(row.external_id, row.id);
    }
    console.log(`existing MEP rows in DB: ${existingByExtId.size}`);

    // Chunked upsert. Sending all 718 rows in a single .upsert() call
    // appeared to silently cap at ~200 rows against the Supabase
    // platform — chunking to 150 per call is the reliable workaround
    // and still only ~5 round trips.
    const CHUNK = 150;
    let totalUpserted = 0;
    for (let i = 0; i < records.length; i += CHUNK) {
      const chunk = records.slice(i, i + CHUNK);
      const { data: upserted, error: upsertErr } = await supabase
        .from("politicians")
        .upsert(chunk, { onConflict: "external_id" })
        .select("id, external_id");
      if (upsertErr) throw upsertErr;
      totalUpserted += upserted?.length ?? 0;
      for (const row of upserted || []) {
        if (existingByExtId.has(row.external_id!)) {
          updated++;
        } else {
          created++;
          createdIds.push(row.id);
          existingByExtId.set(row.external_id!, row.id);
        }
      }
    }
    console.log(`sent ${records.length} records; upserted ${totalUpserted}; created=${created} updated=${updated}`);

    const hasMore = offset + batchSize < allMeps.length;

    await supabase.from("scrape_runs").update({
      status: "completed",
      records_fetched: allMeps.length,
      records_created: created,
      records_updated: updated,
      completed_at: new Date().toISOString(),
    }).eq("id", runId);

    // P2.5: cumulative counter instead of overwrite
    await supabase.rpc("increment_total_records", {
      p_source_type: "eu_parliament",
      p_delta: created,
    });

    // P2.7: chain enrich-wikipedia with explicit ids of the newly-created
    // rows. The previous version sliced to the first 20 ids only — on a
    // cold start this leaves ~698 of 718 MEPs unenriched until a separate
    // cron run picks them up. Instead, chunk into groups of `enrich-
    // wikipedia`'s max batch (50) and fire a request per chunk, tracking
    // how many we triggered.
    //
    // Each chunked call is awaited but is bounded by `enrich-wikipedia`'s
    // own 90s wall-clock cutoff, so we cap how many chunks we queue from
    // here to ~3 so the parent function returns within its own deadline.
    // Any leftovers will fall into `enrich-wikipedia`'s "null enriched_at"
    // backlog and get drained by the next ingest run.
    const ENRICH_CHUNK = 50;
    const MAX_CHAINED_CHUNKS = 3;
    let enrichmentTriggered = 0;
    if (createdIds.length > 0) {
      const enrichUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/enrich-wikipedia`;
      const totalChunks = Math.min(
        Math.ceil(createdIds.length / ENRICH_CHUNK),
        MAX_CHAINED_CHUNKS,
      );
      for (let i = 0; i < totalChunks; i++) {
        const slice = createdIds.slice(i * ENRICH_CHUNK, (i + 1) * ENRICH_CHUNK);
        try {
          await fetch(enrichUrl, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
            },
            body: JSON.stringify({
              politicianIds: slice,
              parentRunId: runId,
            }),
            signal: AbortSignal.timeout(25000),
          });
          enrichmentTriggered += slice.length;
        } catch (e) {
          console.log(`Wikipedia enrichment chunk ${i + 1}/${totalChunks} failed (non-blocking):`, e);
        }
      }
    }

    return new Response(JSON.stringify({
      success: true,
      total_meps: allMeps.length,
      batch_processed: batch.length,
      created,
      updated,
      next_offset: hasMore ? offset + batchSize : null,
      has_more: hasMore,
      enrichment_triggered: enrichmentTriggered > 0,
      enrichment_triggered_count: enrichmentTriggered,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (error) {
    console.error("Scrape error:", error);
    if (runId) {
      await supabase.from("scrape_runs").update({
        status: "failed",
        error_message: serializeError(error),
        completed_at: new Date().toISOString(),
      }).eq("id", runId);
    }
    return new Response(JSON.stringify({
      success: false,
      error: serializeError(error),
    }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
