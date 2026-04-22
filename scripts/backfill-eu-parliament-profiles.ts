#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { createClient } from '@supabase/supabase-js';
import {
  buildEuParliamentBiography,
  buildEuParliamentProfileUpdate,
  parseEuParliamentCvHtml,
  parseEuParliamentHomeHtml,
  type ExistingEuParliamentRow,
} from '../src/lib/eu-parliament-profile-helpers.ts';

type Args = {
  apply: boolean;
  expectProjectRef: string | null;
  limit: number | null;
};

function parseArgs(argv: string[]): Args {
  const args: Args = {
    apply: false,
    expectProjectRef: null,
    limit: null,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === '--apply') {
      args.apply = true;
      continue;
    }
    if (token === '--expect-project-ref') {
      const next = argv[index + 1];
      if (!next) throw new Error('Missing value for --expect-project-ref');
      args.expectProjectRef = next.trim();
      index += 1;
      continue;
    }
    if (token === '--limit') {
      const next = argv[index + 1];
      if (!next) throw new Error('Missing value for --limit');
      const parsed = Number.parseInt(next, 10);
      if (!Number.isInteger(parsed) || parsed <= 0) throw new Error(`Invalid --limit value: ${next}`);
      args.limit = parsed;
      index += 1;
      continue;
    }
    if (token === '--help' || token === '-h') {
      console.log('scripts/backfill-eu-parliament-profiles.ts [--apply] [--limit N] [--expect-project-ref ref]');
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

function getSupabaseClient(apply: boolean) {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  if (!url) throw new Error('Missing SUPABASE_URL or VITE_SUPABASE_URL');
  const key = apply
    ? process.env.SUPABASE_SERVICE_ROLE_KEY
    : process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  if (!key) throw new Error('Missing credentials');
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

function parseProjectRef(url: string) {
  try {
    return new URL(url).hostname.split('.')[0] || null;
  } catch {
    return null;
  }
}

async function fetchHtml(url: string) {
  const response = await fetch(url, {
    headers: { 'User-Agent': 'poli-track eu parliament profile backfill' },
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error(`Fetch failed for ${url}: ${response.status}`);
  return response.text();
}

type BackfillRow = ExistingEuParliamentRow & {
  id: string;
  name: string;
};

async function loadTargets(supabase: ReturnType<typeof createClient>, limit: number | null) {
  let query = supabase
    .from('politicians')
    .select('id, name, biography, birth_year, enriched_at, external_id, source_attribution, source_url, twitter_handle')
    .eq('data_source', 'eu_parliament')
    .is('enriched_at', null)
    .order('id', { ascending: true });

  if (limit) query = query.limit(limit);

  const { data, error } = await query;
  if (error) throw error;
  return (data || []) as BackfillRow[];
}

async function main() {
  loadLocalEnv();
  const args = parseArgs(process.argv.slice(2));
  const supabase = getSupabaseClient(args.apply);
  const projectRef = parseProjectRef(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '');

  if (args.expectProjectRef && projectRef !== args.expectProjectRef) {
    throw new Error(`Resolved project ref ${projectRef ?? 'unknown'} does not match expected ${args.expectProjectRef}`);
  }

  const targets = await loadTargets(supabase, args.limit);
  let updated = 0;
  let skipped = 0;
  let failed = 0;
  const samples: Array<{ name: string; changedFields?: string[]; error?: string; biography?: string | null }> = [];

  for (const row of targets) {
    try {
      const homeHtml = await fetchHtml(row.source_url || `https://www.europarl.europa.eu/meps/en/${row.external_id}`);
      const home = parseEuParliamentHomeHtml(homeHtml);
      const cvUrl = home.canonicalUrl?.replace(/\/home$/, '/cv') ?? null;
      const cvHtml = cvUrl ? await fetchHtml(cvUrl).catch(() => null) : null;
      const cv = cvHtml ? parseEuParliamentCvHtml(cvHtml) : { hasCv: false, sections: [], updatedAt: null };
      const biography = buildEuParliamentBiography(row.name, home, cv);
      const plan = buildEuParliamentProfileUpdate(row, biography, home, cv);

      if (!plan) {
        skipped += 1;
        continue;
      }

      if (args.apply) {
        const { error } = await supabase
          .from('politicians')
          .update(plan.payload)
          .eq('id', row.id);
        if (error) throw error;
      }

      updated += 1;
      if (samples.length < 8) {
        samples.push({ name: row.name, changedFields: plan.changedFields, biography: plan.biography });
      }
    } catch (error) {
      failed += 1;
      if (samples.length < 8) {
        samples.push({
          name: row.name,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  console.log(JSON.stringify({
    apply: args.apply,
    projectRef,
    scanned: targets.length,
    updated,
    skipped,
    failed,
    samples,
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
