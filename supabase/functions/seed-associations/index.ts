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

// Seeds politician_associations from derivable facts in the politicians table:
//
//   1. Same-party, same-country politicians → relationship_type='party_ally'
//      strength 6–8 depending on overlap.
//   2. Shared committee membership → relationship_type='committee_colleague'
//      strength 5–7. Requires committees[] to be populated.
//
// This is a deterministic join, not an external scrape, so it does not
// fetch anything from the internet. It exists to give the relationship
// graph in the UI a non-empty starting state until richer sources are
// plugged in (co-sponsored bills, co-authored amendments, etc.).

interface Politician {
  id: string;
  country_code: string;
  party_abbreviation: string | null;
  party_name: string | null;
  committees: string[] | null;
}

async function loadAllPoliticians(
  supabase: ReturnType<typeof createClient>,
  pageSize = 1000,
): Promise<Politician[]> {
  const politicians: Politician[] = [];

  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await supabase
      .from("politicians")
      .select("id, country_code, party_abbreviation, party_name, committees")
      .order("id", { ascending: true })
      .range(offset, offset + pageSize - 1);

    if (error) throw error;
    const page = (data || []) as Politician[];
    if (page.length === 0) break;
    politicians.push(...page);
    if (page.length < pageSize) break;
  }

  return politicians;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  let maxPerPolitician = 20;
  let partyStrength = 6;
  let committeeStrength = 7;
  try {
    const body = await req.json();
    maxPerPolitician = Math.min(body.maxPerPolitician || 20, 50);
    partyStrength = body.partyStrength || 6;
    committeeStrength = body.committeeStrength || 7;
  } catch { /* defaults */ }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { data: run } = await supabase
    .from("scrape_runs")
    .insert({ source_type: "parliamentary_record", status: "running" })
    .select()
    .single();
  const runId = run?.id;

  try {
    const politicians = await loadAllPoliticians(supabase);
    if (politicians.length === 0) throw new Error("No politicians found");

    // Index by party key (country_code + party label)
    const partyIndex = new Map<string, Politician[]>();
    // Index by committee name (case-insensitive)
    const committeeIndex = new Map<string, Politician[]>();

    for (const p of politicians) {
      const partyKey = `${p.country_code}|${(p.party_abbreviation || p.party_name || "").toLowerCase()}`;
      if (p.party_abbreviation || p.party_name) {
        const bucket = partyIndex.get(partyKey) || [];
        bucket.push(p);
        partyIndex.set(partyKey, bucket);
      }
      for (const cm of p.committees || []) {
        const key = cm.toLowerCase().trim();
        if (!key) continue;
        const bucket = committeeIndex.get(key) || [];
        bucket.push(p);
        committeeIndex.set(key, bucket);
      }
    }

    // Build association rows
    const rows = new Map<string, {
      politician_id: string;
      associate_id: string;
      relationship_type: string;
      strength: number;
      context: string;
      is_domestic: boolean;
    }>();

    const addPair = (
      a: Politician,
      b: Politician,
      relationship_type: string,
      strength: number,
      context: string,
    ) => {
      if (a.id === b.id) return;
      // Stable key: lexicographic ordering prevents (a,b) / (b,a) duplicates
      const [first, second] = a.id < b.id ? [a, b] : [b, a];
      const key = `${first.id}:${second.id}:${relationship_type}`;
      if (rows.has(key)) return;
      rows.set(key, {
        politician_id: first.id,
        associate_id: second.id,
        relationship_type,
        strength,
        context,
        is_domestic: a.country_code === b.country_code,
      });
    };

    for (const bucket of partyIndex.values()) {
      if (bucket.length < 2) continue;
      // Cap pairs per politician so big parties don't explode the table
      for (let i = 0; i < bucket.length; i++) {
        const a = bucket[i];
        const limit = Math.min(bucket.length, i + 1 + maxPerPolitician);
        for (let j = i + 1; j < limit; j++) {
          const b = bucket[j];
          const label = a.party_abbreviation || a.party_name || "party";
          addPair(a, b, "party_ally", partyStrength, `Same party: ${label}`);
        }
      }
    }

    for (const [committee, bucket] of committeeIndex.entries()) {
      if (bucket.length < 2) continue;
      for (let i = 0; i < bucket.length; i++) {
        const a = bucket[i];
        const limit = Math.min(bucket.length, i + 1 + maxPerPolitician);
        for (let j = i + 1; j < limit; j++) {
          const b = bucket[j];
          addPair(a, b, "committee_colleague", committeeStrength, `Shared committee: ${committee}`);
        }
      }
    }

    const rowList = [...rows.values()];
    let created = 0;
    // Wall-clock cutoff so the function always returns before the
    // platform kills it at the 2-minute mark.
    const deadline = Date.now() + 90_000;

    // Bulk upsert in chunks of 500, ignoring duplicates via the
    // UNIQUE(politician_id, associate_id) constraint. One round trip
    // per 500 rows instead of one per row — about 500x fewer.
    for (let i = 0; i < rowList.length; i += 500) {
      if (Date.now() > deadline) break;
      const chunk = rowList.slice(i, i + 500);
      const { data, error } = await supabase
        .from("politician_associations")
        .upsert(chunk, { onConflict: "politician_id,associate_id", ignoreDuplicates: true })
        .select("id");
      if (!error) created += data?.length ?? 0;
    }

    if (runId) {
      await supabase.from("scrape_runs").update({
        status: "completed",
        records_fetched: politicians.length,
        records_created: created,
        completed_at: new Date().toISOString(),
      }).eq("id", runId);
    }

    return new Response(
      JSON.stringify({
        success: true,
        politicians_scanned: politicians.length,
        candidate_pairs: rowList.length,
        inserted: created,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("seed-associations error:", error);
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
