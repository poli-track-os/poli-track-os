#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { createClient } from '@supabase/supabase-js';

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
      console.log('scripts/normalize-twitter-handles.ts [--apply] [--limit N] [--expect-project-ref ref]');
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

function extractTwitterHandle(raw: string | null | undefined) {
  if (!raw) return null;
  const match = raw.match(/(?:twitter\.com|x\.com)\/([A-Za-z0-9_]{1,15})(?:[/?#]|$)/i);
  return match ? match[1] : null;
}

type TargetRow = {
  id: string;
  name: string;
  twitter_handle: string | null;
};

async function main() {
  loadLocalEnv();
  const args = parseArgs(process.argv.slice(2));
  const supabase = getSupabaseClient(args.apply);
  const projectRef = parseProjectRef(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '');

  if (args.expectProjectRef && projectRef !== args.expectProjectRef) {
    throw new Error(`Resolved project ref ${projectRef ?? 'unknown'} does not match expected ${args.expectProjectRef}`);
  }

  let query = supabase
    .from('politicians')
    .select('id, name, twitter_handle')
    .or('twitter_handle.ilike.%twitter.com%,twitter_handle.ilike.%x.com%')
    .order('id', { ascending: true });
  if (args.limit) query = query.limit(args.limit);

  const { data, error } = await query;
  if (error) throw error;
  const rows = (data || []) as TargetRow[];

  let updated = 0;
  const samples: Array<{ name: string; before: string | null; after: string | null }> = [];
  for (const row of rows) {
    const nextHandle = extractTwitterHandle(row.twitter_handle);
    if (!nextHandle || nextHandle === row.twitter_handle) continue;
    if (args.apply) {
      const { error: updateError } = await supabase
        .from('politicians')
        .update({ twitter_handle: nextHandle })
        .eq('id', row.id);
      if (updateError) throw updateError;
    }
    updated += 1;
    if (samples.length < 10) {
      samples.push({ name: row.name, before: row.twitter_handle, after: nextHandle });
    }
  }

  console.log(JSON.stringify({
    apply: args.apply,
    projectRef,
    scanned: rows.length,
    updated,
    samples,
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
