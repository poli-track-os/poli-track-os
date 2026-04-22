#!/usr/bin/env node
// Sync Eurostat macro indicators (GDP, population) into country_demographics.
// Retires the hard-coded EU_COUNTRY_DATA constant in src/pages/Data.tsx.
//
// Datasets:
//   nama_10_gdp  - GDP current prices by country (MIO_EUR, B1GQ aggregate)
//   demo_pjan    - Population on 1 January by age + sex (we pull TOTAL)
//
// Area is NOT in Eurostat — it's a geographic constant. We seed it from a
// static map here and stamp data_source='static'. Updating area values only
// matters when countries redraw their borders, which is rare.
//
// Usage:
//   node --experimental-strip-types scripts/sync-eurostat-macro.ts [--apply] [--countries DE,FR]

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { createClient } from '@supabase/supabase-js';
import { EUROSTAT_SUPPORTED_GEOS, toEurostatGeoCode } from '../src/lib/eurostat-geo.ts';
import { jsonStatToPresentRecords, type JsonStatDataset } from '../src/lib/jsonstat-parser.ts';

const EUROSTAT_API = 'https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data';

// Static area in km² — rare-change data, not worth an ingestion pipeline.
// Sources: Eurostat dictionary (https://ec.europa.eu/eurostat/cache/metadata/en/reg_area3_esms.htm)
// and World Bank. Accurate to ~1%.
const AREA_KM2: Record<string, number> = {
  AT: 83879,   BE: 30528,   BG: 110879,  CY: 9251,    CZ: 78867,
  DE: 357592,  DK: 42944,   EE: 45227,   ES: 505944,  FI: 338455,
  FR: 643801,  GR: 131957,  HR: 56594,   HU: 93012,   IE: 69825,
  IT: 301339,  LT: 65300,   LU: 2586,    LV: 64589,   MT: 316,
  NL: 41850,   PL: 312696,  PT: 92212,   RO: 238397,  SE: 450295,
  SI: 20273,   SK: 49035,   EU27_2020: 4233262,
};

type Args = {
  apply: boolean;
  countries: readonly string[];
  expectProjectRef: string | null;
};

function parseArgs(argv: string[]): Args {
  const args: Args = {
    apply: false,
    countries: [...EUROSTAT_SUPPORTED_GEOS],
    expectProjectRef: null,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const t = argv[i];
    if (t === '--apply') { args.apply = true; continue; }
    if (t === '--countries') {
      const next = argv[++i];
      if (!next) throw new Error('Missing value for --countries');
      args.countries = next.split(',').map((v) => v.trim()).filter(Boolean);
      continue;
    }
    if (t === '--expect-project-ref') {
      const next = argv[++i];
      if (!next) throw new Error('Missing value for --expect-project-ref');
      args.expectProjectRef = next.trim();
      continue;
    }
    if (t === '--help' || t === '-h') {
      console.log('scripts/sync-eurostat-macro.ts [--apply] [--countries DE,FR]');
      process.exit(0);
    }
    throw new Error(`Unknown argument: ${t}`);
  }
  return args;
}

function loadEnvFile(filePath: string, shellEnvKeys: Set<string>, overwrite = false) {
  if (!fs.existsSync(filePath)) return;
  const content = fs.readFileSync(filePath, 'utf8');
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const sep = line.indexOf('=');
    if (sep === -1) continue;
    const key = line.slice(0, sep).trim();
    let value = line.slice(sep + 1).trim();
    if (!key) continue;
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (shellEnvKeys.has(key)) continue;
    if (!overwrite && process.env[key]) continue;
    process.env[key] = value;
  }
}

function loadLocalEnv() {
  const root = process.cwd();
  const shellEnvKeys = new Set(Object.keys(process.env));
  loadEnvFile(path.join(root, '.env'), shellEnvKeys);
  loadEnvFile(path.join(root, '.env.local'), shellEnvKeys, true);
}

function getSupabaseClient(apply: boolean) {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  if (!url) throw new Error('Missing SUPABASE_URL or VITE_SUPABASE_URL');
  const key = apply
    ? process.env.SUPABASE_SERVICE_ROLE_KEY
    : process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  if (!key) throw new Error('Missing credentials');
  return createClient(url!, key!, { auth: { persistSession: false, autoRefreshToken: false } });
}

async function fetchGdp(geo: string): Promise<{ url: string; doc: JsonStatDataset }> {
  const requestGeo = toEurostatGeoCode(geo);
  const params = new URLSearchParams({
    format: 'JSON',
    lang: 'EN',
    na_item: 'B1GQ',    // Gross domestic product at market prices
    unit: 'CP_MEUR',    // Current prices, million euro
    geo: requestGeo,
  });
  const url = `${EUROSTAT_API}/nama_10_gdp?${params.toString()}`;
  const res = await fetch(url, { headers: { 'User-Agent': 'poli-track sync-eurostat-macro' }, signal: AbortSignal.timeout(30_000) });
  if (!res.ok) throw new Error(`Eurostat GDP ${res.status} for ${requestGeo}`);
  return { url, doc: await res.json() };
}

async function fetchPopulation(geo: string): Promise<{ url: string; doc: JsonStatDataset }> {
  const requestGeo = toEurostatGeoCode(geo);
  const params = new URLSearchParams({
    format: 'JSON',
    lang: 'EN',
    age: 'TOTAL',
    sex: 'T',
    geo: requestGeo,
  });
  const url = `${EUROSTAT_API}/demo_pjan?${params.toString()}`;
  const res = await fetch(url, { headers: { 'User-Agent': 'poli-track sync-eurostat-macro' }, signal: AbortSignal.timeout(30_000) });
  if (!res.ok) throw new Error(`Eurostat population ${res.status} for ${requestGeo}`);
  return { url, doc: await res.json() };
}

type DemographicsRow = {
  country_code: string;
  year: number;
  population: number | null;
  gdp_million_eur: number | null;
  gdp_per_capita_eur: number | null;
  area_km2: number | null;
  data_source: string;
  source_url: string;
};

function buildRowsFromDatasets(
  geo: string,
  gdp: { url: string; doc: JsonStatDataset } | null,
  pop: { url: string; doc: JsonStatDataset } | null,
): DemographicsRow[] {
  const gdpByYear = new Map<number, number>();
  if (gdp) {
    for (const r of jsonStatToPresentRecords(gdp.doc)) {
      const year = parseInt(r.labels.time, 10);
      if (Number.isFinite(year) && r.value !== null) gdpByYear.set(year, r.value);
    }
  }
  const popByYear = new Map<number, number>();
  if (pop) {
    for (const r of jsonStatToPresentRecords(pop.doc)) {
      const year = parseInt(r.labels.time, 10);
      if (Number.isFinite(year) && r.value !== null) popByYear.set(year, r.value);
    }
  }

  const allYears = new Set<number>([...gdpByYear.keys(), ...popByYear.keys()]);
  const rows: DemographicsRow[] = [];
  for (const year of allYears) {
    const population = popByYear.get(year) ?? null;
    const gdpMio = gdpByYear.get(year) ?? null;
    const perCapita = population && gdpMio ? (gdpMio * 1_000_000) / population : null;
    rows.push({
      country_code: geo,
      year,
      population: population !== null ? Math.round(population) : null,
      gdp_million_eur: gdpMio,
      gdp_per_capita_eur: perCapita !== null ? Math.round(perCapita) : null,
      area_km2: AREA_KM2[geo] ?? null,
      data_source: 'eurostat_macro',
      source_url: gdp?.url || pop?.url || '',
    });
  }
  rows.sort((a, b) => a.year - b.year);
  return rows;
}

async function ensureRunLog(supabase: ReturnType<typeof createClient>): Promise<string | null> {
  const { data, error } = await supabase
    .from('scrape_runs')
    .insert({ source_type: 'eurostat_macro', status: 'running' })
    .select('id')
    .single();
  if (error) { console.error('ensureRunLog failed:', error.message); return null; }
  return (data as { id: string }).id;
}

async function updateRunLog(
  supabase: ReturnType<typeof createClient>,
  runId: string | null,
  payload: { status: 'completed' | 'failed'; records_fetched: number; records_created?: number; records_updated?: number; error_message?: string | null },
) {
  if (!runId) return;
  await supabase.from('scrape_runs').update({ ...payload, completed_at: new Date().toISOString() }).eq('id', runId);
}

async function main() {
  loadLocalEnv();
  const args = parseArgs(process.argv.slice(2));
  const supabase = getSupabaseClient(args.apply);
  const runId = args.apply ? await ensureRunLog(supabase) : null;

  const allRows: DemographicsRow[] = [];
  let totalFetched = 0;

  try {
    for (const geo of args.countries) {
      console.error(`  -> fetching geo=${geo}`);
      // Run GDP + population in parallel per geo; tolerate failures on
      // either individually (e.g. population for EU27_2020 may not exist).
      const [gdpRes, popRes] = await Promise.allSettled([fetchGdp(geo), fetchPopulation(geo)]);
      const gdp = gdpRes.status === 'fulfilled' ? gdpRes.value : null;
      const pop = popRes.status === 'fulfilled' ? popRes.value : null;
      if (gdpRes.status === 'rejected') console.error(`    gdp error: ${gdpRes.reason}`);
      if (popRes.status === 'rejected') console.error(`    pop error: ${popRes.reason}`);
      const rows = buildRowsFromDatasets(geo, gdp, pop);
      totalFetched += rows.length;
      allRows.push(...rows);
    }

    console.error(`fetched ${totalFetched} rows across ${args.countries.length} geos`);

    if (!args.apply) {
      console.log(JSON.stringify({ apply: false, countries: args.countries, rows: totalFetched, sample: allRows.slice(-5) }, null, 2));
      await updateRunLog(supabase, runId, { status: 'completed', records_fetched: totalFetched, records_created: 0 });
      return;
    }

    let inserted = 0;
    let updated = 0;
    const chunkSize = 500;
    for (let i = 0; i < allRows.length; i += chunkSize) {
      const chunk = allRows.slice(i, i + chunkSize);
      const { data, error } = await supabase
        .from('country_demographics')
        .upsert(chunk, { onConflict: 'country_code,year' })
        .select('created_at, updated_at');
      if (error) throw error;
      const rows = (data as { created_at: string; updated_at: string }[] | null) ?? [];
      for (const r of rows) {
        if (new Date(r.updated_at).getTime() - new Date(r.created_at).getTime() < 1000) inserted += 1;
        else updated += 1;
      }
    }

    await supabase.rpc('increment_total_records', { p_source_type: 'eurostat_macro', p_delta: inserted });
    await updateRunLog(supabase, runId, { status: 'completed', records_fetched: totalFetched, records_created: inserted, records_updated: updated });

    console.log(JSON.stringify({ apply: true, countries: args.countries, rows: totalFetched, inserted, updated }, null, 2));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('sync-eurostat-macro error:', msg);
    await updateRunLog(supabase, runId, { status: 'failed', records_fetched: totalFetched, error_message: msg });
    throw err;
  }
}

main().catch((err) => { console.error(err); process.exit(1); });
