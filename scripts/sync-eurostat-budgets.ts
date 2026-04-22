#!/usr/bin/env node
// Sync Eurostat COFOG (general government expenditure by function) into
// `government_expenditure`. Pulls three units (MIO_EUR, PC_GDP, PC_TOT) for
// each of 27 EU member states plus the EU27 aggregate, across every year
// Eurostat currently exposes for the dataset.
//
// Usage:
//   node --experimental-strip-types scripts/sync-eurostat-budgets.ts [--apply] [--countries DE,FR] [--expect-project-ref ref]
//
// Without --apply, runs as a dry-run that reports what would be written.
// Requires SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (--apply) or
// VITE_SUPABASE_PUBLISHABLE_KEY (dry-run).

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { createClient } from '@supabase/supabase-js';
import { EUROSTAT_SUPPORTED_GEOS, toEurostatGeoCode } from '../src/lib/eurostat-geo.ts';
import { jsonStatToPresentRecords, type JsonStatDataset } from '../src/lib/jsonstat-parser.ts';

const EUROSTAT_API = 'https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/gov_10a_exp';

// The 10 COFOG functions + the total, matching the seeded cofog_functions
// reference table.
const COFOG_CODES = [
  'GFTOT',
  'GF01', 'GF02', 'GF03', 'GF04', 'GF05',
  'GF06', 'GF07', 'GF08', 'GF09', 'GF10',
] as const;

// COFOG99 uses 'TOTAL' for the TOTAL aggregate, not 'GFTOT'. Map accordingly
// when building the request but keep our internal code 'GFTOT' for the UI.
const COFOG_REQUEST_CODE: Record<string, string> = {
  GFTOT: 'TOTAL',
  GF01: 'GF01', GF02: 'GF02', GF03: 'GF03', GF04: 'GF04', GF05: 'GF05',
  GF06: 'GF06', GF07: 'GF07', GF08: 'GF08', GF09: 'GF09', GF10: 'GF10',
};

// Display labels kept in sync with cofog_functions_seed migration.
const COFOG_LABELS: Record<string, string> = {
  GFTOT: 'Total expenditure',
  GF01: 'General public services',
  GF02: 'Defence',
  GF03: 'Public order and safety',
  GF04: 'Economic affairs',
  GF05: 'Environmental protection',
  GF06: 'Housing and community',
  GF07: 'Health',
  GF08: 'Recreation, culture, religion',
  GF09: 'Education',
  GF10: 'Social protection',
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
      console.log('scripts/sync-eurostat-budgets.ts [--apply] [--countries DE,FR] [--expect-project-ref ref]');
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
  if (!key) {
    throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY (for --apply) or VITE_SUPABASE_PUBLISHABLE_KEY (for dry-run)');
  }
  return createClient(url!, key!, { auth: { persistSession: false, autoRefreshToken: false } });
}

function parseProjectRef(url: string) {
  try { return new URL(url).hostname.split('.')[0] || null; } catch { return null; }
}

async function fetchEurostatSlice(geo: string, unit: 'MIO_EUR' | 'PC_GDP' | 'PC_TOT'): Promise<{ url: string; doc: JsonStatDataset }> {
  const requestGeo = toEurostatGeoCode(geo);
  const params = new URLSearchParams({
    format: 'JSON',
    lang: 'EN',
    na_item: 'TE',
    sector: 'S13',
    unit,
    geo: requestGeo,
  });
  for (const code of COFOG_CODES) params.append('cofog99', COFOG_REQUEST_CODE[code]);

  const url = `${EUROSTAT_API}?${params.toString()}`;

  // Eurostat is generally fast but can rate-limit; retry on 429/5xx.
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const res = await fetch(url, { headers: { 'User-Agent': 'poli-track sync-eurostat-budgets' }, signal: AbortSignal.timeout(30_000) });
    if (res.ok) {
      const doc = await res.json() as JsonStatDataset;
      return { url, doc };
    }
    if (res.status === 429 || (res.status >= 500 && res.status < 600)) {
      const waitMs = 2_000 * (attempt + 1);
      await new Promise((r) => setTimeout(r, waitMs));
      continue;
    }
    throw new Error(`Eurostat ${res.status} for geo=${requestGeo} unit=${unit}: ${await res.text().catch(() => '')}`);
  }
  throw new Error(`Eurostat retry limit exceeded for geo=${requestGeo} unit=${unit}`);
}

type ExpenditureRow = {
  country_code: string;
  year: number;
  cofog_code: string;
  cofog_label: string;
  amount_million_eur: number | null;
  pct_of_gdp: number | null;
  pct_of_total_expenditure: number | null;
  is_provisional: boolean;
  source_url: string;
};

function normalizeCofogCode(raw: string): string {
  // Eurostat uses 'TOTAL' for the aggregate; we store 'GFTOT' internally.
  if (raw === 'TOTAL') return 'GFTOT';
  return raw;
}

function buildRowsFromDatasets(
  geo: string,
  mioEur: { url: string; doc: JsonStatDataset },
  pcGdp: { url: string; doc: JsonStatDataset },
  pcTot: { url: string; doc: JsonStatDataset },
): ExpenditureRow[] {
  // Index each dataset by (cofog, year) -> value + provisional flag.
  const index = (slice: { url: string; doc: JsonStatDataset }) => {
    const map = new Map<string, { value: number | null; provisional: boolean }>();
    for (const r of jsonStatToPresentRecords(slice.doc)) {
      const cofog = normalizeCofogCode(r.labels.cofog99);
      const year = parseInt(r.labels.time, 10);
      map.set(`${cofog}:${year}`, { value: r.value, provisional: r.status === 'p' });
    }
    return map;
  };

  const mioMap = index(mioEur);
  const gdpMap = index(pcGdp);
  const totMap = index(pcTot);

  const keys = new Set<string>([...mioMap.keys(), ...gdpMap.keys(), ...totMap.keys()]);
  const rows: ExpenditureRow[] = [];

  for (const key of keys) {
    const [cofog, yearStr] = key.split(':');
    const year = parseInt(yearStr, 10);
    const mio = mioMap.get(key);
    const gdp = gdpMap.get(key);
    const tot = totMap.get(key);
    const provisional = Boolean(mio?.provisional || gdp?.provisional || tot?.provisional);
    rows.push({
      country_code: geo,
      year,
      cofog_code: cofog,
      cofog_label: COFOG_LABELS[cofog] || cofog,
      amount_million_eur: mio?.value ?? null,
      pct_of_gdp: gdp?.value ?? null,
      pct_of_total_expenditure: tot?.value ?? null,
      is_provisional: provisional,
      source_url: mioEur.url, // canonical source pointer; we use MIO_EUR URL
    });
  }

  // Stable sort: cofog asc, year asc.
  rows.sort((a, b) => a.cofog_code.localeCompare(b.cofog_code) || a.year - b.year);
  return rows;
}

async function ensureRunLog(supabase: ReturnType<typeof createClient>): Promise<string | null> {
  const { data, error } = await supabase
    .from('scrape_runs')
    .insert({ source_type: 'eurostat_cofog', status: 'running' })
    .select('id')
    .single();
  if (error) {
    console.error('ensureRunLog failed:', error.message);
    return null;
  }
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

  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
  const projectRef = parseProjectRef(url);
  if (args.expectProjectRef && projectRef !== args.expectProjectRef) {
    throw new Error(`Resolved project ref ${projectRef ?? 'unknown'} does not match expected ${args.expectProjectRef}`);
  }

  const runId = args.apply ? await ensureRunLog(supabase) : null;

  const allRows: ExpenditureRow[] = [];
  let totalFetched = 0;

  try {
    for (const geo of args.countries) {
      console.error(`  -> fetching geo=${geo}`);
      const [mio, gdp, tot] = await Promise.all([
        fetchEurostatSlice(geo, 'MIO_EUR'),
        fetchEurostatSlice(geo, 'PC_GDP'),
        fetchEurostatSlice(geo, 'PC_TOT'),
      ]);
      const rows = buildRowsFromDatasets(geo, mio, gdp, tot);
      totalFetched += rows.length;
      allRows.push(...rows);
    }

    console.error(`fetched ${totalFetched} rows across ${args.countries.length} geos`);

    if (!args.apply) {
      console.log(JSON.stringify({
        apply: false,
        countries: args.countries,
        rows: totalFetched,
        sample: allRows.slice(0, 5),
      }, null, 2));
      await updateRunLog(supabase, runId, { status: 'completed', records_fetched: totalFetched, records_created: 0 });
      return;
    }

    // Upsert in chunks of 500.
    let inserted = 0;
    let updated = 0;
    const chunkSize = 500;
    for (let i = 0; i < allRows.length; i += chunkSize) {
      const chunk = allRows.slice(i, i + chunkSize);
      const { data, error } = await supabase
        .from('government_expenditure')
        .upsert(chunk, { onConflict: 'country_code,year,cofog_code' })
        .select('id, created_at, updated_at');
      if (error) throw error;
      const rows = (data as { created_at: string; updated_at: string }[] | null) ?? [];
      for (const r of rows) {
        if (new Date(r.updated_at).getTime() - new Date(r.created_at).getTime() < 1000) inserted += 1;
        else updated += 1;
      }
    }

    await supabase.rpc('increment_total_records', { p_source_type: 'eurostat_cofog', p_delta: inserted });
    await updateRunLog(supabase, runId, { status: 'completed', records_fetched: totalFetched, records_created: inserted, records_updated: updated });

    console.log(JSON.stringify({
      apply: true,
      countries: args.countries,
      rows: totalFetched,
      inserted,
      updated,
    }, null, 2));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('sync-eurostat-budgets error:', msg);
    await updateRunLog(supabase, runId, { status: 'failed', records_fetched: totalFetched, error_message: msg });
    throw err;
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
