import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { loadCountryMetadata, type CountryMetadata } from "../../../src/lib/country-metadata-live.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const USER_AGENT = "PoliTrackCountrySync/1.0 (https://github.com/BlueVelvetSackOfGoldPotatoes/poli-track)";
const DEFAULT_STALE_AFTER_HOURS = 24 * 6;

function serializeError(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "object" && error !== null) {
    try {
      return JSON.stringify(error);
    } catch {
      return String(error);
    }
  }
  return String(error);
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isMeaningfulMetadata(metadata: CountryMetadata) {
  return Boolean(
    metadata.entityId ||
    metadata.wikipediaUrl ||
    metadata.summary ||
    metadata.capital ||
    metadata.headOfState ||
    metadata.headOfGovernment ||
    metadata.officeholders?.length,
  );
}

async function loadTrackedCountries(
  supabase: ReturnType<typeof createClient>,
  requestedCode?: string,
  requestedName?: string,
) {
  const normalizedRequestedCode = requestedCode?.trim().toUpperCase();
  if (normalizedRequestedCode && requestedName?.trim()) {
    return [{ country_code: normalizedRequestedCode, country_name: requestedName.trim() }];
  }

  const { data, error } = await supabase
    .from("politicians")
    .select("country_code, country_name")
    .not("country_code", "is", null)
    .not("country_name", "is", null)
    .order("country_code", { ascending: true });

  if (error) throw error;

  const unique = new Map<string, { country_code: string; country_name: string }>();
  for (const row of data || []) {
    const countryCode = row.country_code?.trim().toUpperCase();
    const countryName = row.country_name?.trim();
    if (!countryCode || !countryName) continue;
    if (normalizedRequestedCode && countryCode !== normalizedRequestedCode) continue;
    if (!unique.has(countryCode)) {
      unique.set(countryCode, { country_code: countryCode, country_name: countryName });
    }
  }

  if (unique.size > 0 || !normalizedRequestedCode) {
    return [...unique.values()];
  }

  const { data: existingCountry, error: existingCountryError } = await supabase
    .from("country_metadata")
    .select("country_code, country_name")
    .eq("country_code", normalizedRequestedCode)
    .maybeSingle();

  if (existingCountryError) throw existingCountryError;

  return existingCountry ? [{ country_code: existingCountry.country_code, country_name: existingCountry.country_name }] : [];
}

function buildCountryMetadataRow(metadata: CountryMetadata, syncedAt: string) {
  return {
    country_code: metadata.countryCode,
    country_name: metadata.countryName,
    entity_id: metadata.entityId ?? null,
    wikipedia_title: metadata.wikipediaTitle ?? null,
    wikipedia_url: metadata.wikipediaUrl ?? null,
    description: metadata.description ?? null,
    summary: metadata.summary ?? null,
    capital: metadata.capital ?? null,
    head_of_state: metadata.headOfState ?? null,
    head_of_government: metadata.headOfGovernment ?? null,
    population: metadata.population ?? null,
    area_km2: metadata.areaKm2 ?? null,
    coordinates: metadata.coordinates ?? null,
    flag_emoji: metadata.flagEmoji,
    flag_image_url: metadata.flagImageUrl ?? null,
    locator_map_url: metadata.locatorMapUrl ?? null,
    officeholders: metadata.officeholders ?? [],
    source_updated_at: syncedAt,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) {
    return new Response(JSON.stringify({ error: "Missing Supabase environment variables." }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);
  const requestBody = req.method === "POST"
    ? await req.json().catch(() => ({}))
    : {};

  const requestedCode = typeof requestBody.countryCode === "string" ? requestBody.countryCode : undefined;
  const requestedName = typeof requestBody.countryName === "string" ? requestBody.countryName : undefined;
  const force = requestBody.force === true;
  const staleAfterHours = typeof requestBody.staleAfterHours === "number" && requestBody.staleAfterHours > 0
    ? requestBody.staleAfterHours
    : DEFAULT_STALE_AFTER_HOURS;

  const { data: sourceRow } = await supabase
    .from("data_sources")
    .select("id")
    .eq("source_type", "wikipedia")
    .limit(1)
    .maybeSingle();

  const { data: run } = await supabase
    .from("scrape_runs")
    .insert({
      source_id: sourceRow?.id ?? null,
      source_type: "wikipedia",
      status: "running",
    })
    .select("id")
    .single();

  const runId = run?.id;

  try {
    const trackedCountries = await loadTrackedCountries(supabase, requestedCode, requestedName);
    const countryCodes = trackedCountries.map((country) => country.country_code);
    const existingRows = new Map<string, { updated_at: string }>();

    if (countryCodes.length > 0) {
      const { data: cachedRows, error: cachedRowsError } = await supabase
        .from("country_metadata")
        .select("country_code, updated_at")
        .in("country_code", countryCodes);

      if (cachedRowsError) throw cachedRowsError;
      for (const row of cachedRows || []) {
        existingRows.set(row.country_code, { updated_at: row.updated_at });
      }
    }

    const cutoffMs = Date.now() - staleAfterHours * 60 * 60 * 1000;
    const targets = trackedCountries.filter((country) => {
      if (force) return true;
      const existing = existingRows.get(country.country_code);
      if (!existing?.updated_at) return true;
      const updatedAtMs = new Date(existing.updated_at).getTime();
      return Number.isNaN(updatedAtMs) || updatedAtMs < cutoffMs;
    });

    let recordsCreated = 0;
    let recordsUpdated = 0;
    let recordsFailed = 0;
    const statuses: Array<{ countryCode: string; countryName: string; status: string; detail?: string }> = [];

    for (const target of targets) {
      const syncedAt = new Date().toISOString();

      try {
        const metadata = await loadCountryMetadata(target.country_code, target.country_name, {
          headers: {
            "User-Agent": USER_AGENT,
          },
          timeoutMs: 15000,
        });

        if (!isMeaningfulMetadata(metadata)) {
          statuses.push({
            countryCode: target.country_code,
            countryName: target.country_name,
            status: "skipped",
            detail: "No authoritative metadata was returned from Wikimedia.",
          });
          await sleep(150);
          continue;
        }

        const { error: upsertError } = await supabase
          .from("country_metadata")
          .upsert(buildCountryMetadataRow(metadata, syncedAt), { onConflict: "country_code" });

        if (upsertError) throw upsertError;

        if (existingRows.has(target.country_code)) {
          recordsUpdated += 1;
          statuses.push({ countryCode: target.country_code, countryName: target.country_name, status: "updated" });
        } else {
          recordsCreated += 1;
          statuses.push({ countryCode: target.country_code, countryName: target.country_name, status: "created" });
        }
      } catch (error) {
        recordsFailed += 1;
        statuses.push({
          countryCode: target.country_code,
          countryName: target.country_name,
          status: "failed",
          detail: serializeError(error),
        });
      }

      await sleep(150);
    }

    await supabase.rpc("increment_total_records", {
      p_source_type: "wikipedia",
      p_delta: recordsCreated + recordsUpdated,
    });

    if (runId) {
      await supabase
        .from("scrape_runs")
        .update({
          status: recordsFailed > 0 && (recordsCreated > 0 || recordsUpdated > 0) ? "partial" : recordsFailed > 0 ? "failed" : "completed",
          records_fetched: targets.length,
          records_created: recordsCreated,
          records_updated: recordsUpdated,
          error_message: recordsFailed > 0
            ? `${recordsFailed} country syncs failed. See response payload for details.`
            : null,
          completed_at: new Date().toISOString(),
        })
        .eq("id", runId);
    }

    return new Response(JSON.stringify({
      ok: recordsFailed === 0,
      scannedCountries: trackedCountries.length,
      refreshedCountries: targets.length,
      skippedFreshCountries: trackedCountries.length - targets.length,
      recordsCreated,
      recordsUpdated,
      recordsFailed,
      statuses,
    }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
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

    return new Response(JSON.stringify({ error: serializeError(error) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
