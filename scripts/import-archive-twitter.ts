#!/usr/bin/env node
// Import archived tweets from the Internet Archive Wayback Machine into
// the `raw_tweets` table. Operator tool — runs on demand against a
// specified handle. Slow (one HTTP call per Wayback snapshot).
//
// Usage:
//   node --experimental-strip-types scripts/import-archive-twitter.ts \
//     --handle janeexample --politician-id <uuid> --apply [--from 20140101] [--to 20221231] [--max-snapshots 10]

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { createClient } from '@supabase/supabase-js';
import {
  extractPostedAt,
  extractTweetsFromHtml,
  parseCdxResponse,
} from '../src/lib/wayback-helpers.ts';

type Args = {
  apply: boolean;
  handle: string | null;
  politicianId: string | null;
  from: string;
  to: string;
  maxSnapshots: number;
};

function parseArgs(argv: string[]): Args {
  const args: Args = {
    apply: false,
    handle: null,
    politicianId: null,
    from: '20140101',
    to: '20221231',
    maxSnapshots: 5,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const t = argv[i];
    if (t === '--apply') { args.apply = true; continue; }
    if (t === '--handle') { args.handle = argv[++i] || null; continue; }
    if (t === '--politician-id') { args.politicianId = argv[++i] || null; continue; }
    if (t === '--from') { args.from = argv[++i] || args.from; continue; }
    if (t === '--to') { args.to = argv[++i] || args.to; continue; }
    if (t === '--max-snapshots') { args.maxSnapshots = parseInt(argv[++i] || '5', 10); continue; }
    if (t === '--help' || t === '-h') {
      console.log('scripts/import-archive-twitter.ts --handle X --politician-id UUID [--apply] [--from YYYYMMDD] [--to YYYYMMDD] [--max-snapshots N]');
      process.exit(0);
    }
    throw new Error(`Unknown argument: ${t}`);
  }
  if (!args.handle) throw new Error('--handle required');
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
  if (!url) throw new Error('Missing SUPABASE_URL');
  const key = apply
    ? process.env.SUPABASE_SERVICE_ROLE_KEY
    : process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  if (!key) throw new Error('Missing credentials');
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function fetchCdx(handle: string, from: string, to: string): Promise<unknown> {
  const url = `https://web.archive.org/cdx/search/cdx?url=twitter.com/${encodeURIComponent(handle)}&output=json&from=${from}&to=${to}&filter=statuscode:200&limit=200`;
  const res = await fetch(url, { headers: { 'User-Agent': 'poli-track archive-twitter' } });
  if (!res.ok) throw new Error(`CDX ${res.status}`);
  return res.json();
}

async function fetchSnapshot(archiveUrl: string): Promise<string | null> {
  try {
    const res = await fetch(archiveUrl, { headers: { 'User-Agent': 'poli-track archive-twitter' }, signal: AbortSignal.timeout(15_000) });
    if (!res.ok) return null;
    return res.text();
  } catch {
    return null;
  }
}

async function main() {
  loadLocalEnv();
  const args = parseArgs(process.argv.slice(2));
  const supabase = getSupabaseClient(args.apply);

  console.error(`==> archive twitter for @${args.handle}`);
  const cdx = await fetchCdx(args.handle!, args.from, args.to);
  const snapshots = parseCdxResponse(cdx);
  console.error(`  CDX returned ${snapshots.length} snapshots in window ${args.from}..${args.to}`);

  const limited = snapshots.slice(0, args.maxSnapshots);
  let totalTweets = 0;
  let inserted = 0;

  for (const snap of limited) {
    console.error(`  -> ${snap.timestamp} ${snap.archiveUrl}`);
    const html = await fetchSnapshot(snap.archiveUrl);
    if (!html) { console.error('     (failed)'); continue; }
    const tweets = extractTweetsFromHtml(html);
    console.error(`     extracted ${tweets.length} tweets`);
    totalTweets += tweets.length;

    if (args.apply && tweets.length > 0) {
      const rows = tweets.map((t) => ({
        politician_id: args.politicianId,
        handle: args.handle!,
        tweet_id: t.tweetId,
        body: t.body,
        posted_at: t.postedAt || extractPostedAt(html, t.tweetId),
        archive_source: 'wayback',
        source_url: snap.archiveUrl,
      }));
      const { data, error } = await supabase
        .from('raw_tweets')
        .upsert(rows, { onConflict: 'handle,tweet_id', ignoreDuplicates: true })
        .select('id');
      if (error) console.error(`     upsert error: ${error.message}`);
      else inserted += (data as unknown[] | null)?.length ?? 0;
    }

    await sleep(800); // courteous to the Wayback Machine
  }

  console.log(JSON.stringify({
    apply: args.apply,
    handle: args.handle,
    snapshots_examined: limited.length,
    tweets_found: totalTweets,
    inserted,
  }, null, 2));
}

main().catch((err) => { console.error(err); process.exit(1); });
