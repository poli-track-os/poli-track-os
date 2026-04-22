#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { createClient } from '@supabase/supabase-js';
import {
  buildCountryLeadershipMatchIndexes,
  buildCountryLeadershipMutationPlan,
  buildCountryLeadershipSeeds,
  getCountryLeadershipMatch,
  type CountryLeadershipMetadataRow,
  type ExistingLeadershipPoliticianRow,
} from '../src/lib/country-leadership-sync.ts';

type Args = {
  apply: boolean;
  countries: string[] | null;
  expectProjectRef: string | null;
};

function printHelp() {
  console.log(`Usage:
  node --experimental-strip-types scripts/sync-country-leadership.ts [--apply] [--countries PT,DE] [--expect-project-ref ref]

Behavior:
  Dry-run is the default. The script projects country head-of-state and
  head-of-government metadata into first-class politicians rows so those
  actors always have internal profile pages.
  --apply writes the inserts/updates and then triggers enrich-wikipedia
  for the affected rows.
`);
}

function parseArgs(argv: string[]): Args {
  const args: Args = {
    apply: false,
    countries: null,
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
      args.countries = next
        .split(',')
        .map((value) => value.trim().toUpperCase())
        .filter(Boolean);
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

function parseProjectRef(url: string) {
  try {
    const hostname = new URL(url).hostname;
    return hostname.split('.')[0] || null;
  } catch {
    return null;
  }
}

function chunk<T>(items: T[], size: number) {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

async function triggerWikipediaEnrichment(ids: string[]) {
  if (ids.length === 0) return [];
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  if (!url) throw new Error('Missing SUPABASE_URL or VITE_SUPABASE_URL');
  const key = getRequiredEnv('SUPABASE_SERVICE_ROLE_KEY');
  const endpoint = `${url}/functions/v1/enrich-wikipedia`;
  const results: unknown[] = [];

  for (const batch of chunk(ids, 50)) {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        apikey: key,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ politicianIds: batch }),
    });

    if (!response.ok) {
      throw new Error(`enrich-wikipedia failed for ${batch.length} ids: ${response.status} ${response.statusText}`);
    }

    results.push(await response.json());
  }

  return results;
}

async function main() {
  loadLocalEnv();
  const args = parseArgs(process.argv.slice(2));
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  if (!supabaseUrl) throw new Error('Missing SUPABASE_URL or VITE_SUPABASE_URL');
  const key = args.apply
    ? getRequiredEnv('SUPABASE_SERVICE_ROLE_KEY')
    : process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  if (!key) throw new Error('Missing credentials');

  const projectRef = parseProjectRef(supabaseUrl);
  if (args.expectProjectRef && projectRef !== args.expectProjectRef) {
    throw new Error(`Ref mismatch: expected ${args.expectProjectRef}, got ${projectRef}`);
  }

  const supabase = createClient(supabaseUrl, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  let metadataQuery = supabase
    .from('country_metadata')
    .select('country_code, country_name, head_of_state, head_of_government, officeholders')
    .order('country_code', { ascending: true });

  if (args.countries && args.countries.length > 0) {
    metadataQuery = metadataQuery.in('country_code', args.countries);
  }

  const { data: countryRows, error: countryError } = await metadataQuery;
  if (countryError) throw countryError;

  const rows = (countryRows || []) as CountryLeadershipMetadataRow[];
  const countryCodes = [...new Set(rows.map((row) => row.country_code))];

  let politicianQuery = supabase
    .from('politicians')
    .select('id, country_code, name, role, data_source, external_id, source_attribution, source_url, wikipedia_url');
  if (countryCodes.length > 0) politicianQuery = politicianQuery.in('country_code', countryCodes);
  const { data: politicianRows, error: politicianError } = await politicianQuery;
  if (politicianError) throw politicianError;

  const indexes = buildCountryLeadershipMatchIndexes((politicianRows || []) as ExistingLeadershipPoliticianRow[]);

  const plans = rows.flatMap((row) =>
    buildCountryLeadershipSeeds(row).map((seed) => {
      const match = getCountryLeadershipMatch(indexes, seed);
      return buildCountryLeadershipMutationPlan(match.row, seed, match.matchedBy);
    }),
  );

  const inserts = plans.filter((plan) => plan.action === 'insert');
  const updates = plans.filter((plan) => plan.action === 'update' && plan.changedFields.length > 1);
  const drySummary = {
    scannedCountries: rows.length,
    seeds: plans.length,
    inserts: inserts.length,
    updates: updates.length,
    sample: plans.slice(0, 8).map((plan) => ({
      action: plan.action,
      office: plan.seed.office,
      personName: plan.seed.personName,
      countryCode: plan.seed.countryCode,
      matchedBy: plan.matchedBy,
      changedFields: plan.changedFields,
    })),
  };

  if (!args.apply) {
    console.log(JSON.stringify({ apply: false, ...drySummary }, null, 2));
    return;
  }

  const touchedIds: string[] = [];

  for (const plan of inserts) {
    const { data, error } = await supabase
      .from('politicians')
      .insert(plan.payload)
      .select('id')
      .single();
    if (error) throw error;
    if (data?.id) touchedIds.push(data.id);
  }

  for (const plan of updates) {
    const { data, error } = await supabase
      .from('politicians')
      .update(plan.payload)
      .eq('id', plan.politicianId!)
      .select('id')
      .single();
    if (error) throw error;
    if (data?.id) touchedIds.push(data.id);
  }

  const uniqueTouchedIds = [...new Set(touchedIds)];
  const enrichmentResults = await triggerWikipediaEnrichment(uniqueTouchedIds);

  console.log(JSON.stringify({
    apply: true,
    ...drySummary,
    touched: uniqueTouchedIds.length,
    enrichedBatches: enrichmentResults,
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
