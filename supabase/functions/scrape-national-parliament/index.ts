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

const WIKI_API = "https://en.wikipedia.org/w/api.php";

// Wikipedia categories for current parliament members per EU country
// Format: { countryCode: { category, parliament, role, partyCategory? } }
const PARLIAMENT_CONFIG: Record<string, {
  categories: string[];
  parliament: string;
  role: string;
  countryName: string;
}> = {
  PT: {
    categories: ["Members of the 17th Assembly of the Republic (Portugal)"],
    parliament: "Assembleia da República",
    role: "Member of Parliament",
    countryName: "Portugal",
  },
  DE: {
    categories: ["Members of the Bundestag 2025–2029"],
    parliament: "Bundestag",
    role: "Member of Bundestag",
    countryName: "Germany",
  },
  FR: {
    categories: ["Deputies of the 17th National Assembly of the French Fifth Republic"],
    parliament: "Assemblée nationale",
    role: "Member of National Assembly",
    countryName: "France",
  },
  IT: {
    categories: ["Deputies of Legislature XIX of Italy", "Senators of Legislature XIX of Italy"],
    parliament: "Parlamento italiano",
    role: "Member of Parliament",
    countryName: "Italy",
  },
  ES: {
    categories: ["Members of the 15th Congress of Deputies (Spain)"],
    parliament: "Congreso de los Diputados",
    role: "Member of Congress",
    countryName: "Spain",
  },
  PL: {
    categories: ["Members of the Polish Sejm 2023–2027"],
    parliament: "Sejm",
    role: "Member of Sejm",
    countryName: "Poland",
  },
  NL: {
    categories: ["Dutch MPs 2025–present"],
    parliament: "Tweede Kamer",
    role: "Member of House of Representatives",
    countryName: "Netherlands",
  },
  BE: {
    categories: ["Members of the 56th Chamber of Representatives (Belgium)"],
    parliament: "Chambre des représentants",
    role: "Member of Federal Parliament",
    countryName: "Belgium",
  },
  CZ: {
    categories: ["Members of the Chamber of Deputies of the Czech Republic (2021–2025)"],
    parliament: "Poslanecká sněmovna",
    role: "Member of Chamber of Deputies",
    countryName: "Czechia",
  },
  GR: {
    categories: ["Greek MPs 2023–"],
    parliament: "Hellenic Parliament",
    role: "Member of Hellenic Parliament",
    countryName: "Greece",
  },
  SE: {
    categories: ["Members of the Riksdag 2022–2026"],
    parliament: "Riksdag",
    role: "Member of Riksdag",
    countryName: "Sweden",
  },
  HU: {
    categories: ["Members of the National Assembly of Hungary (2022–2026)"],
    parliament: "Országgyűlés",
    role: "Member of National Assembly",
    countryName: "Hungary",
  },
  AT: {
    categories: ["Members of the 28th National Council (Austria)"],
    parliament: "Nationalrat",
    role: "Member of National Council",
    countryName: "Austria",
  },
  BG: {
    categories: ["Members of the National Assembly (Bulgaria)"],
    parliament: "National Assembly",
    role: "Member of National Assembly",
    countryName: "Bulgaria",
  },
  DK: {
    categories: ["Members of the Folketing"],
    parliament: "Folketing",
    role: "Member of Folketing",
    countryName: "Denmark",
  },
  FI: {
    categories: ["Members of the Parliament of Finland (2023–2027)"],
    parliament: "Eduskunta",
    role: "Member of Parliament",
    countryName: "Finland",
  },
  SK: {
    categories: ["Members of the National Council (Slovakia) 2023–2027"],
    parliament: "Národná rada",
    role: "Member of National Council",
    countryName: "Slovakia",
  },
  IE: {
    categories: ["Members of the 34th Dáil"],
    parliament: "Dáil Éireann",
    role: "Teachta Dála",
    countryName: "Ireland",
  },
  SI: {
    categories: ["Members of the 9th National Assembly of Slovenia"],
    parliament: "Državni zbor",
    role: "Member of National Assembly",
    countryName: "Slovenia",
  },
  LV: {
    categories: ["Deputies of the 14th Saeima"],
    parliament: "Saeima",
    role: "Member of Saeima",
    countryName: "Latvia",
  },
  CY: {
    categories: ["Members of the House of Representatives (Cyprus)"],
    parliament: "House of Representatives",
    role: "Member of House of Representatives",
    countryName: "Cyprus",
  },
  LU: {
    categories: ["Members of the Chamber of Deputies (Luxembourg)"],
    parliament: "Chambre des Députés",
    role: "Member of Chamber of Deputies",
    countryName: "Luxembourg",
  },
  HR: {
    categories: ["Representatives in the modern Croatian Parliament"],
    parliament: "Hrvatski sabor",
    role: "Member of Parliament",
    countryName: "Croatia",
  },
  EE: {
    categories: ["Members of the Riigikogu, 2023–2027"],
    parliament: "Riigikogu",
    role: "Member of Riigikogu",
    countryName: "Estonia",
  },
  LT: {
    categories: ["Members of the Seimas"],
    parliament: "Seimas",
    role: "Member of Seimas",
    countryName: "Lithuania",
  },
  MT: {
    categories: ["Members of the House of Representatives of Malta"],
    parliament: "House of Representatives of Malta",
    role: "Member of House of Representatives",
    countryName: "Malta",
  },
  RO: {
    categories: [
      "Members of the Chamber of Deputies (Romania)",
      "Members of the Senate of Romania",
    ],
    parliament: "Parlamentul României",
    role: "Member of Parliament",
    countryName: "Romania",
  },
};

async function getCategoryMembers(category: string): Promise<string[]> {
  const members: string[] = [];
  let cmcontinue: string | undefined;

  for (let i = 0; i < 10; i++) { // max 10 pages of results
    const params = new URLSearchParams({
      action: "query",
      list: "categorymembers",
      cmtitle: `Category:${category}`,
      cmtype: "page",
      cmnamespace: "0",
      cmlimit: "500",
      format: "json",
      origin: "*",
    });
    if (cmcontinue) params.set("cmcontinue", cmcontinue);

    const res = await fetch(`${WIKI_API}?${params}`, {
      headers: { "User-Agent": "PoliticalTracker/1.0" },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) break;
    const data = await res.json();
    const cms = data?.query?.categorymembers || [];
    for (const cm of cms) {
      // Filter out non-person pages (lists, categories, etc.)
      if (!cm.title.startsWith("List of") && !cm.title.startsWith("Category:") && !cm.title.includes("election")) {
        members.push(cm.title);
      }
    }
    cmcontinue = data?.continue?.cmcontinue;
    if (!cmcontinue) break;
  }

  return members;
}

async function getWikiSummaries(titles: string[]): Promise<Map<string, { extract: string; description: string; image: string | null }>> {
  const results = new Map();
  // Process in chunks of 20
  for (let i = 0; i < titles.length; i += 20) {
    const chunk = titles.slice(i, i + 20);
    const params = new URLSearchParams({
      action: "query",
      titles: chunk.join("|"),
      prop: "extracts|pageimages|description",
      exintro: "true",
      explaintext: "true",
      exlimit: String(chunk.length),
      piprop: "thumbnail",
      pithumbsize: "400",
      format: "json",
      origin: "*",
    });

    try {
      const res = await fetch(`${WIKI_API}?${params}`, {
        headers: { "User-Agent": "PoliticalTracker/1.0" },
        signal: AbortSignal.timeout(15000),
      });
      if (!res.ok) continue;
      const data = await res.json();
      const pages = data?.query?.pages || {};
      for (const page of Object.values(pages) as any[]) {
        if (page.pageid) {
          results.set(page.title, {
            extract: page.extract || "",
            description: page.description || "",
            image: page.thumbnail?.source || null,
          });
        }
      }
    } catch { /* skip chunk */ }
    // Rate limit
    await new Promise(r => setTimeout(r, 200));
  }
  return results;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  let countryCode = "";
  let batchSize = 100;
  let offset = 0;
  let skipEnrichment = false;

  try {
    const body = await req.json();
    countryCode = (body.countryCode || "").toUpperCase();
    batchSize = Math.min(body.batchSize || 100, 200);
    offset = body.offset || 0;
    skipEnrichment = body.skipEnrichment || false;
  } catch { /* defaults */ }

  if (!countryCode || !PARLIAMENT_CONFIG[countryCode]) {
    return new Response(JSON.stringify({
      success: false,
      error: `Invalid or unsupported country code: ${countryCode}`,
      supported: Object.keys(PARLIAMENT_CONFIG),
    }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  const config = PARLIAMENT_CONFIG[countryCode];
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const { data: run } = await supabase
    .from("scrape_runs")
    .insert({ source_type: "parliamentary_record", status: "running" })
    .select()
    .single();
  const runId = run?.id;

  try {
    // Step 1: Get all members from Wikipedia categories
    console.log(`Fetching ${config.parliament} members for ${config.countryName}...`);
    let allMembers: string[] = [];
    for (const cat of config.categories) {
      const members = await getCategoryMembers(cat);
      allMembers = allMembers.concat(members);
      console.log(`Category "${cat}": ${members.length} members`);
    }

    // Deduplicate
    allMembers = [...new Set(allMembers)];
    console.log(`Total unique members found: ${allMembers.length}`);

    // Step 2: Process batch
    const batch = allMembers.slice(offset, offset + batchSize);
    if (batch.length === 0) {
      await supabase.from("scrape_runs").update({
        status: "completed", records_fetched: allMembers.length,
        records_created: 0, records_updated: 0,
        completed_at: new Date().toISOString(),
      }).eq("id", runId);

      return new Response(JSON.stringify({
        success: true, total_members: allMembers.length,
        batch_processed: 0, message: "No more members to process",
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Step 3: Look up existing rows for this country so we can split the
    // batch into "create" vs "update" deterministically. We dedupe by name
    // within a country only — cross-country collisions are rare at this
    // granularity and the name is the only stable key Wikipedia gives us
    // until P1.5 fills external_id with the Wikidata ID.
    const { data: existingPols } = await supabase
      .from("politicians")
      .select("id, name")
      .eq("country_code", countryCode)
      .in("name", batch);
    const existingByName = new Map<string, string>();
    for (const row of existingPols || []) existingByName.set(row.name, row.id);

    const toInsert = batch
      .filter((name) => !existingByName.has(name))
      .map((name) => ({
        name,
        country_code: countryCode,
        country_name: config.countryName,
        role: config.role,
        jurisdiction: "federal",
        continent: "Europe",
        data_source: "parliamentary_record" as const,
        source_url: `https://en.wikipedia.org/wiki/${encodeURIComponent(name.replace(/ /g, "_"))}`,
        wikipedia_url: `https://en.wikipedia.org/wiki/${encodeURIComponent(name.replace(/ /g, "_"))}`,
      }));

    const createdIds: string[] = [];
    if (toInsert.length > 0) {
      // P2.4: chunked insert, collect ids for P2.7 enrichment chain
      for (let i = 0; i < toInsert.length; i += 50) {
        const chunk = toInsert.slice(i, i + 50);
        const { data, error } = await supabase
          .from("politicians")
          .insert(chunk)
          .select("id");
        if (error) throw error;
        for (const row of data || []) createdIds.push(row.id);
      }
    }

    const created = createdIds.length;
    const updated = 0;

    const hasMore = offset + batchSize < allMembers.length;

    await supabase.from("scrape_runs").update({
      status: "completed",
      records_fetched: allMembers.length,
      records_created: created,
      records_updated: updated,
      completed_at: new Date().toISOString(),
    }).eq("id", runId);

    // P2.5: cumulative counter
    await supabase.rpc("increment_total_records", {
      p_source_type: "parliamentary_record",
      p_delta: created,
    });

    // P2.7: chain enrich-wikipedia with explicit ids, not a bare batchSize
    if (createdIds.length > 0) {
      const enrichUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/enrich-wikipedia`;
      fetch(enrichUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
        },
        body: JSON.stringify({
          politicianIds: createdIds.slice(0, 20),
          parentRunId: runId,
        }),
      }).catch(() => {});
    }

    return new Response(JSON.stringify({
      success: true,
      country: config.countryName,
      parliament: config.parliament,
      total_members: allMembers.length,
      batch_processed: batch.length,
      created,
      updated,
      next_offset: hasMore ? offset + batchSize : null,
      has_more: hasMore,
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
