import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { execFileSync } from 'node:child_process';
import { createClient } from '@supabase/supabase-js';
import {
  extractPortugalCurrentLegislatureUrl,
  extractPortugalRegistryJsonUrl,
  parseBundestagMembersXml,
  parsePortugalBiographicalRegistryJson,
  parsePortugalAssemblyRoster,
  type OfficialRosterRecord,
} from '../src/lib/official-rosters.ts';
import {
  buildMatchIndexes,
  buildMutationPlan,
  getMatch,
  SYNC_SOURCE_TYPE,
  type ExistingPoliticianRow,
  type MutationPlan,
} from '../src/lib/official-roster-sync-helpers.ts';

type Args = {
  apply: boolean;
  countries: string[];
  expectProjectRef: string | null;
};

const SUPPORTED_COUNTRIES = ['DE', 'PT'] as const;
const DEFAULT_COUNTRIES = [...SUPPORTED_COUNTRIES];
const SOURCE_TYPE = SYNC_SOURCE_TYPE;

function printHelp() {
  console.log(`Usage:
  node --experimental-strip-types scripts/sync-official-rosters.ts [--apply] [--countries PT,DE] [--expect-project-ref ref]

Behavior:
  Dry-run is the default. The script fetches official government/parliament rosters,
  matches them against existing politicians, and prints the inserts/updates it would make.
  --apply writes those changes directly to Supabase using SUPABASE_SERVICE_ROLE_KEY.

Environment:
  Reads SUPABASE_URL or VITE_SUPABASE_URL.
  Reads SUPABASE_SERVICE_ROLE_KEY only when --apply is supplied.
`);
}

function parseArgs(argv: string[]): Args {
  const args: Args = {
    apply: false,
    countries: DEFAULT_COUNTRIES,
    expectProjectRef: null,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];

    if (token === '--apply') {
      args.apply = true;
      continue;
    }

    if (token === '--countries') {
      const next = argv[index + 1];
      if (!next) throw new Error('Missing value for --countries');
      const countries = next
        .split(',')
        .map((value) => value.trim().toUpperCase())
        .filter(Boolean);
      if (countries.length === 0) {
        throw new Error('Expected at least one country code for --countries');
      }
      const invalid = countries.filter((value) => !SUPPORTED_COUNTRIES.includes(value as (typeof SUPPORTED_COUNTRIES)[number]));
      if (invalid.length > 0) {
        throw new Error(`Unsupported official roster countries: ${invalid.join(', ')}`);
      }
      args.countries = countries;
      index += 1;
      continue;
    }

    if (token === '--expect-project-ref') {
      const next = argv[index + 1];
      if (!next) throw new Error('Missing value for --expect-project-ref');
      args.expectProjectRef = next.trim();
      index += 1;
      continue;
    }

    if (token === '--help' || token === '-h') {
      printHelp();
      process.exit(0);
    }

    throw new Error(`Unknown argument: ${token}`);
  }

  return args;
}

function loadEnvFile(filePath: string, shellEnvKeys: Set<string>, overwrite = false) {
  if (!fs.existsSync(filePath)) return;

  const content = fs.readFileSync(filePath, 'utf8');
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;

    const separatorIndex = line.indexOf('=');
    if (separatorIndex === -1) continue;

    const key = line.slice(0, separatorIndex).trim();
    let value = line.slice(separatorIndex + 1).trim();
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

function getRequiredEnv(key: string) {
  const value = process.env[key];
  if (!value) throw new Error(`Missing required environment variable: ${key}`);
  return value;
}

function getSupabaseClient(apply: boolean) {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  if (!url) throw new Error('Missing SUPABASE_URL or VITE_SUPABASE_URL');

  const key = apply
    ? getRequiredEnv('SUPABASE_SERVICE_ROLE_KEY')
    : process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY;

  if (!key) {
    throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY for apply or VITE_SUPABASE_PUBLISHABLE_KEY for dry-run');
  }

  return createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

function parseProjectRef(url: string) {
  try {
    const hostname = new URL(url).hostname;
    return hostname.split('.')[0] || null;
  } catch {
    return null;
  }
}

async function fetchText(url: string) {
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'poli-track official roster sync',
    },
  });

  if (!response.ok) {
    throw new Error(`Request failed for ${url}: ${response.status} ${response.statusText}`);
  }

  return response.text();
}

async function fetchArrayBuffer(url: string) {
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'poli-track official roster sync',
    },
  });

  if (!response.ok) {
    throw new Error(`Request failed for ${url}: ${response.status} ${response.statusText}`);
  }

  return response.arrayBuffer();
}

async function fetchPortugalRoster() {
  const rootHtml = await fetchText('https://www.parlamento.pt/Cidadania/Paginas/DARegistoBiografico.aspx');
  const currentLegislature = extractPortugalCurrentLegislatureUrl(rootHtml);

  if (currentLegislature) {
    const currentLegislatureHtml = await fetchText(currentLegislature.url);
    const registryJsonUrl = extractPortugalRegistryJsonUrl(currentLegislatureHtml);

    if (registryJsonUrl) {
      const registryJson = await fetchText(registryJsonUrl);
      const records = parsePortugalBiographicalRegistryJson(registryJson, currentLegislature.legislature);
      if (records.length > 0) return records;
    }
  }

  const fallbackHtml = await fetchText('https://www.parlamento.pt/DeputadoGP/Paginas/Deputados_ef.aspx');
  return parsePortugalAssemblyRoster(fallbackHtml);
}

async function fetchGermanyRoster() {
  const zipData = await fetchArrayBuffer('https://www.bundestag.de/resource/blob/472878/MdB-Stammdaten.zip');
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'poli-track-bundestag-'));
  const zipPath = path.join(tempDir, 'MdB-Stammdaten.zip');

  try {
    fs.writeFileSync(zipPath, Buffer.from(zipData));
    const xml = execFileSync('unzip', ['-p', zipPath, 'MDB_STAMMDATEN.XML'], {
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
    });
    return parseBundestagMembersXml(xml, new Date());
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

async function fetchOfficialRoster(countryCode: string) {
  switch (countryCode) {
    case 'DE':
      return fetchGermanyRoster();
    case 'PT':
      return fetchPortugalRoster();
    default:
      throw new Error(`Unsupported official roster country: ${countryCode}`);
  }
}

async function loadPoliticiansForCountry(supabase: ReturnType<typeof createClient>, countryCode: string) {
  const rows: ExistingPoliticianRow[] = [];
  const pageSize = 1000;

  for (let offset = 0; ; offset += pageSize) {
    // Order by created_at ASC so that if two rows ever share the same
    // external_id (possible only before the unique index in migration
    // 20260412200000 is applied), `find()` resolves to the OLDEST row
    // deterministically. UUID order would resolve at random.
    const { data, error } = await supabase
      .from('politicians')
      .select('id, biography, birth_year, committees, country_code, country_name, data_source, enriched_at, external_id, in_office_since, jurisdiction, name, party_abbreviation, party_name, photo_url, role, source_attribution, source_url, twitter_handle')
      .eq('country_code', countryCode)
      .order('created_at', { ascending: true })
      .order('id', { ascending: true })
      .range(offset, offset + pageSize - 1);

    if (error) throw error;

    const chunk = (data || []) as ExistingPoliticianRow[];
    rows.push(...chunk);

    if (chunk.length < pageSize) break;
  }

  return rows;
}

// Pure helpers (buildMutationPlan, buildMatchIndexes, getMatch,
// buildNameIndexes, isRecord, getSourceRecordId, buildSourceAttribution,
// ExistingPoliticianRow, MutationPlan) are imported from
// `src/lib/official-roster-sync-helpers.ts`. They live there so vitest
// can verify them without typechecking the CLI's Supabase client.

async function ensureRunLog(supabase: ReturnType<typeof createClient>) {
  const { data, error } = await supabase
    .from('scrape_runs')
    .insert({
      source_type: SOURCE_TYPE,
      status: 'running',
    })
    .select('id')
    .single();

  if (error) throw error;
  return data.id as string;
}

async function updateRunLog(
  supabase: ReturnType<typeof createClient>,
  runId: string,
  payload: {
    status: 'completed' | 'failed';
    records_fetched: number;
    records_created?: number;
    records_updated?: number;
    error_message?: string | null;
  },
) {
  const { error } = await supabase
    .from('scrape_runs')
    .update({
      ...payload,
      completed_at: new Date().toISOString(),
    })
    .eq('id', runId);

  if (error) throw error;
}

async function applyPlans(
  supabase: ReturnType<typeof createClient>,
  plans: MutationPlan[],
) {
  const inserts = plans.filter((plan) => plan.action === 'insert');
  const updates = plans.filter((plan) => plan.action === 'update');

  let inserted = 0;
  let updated = 0;

  // Use upsert with onConflict: 'external_id' so that if another ingester
  // raced us and created the same row between snapshot and apply, we
  // gracefully UPDATE that row instead of erroring with 23505. Without
  // this, a concurrent enrichment run would reject the entire 100-row
  // chunk.
  for (let index = 0; index < inserts.length; index += 100) {
    const chunk = inserts.slice(index, index + 100).map((plan) => plan.payload);
    if (chunk.length === 0) continue;
    const { data, error } = await supabase
      .from('politicians')
      .upsert(chunk, { onConflict: 'external_id' })
      .select('id');
    if (error) throw error;
    inserted += data?.length || 0;
  }

  for (const plan of updates) {
    if (!plan.politicianId || Object.keys(plan.payload).length === 0) continue;
    const { error } = await supabase
      .from('politicians')
      .update(plan.payload)
      .eq('id', plan.politicianId);
    if (error) throw error;
    updated += 1;
  }

  return { inserted, updated };
}

async function main() {
  loadLocalEnv();

  const args = parseArgs(process.argv.slice(2));
  const supabase = getSupabaseClient(args.apply);
  const projectRef = parseProjectRef(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '');

  if (args.expectProjectRef && projectRef !== args.expectProjectRef) {
    throw new Error(`Resolved project ref ${projectRef ?? 'unknown'} does not match expected ${args.expectProjectRef}`);
  }

  const runId = await ensureRunLog(supabase);

  try {
    const fetchedByCountry = new Map<string, OfficialRosterRecord[]>();
    for (const countryCode of args.countries) {
      fetchedByCountry.set(countryCode, await fetchOfficialRoster(countryCode));
    }

    const existingByCountry = new Map<string, ExistingPoliticianRow[]>();
    for (const countryCode of args.countries) {
      existingByCountry.set(countryCode, await loadPoliticiansForCountry(supabase, countryCode));
    }

    const plans: MutationPlan[] = [];
    for (const countryCode of args.countries) {
      const rows = existingByCountry.get(countryCode) || [];
      // Hoisted: build indexes ONCE per country, not per record.
      // The previous version called buildNameIndexes inside getMatch on
      // every iteration, doing ~1000² normalizations per country.
      const indexes = buildMatchIndexes(rows);
      for (const record of fetchedByCountry.get(countryCode) || []) {
        const { row, matchedBy } = getMatch(indexes, record);
        plans.push(buildMutationPlan(row, record, matchedBy));
      }
    }

    const actionablePlans = plans.filter((plan) => plan.action === 'insert' || Object.keys(plan.payload).length > 0);

    const summary = {
      apply: args.apply,
      countries: args.countries,
      projectRef,
      fetched: Object.fromEntries([...fetchedByCountry.entries()].map(([countryCode, records]) => [countryCode, records.length])),
      existing: Object.fromEntries([...existingByCountry.entries()].map(([countryCode, rows]) => [countryCode, rows.length])),
      planned: {
        inserts: actionablePlans.filter((plan) => plan.action === 'insert').length,
        updates: actionablePlans.filter((plan) => plan.action === 'update').length,
      },
      matchModes: actionablePlans.reduce<Record<string, number>>((accumulator, plan) => {
        accumulator[plan.matchedBy] = (accumulator[plan.matchedBy] || 0) + 1;
        return accumulator;
      }, {}),
      samples: actionablePlans.slice(0, 12).map((plan) => ({
        action: plan.action,
        name: plan.record.name,
        country: plan.record.countryCode,
        matchedBy: plan.matchedBy,
        changedFields: plan.changedFields,
        party: plan.record.partyName || plan.record.partyAbbreviation,
        sourceUrl: plan.record.sourceUrl,
      })),
    };

    let applied = { inserted: 0, updated: 0 };
    if (args.apply) {
      applied = await applyPlans(supabase, actionablePlans);
    }

    await updateRunLog(supabase, runId, {
      status: 'completed',
      records_fetched: [...fetchedByCountry.values()].reduce((total, records) => total + records.length, 0),
      records_created: args.apply ? applied.inserted : summary.planned.inserts,
      records_updated: args.apply ? applied.updated : summary.planned.updates,
      error_message: null,
    });

    console.log(
      JSON.stringify(
        {
          ...summary,
          applied,
        },
        null,
        2,
      ),
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await updateRunLog(supabase, runId, {
      status: 'failed',
      records_fetched: 0,
      error_message: message,
    });
    throw error;
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
