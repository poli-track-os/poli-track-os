import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { buildEstimatedPoliticalPosition } from "../../../src/lib/political-positioning.ts";

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

function buildUnclassifiedPositionRow(politicianId: string) {
  return {
    politician_id: politicianId,
    economic_score: null,
    social_score: null,
    eu_integration_score: null,
    environmental_score: null,
    immigration_score: null,
    education_priority: null,
    science_priority: null,
    healthcare_priority: null,
    defense_priority: null,
    economy_priority: null,
    justice_priority: null,
    social_welfare_priority: null,
    environment_priority: null,
    ideology_label: "Unclassified",
    key_positions: {},
    data_source: "unclassified_party_profile",
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  let batchSize = 500;
  let overwrite = false;
  try {
    const body = await req.json();
    batchSize = Math.min(body.batchSize || 500, 2000);
    overwrite = body.overwrite === true;
  } catch {
    // Keep defaults when no JSON body is provided.
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { data: run } = await supabase
    .from("scrape_runs")
    .insert({ source_type: "wikipedia", status: "running" })
    .select()
    .single();
  const runId = run?.id;

  try {
    const { data: politicians, error: politicianError } = await supabase
      .from("politicians")
      .select("id, party_name, party_abbreviation, country_code")
      .limit(batchSize);
    if (politicianError) throw politicianError;

    if (!politicians || politicians.length === 0) {
      throw new Error("No politicians to seed positions for");
    }

    let existingIds = new Set<string>();
    if (!overwrite) {
      const { data: existing, error: existingError } = await supabase
        .from("politician_positions")
        .select("politician_id");
      if (existingError) throw existingError;
      existingIds = new Set((existing || []).map((row) => row.politician_id as string));
    } else {
      const { data: existing, error: existingError } = await supabase
        .from("politician_positions")
        .select("politician_id");
      if (existingError) throw existingError;
      existingIds = new Set((existing || []).map((row) => row.politician_id as string));
    }

    let created = 0;
    let updated = 0;
    let estimated = 0;
    let unclassified = 0;

    for (const politician of politicians) {
      if (!overwrite && existingIds.has(politician.id)) continue;

      const estimatedPosition = buildEstimatedPoliticalPosition(
        politician.party_name,
        politician.party_abbreviation,
        politician.country_code,
      );

      const row = estimatedPosition
        ? {
            politician_id: politician.id,
            ...estimatedPosition,
          }
        : buildUnclassifiedPositionRow(politician.id);

      if (estimatedPosition) estimated++;
      else unclassified++;

      if (existingIds.has(politician.id)) {
        const { error } = await supabase
          .from("politician_positions")
          .update(row)
          .eq("politician_id", politician.id);
        if (error) throw error;
        updated++;
      } else {
        const { error } = await supabase
          .from("politician_positions")
          .insert(row);
        if (error) throw error;
        created++;
      }
    }

    if (runId) {
      await supabase.from("scrape_runs").update({
        status: "completed",
        records_fetched: politicians.length,
        records_created: created,
        records_updated: updated,
        error_message: null,
        completed_at: new Date().toISOString(),
      }).eq("id", runId);
    }

    return new Response(
      JSON.stringify({
        success: true,
        scanned: politicians.length,
        created,
        updated,
        estimated,
        unclassified,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("seed-positions error:", error);
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
