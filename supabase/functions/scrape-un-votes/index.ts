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

const UN_SEARCH = "https://digitallibrary.un.org/search";
const UN_RECORD = "https://digitallibrary.un.org/record";

// UN member-state names → ISO2 for countries we track.
// The UN record HTML lists votes as "Y COUNTRY NAME", "N COUNTRY NAME", "A COUNTRY NAME".
// Country names here must match the EXACT casing/spelling used in UN DL record pages.
const UN_COUNTRY_TO_ISO: Record<string, string> = {
  AUSTRIA: "AT", BELGIUM: "BE", BULGARIA: "BG", CROATIA: "HR",
  CYPRUS: "CY", "CZECH REPUBLIC": "CZ", CZECHIA: "CZ", DENMARK: "DK",
  ESTONIA: "EE", FINLAND: "FI", FRANCE: "FR", GERMANY: "DE",
  GREECE: "GR", HUNGARY: "HU", IRELAND: "IE", ITALY: "IT",
  LATVIA: "LV", LITHUANIA: "LT", LUXEMBOURG: "LU", MALTA: "MT",
  NETHERLANDS: "NL", POLAND: "PL", PORTUGAL: "PT", ROMANIA: "RO",
  SLOVAKIA: "SK", SLOVENIA: "SI", SPAIN: "ES", SWEDEN: "SE",
};

interface ResolutionRef {
  recid: string;
  symbol: string;
}

interface CountryVote {
  countryCode: string;
  vote: "yes" | "no" | "abstain";
}

async function fetchResolutionList(limit: number): Promise<ResolutionRef[]> {
  const url = `${UN_SEARCH}?ln=en&cc=Voting+Data&sf=latest+first&so=d&rg=${limit}&c=Voting+Data&fct__2=General+Assembly&of=hx`;
  const res = await fetch(url, {
    headers: { "User-Agent": "PoliticalTracker/1.0" },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`UN search failed: ${res.status}`);

  const body = await res.text();
  const records: ResolutionRef[] = [];
  // The "hx" (HTML brief) view exposes both record IDs and resolution symbols
  const recidPattern = /\/record\/(\d+)/g;
  const symbolPattern = /A\/RES\/\d+\/\d+/g;
  const recids = [...new Set((body.match(recidPattern) || []).map((m) => m.replace("/record/", "")))];
  const symbols = [...new Set(body.match(symbolPattern) || [])];

  const n = Math.min(recids.length, limit);
  for (let i = 0; i < n; i++) {
    records.push({
      recid: recids[i],
      symbol: symbols[i] || "",
    });
  }
  return records;
}

async function fetchResolutionVotes(recid: string): Promise<{
  title: string;
  date: string | null;
  votes: CountryVote[];
} | null> {
  const url = `${UN_RECORD}/${recid}?ln=en&of=hx`;
  const res = await fetch(url, {
    headers: { "User-Agent": "PoliticalTracker/1.0" },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) return null;

  const body = await res.text();

  // Title: <title>…</title>
  const titleMatch = body.match(/<title>([^<]+)<\/title>/);
  const title = titleMatch ? titleMatch[1].replace(/\s+/g, " ").trim() : "UN General Assembly Vote";

  // Resolution date: MARC "269__" or visible "Vote date: YYYY-MM-DD"
  const dateMatch = body.match(/Vote date[:\s]*([0-9]{4}-[0-9]{2}-[0-9]{2})/i);
  const date = dateMatch ? dateMatch[1] : null;

  // Votes: per-country lines prefixed with Y / N / A (case-sensitive in the MARC export)
  // Example visible format: "Y FRANCE", "N UNITED STATES", "A CHINA"
  const votes: CountryVote[] = [];
  const lines = body.split(/\r?\n/);
  for (const raw of lines) {
    const line = raw.replace(/<[^>]+>/g, "").trim();
    const m = line.match(/^([YNA])\s+(.+?)$/);
    if (!m) continue;
    const marker = m[1];
    const country = m[2].toUpperCase().trim();
    const iso = UN_COUNTRY_TO_ISO[country];
    if (!iso) continue;
    const vote: "yes" | "no" | "abstain" =
      marker === "Y" ? "yes" : marker === "N" ? "no" : "abstain";
    votes.push({ countryCode: iso, vote });
  }

  return { title, date, votes };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { data: run } = await supabase
    .from("scrape_runs")
    .insert({ source_type: "un_digital_library", status: "running" })
    .select()
    .single();

  const runId = run?.id;
  let resolutionsFetched = 0;
  let eventsCreated = 0;
  let skippedNoVotes = 0;

  try {
    // Politicians grouped by country
    const { data: politicians } = await supabase
      .from("politicians")
      .select("id, country_code, country_name");

    const byCountry = new Map<string, { id: string; country_name: string }[]>();
    for (const p of politicians || []) {
      const cc = p.country_code?.toUpperCase();
      if (!cc) continue;
      const arr = byCountry.get(cc) || [];
      arr.push({ id: p.id, country_name: p.country_name });
      byCountry.set(cc, arr);
    }

    const resolutions = await fetchResolutionList(10);
    resolutionsFetched = resolutions.length;

    for (const ref of resolutions) {
      const detail = await fetchResolutionVotes(ref.recid);
      // Rate limit: UN DL
      await new Promise((r) => setTimeout(r, 500));
      if (!detail || detail.votes.length === 0) {
        skippedNoVotes++;
        continue;
      }

      for (const v of detail.votes) {
        const pols = byCountry.get(v.countryCode);
        if (!pols || pols.length === 0) continue;

        // We do not know which individual legislator cast the UN vote —
        // delegations vote as a country. Attribute the country-level vote
        // to every tracked politician from that country as a public record
        // of how their country voted, stored with the actual per-country
        // outcome (yes/no/abstain).
        for (const pol of pols) {
          const desc =
            `Country vote at UN General Assembly` +
            (ref.symbol ? ` (${ref.symbol})` : "") +
            `: ${pol.country_name} voted ${v.vote.toUpperCase()}. ` +
            `Delegations vote as a country; this is the national position, not an individual legislator's vote.`;

          // Upsert with the idempotency key from the new partial unique
          // index so reruns don't duplicate the same country-vote pair.
          const { data: inserted, error } = await supabase
            .from("political_events")
            .upsert(
              {
                politician_id: pol.id,
                event_type: "vote",
                title: `UN GA vote${ref.symbol ? ` ${ref.symbol}` : ""}: ${detail.title.substring(0, 140)}`,
                description: desc,
                source: "official_record",
                source_url: `${UN_RECORD}/${ref.recid}`,
                event_timestamp: detail.date ? `${detail.date}T00:00:00Z` : new Date().toISOString(),
                raw_data: {
                  resolution: ref.symbol,
                  recid: ref.recid,
                  country_code: v.countryCode,
                  country_vote: v.vote,
                },
                sentiment: null,
                entities: [],
                evidence_count: 1,
                // UN country-level votes come from the authoritative source.
                trust_level: 1,
              },
              { onConflict: "politician_id,source_url,event_timestamp", ignoreDuplicates: true },
            )
            .select("id");
          if (!error && inserted && inserted.length > 0) eventsCreated++;
        }
      }
    }

    await supabase
      .from("scrape_runs")
      .update({
        status: "completed",
        records_fetched: resolutionsFetched,
        records_created: eventsCreated,
        error_message: skippedNoVotes > 0
          ? `${skippedNoVotes} resolutions skipped (no parseable per-country votes)`
          : null,
        completed_at: new Date().toISOString(),
      })
      .eq("id", runId);

    await supabase
      .from("data_sources")
      .update({
        last_synced_at: new Date().toISOString(),
        total_records: eventsCreated,
      })
      .eq("source_type", "un_digital_library");

    return new Response(
      JSON.stringify({
        success: true,
        resolutions_fetched: resolutionsFetched,
        events_created: eventsCreated,
        resolutions_skipped_no_votes: skippedNoVotes,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("UN scrape error:", error);
    if (runId) {
      await supabase
        .from("scrape_runs")
        .update({
          status: "failed",
          error_message: serializeError(error),
          completed_at: new Date().toISOString(),
        })
        .eq("id", runId);
    }

    return new Response(
      JSON.stringify({
        success: false,
        error: serializeError(error),
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
