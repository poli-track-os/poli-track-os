#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { createClient } from '@supabase/supabase-js';
import {
  CURATED_BUDGET_ARCHIVES,
  buildProposalFromCuratedBudgetArchive,
  type CuratedBudgetArchiveRecord,
} from '../src/lib/curated-budget-archives.ts';
import { fetchExistingProposalIdsBySourceUrl } from '../src/lib/proposal-sync.ts';

type Args = {
  apply: boolean;
  countries: string[] | null;
  expectProjectRef: string | null;
};

function parseArgs(argv: string[]): Args {
  const args: Args = { apply: false, countries: null, expectProjectRef: null };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === '--apply') {
      args.apply = true;
      continue;
    }
    if (token === '--countries') {
      const next = argv[++index];
      if (!next) throw new Error('Missing value for --countries');
      args.countries = next.split(',').map((value) => value.trim().toUpperCase()).filter(Boolean);
      continue;
    }
    if (token === '--expect-project-ref') {
      const next = argv[++index];
      if (!next) throw new Error('Missing value for --expect-project-ref');
      args.expectProjectRef = next.trim();
      continue;
    }
    if (token === '--help' || token === '-h') {
      console.log('scripts/sync-curated-budget-archives.ts [--apply] [--countries CY,HU,MT] [--expect-project-ref ref]');
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
    const separator = line.indexOf('=');
    if (separator === -1) continue;
    const key = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();
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
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

function filterRecords(records: CuratedBudgetArchiveRecord[], countries: string[] | null) {
  if (!countries || countries.length === 0) return records;
  const allow = new Set(countries);
  return records.filter((record) => allow.has(record.countryCode));
}

async function main() {
  loadLocalEnv();
  const args = parseArgs(process.argv.slice(2));
  const supabase = getSupabaseClient(args.apply);

  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
  const projectRef = (() => {
    try {
      return new URL(url).hostname.split('.')[0];
    } catch {
      return null;
    }
  })();
  if (args.expectProjectRef && projectRef !== args.expectProjectRef) {
    throw new Error(`Resolved project ref ${projectRef ?? 'unknown'} does not match expected ${args.expectProjectRef}`);
  }

  const records = filterRecords(CURATED_BUDGET_ARCHIVES, args.countries);
  const proposals = records.map(buildProposalFromCuratedBudgetArchive);
  let created = 0;
  let updated = 0;

  if (args.apply && proposals.length > 0) {
    const existingByUrl = await fetchExistingProposalIdsBySourceUrl(
      supabase,
      proposals.map((proposal) => proposal.source_url),
    );
    created = proposals.filter((proposal) => !existingByUrl.has(proposal.source_url)).length;
    updated = proposals.filter((proposal) => existingByUrl.has(proposal.source_url)).length;

    for (let index = 0; index < proposals.length; index += 100) {
      const chunk = proposals.slice(index, index + 100);
      const { error } = await supabase.from('proposals').upsert(chunk, { onConflict: 'source_url' });
      if (error) throw error;
    }

    const deltas = new Map<string, number>();
    for (const proposal of proposals) {
      deltas.set(proposal.data_source, (deltas.get(proposal.data_source) ?? 0) + 1);
    }
    for (const [sourceType, delta] of deltas.entries()) {
      await supabase.rpc('increment_total_records', { p_source_type: sourceType, p_delta: delta });
    }
  }

  const byCountry = new Map<string, number>();
  for (const record of records) byCountry.set(record.countryCode, (byCountry.get(record.countryCode) ?? 0) + 1);

  console.log(JSON.stringify({
    apply: args.apply,
    prepared: proposals.length,
    created,
    updated,
    countries: [...byCountry.entries()].map(([countryCode, count]) => ({ countryCode, count })),
    dataSources: [...new Set(records.map((record) => record.dataSource))].sort(),
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
