#!/usr/bin/env node
// One-shot backfill: clean wikipedia_data.infobox values for every politician
// in the database. Drops empty values and "| field =" leakage; renders
// templates and links via cleanInfoboxValues from src/lib/wiki-text.ts.
//
// Idempotent — running it again is a no-op (the cleaner is purely
// destructuring; cleaned values stay cleaned).
//
// Usage:
//   node --experimental-strip-types scripts/clean-wiki-infobox.ts [--apply]
//
// Without --apply, prints a diff sample. With --apply, writes back via
// service role.

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { createClient } from '@supabase/supabase-js';
import { cleanInfoboxValues } from '../src/lib/wiki-text.ts';

type Args = { apply: boolean; limit: number | null };

function parseArgs(argv: string[]): Args {
  const args: Args = { apply: false, limit: null };
  for (let i = 0; i < argv.length; i += 1) {
    const t = argv[i];
    if (t === '--apply') { args.apply = true; continue; }
    if (t === '--limit') {
      const next = argv[++i];
      if (!next) throw new Error('Missing value for --limit');
      args.limit = parseInt(next, 10);
      continue;
    }
    if (t === '--help' || t === '-h') {
      console.log('scripts/clean-wiki-infobox.ts [--apply] [--limit N]');
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

interface PoliticianRow {
  id: string;
  name: string;
  wikipedia_data: Record<string, unknown> | null;
}

function isInfobox(value: unknown): value is Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  return Object.values(value).every((v) => typeof v === 'string' || v === null);
}

async function main() {
  loadLocalEnv();
  const args = parseArgs(process.argv.slice(2));
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  if (!url) throw new Error('Missing SUPABASE_URL');
  const key = args.apply
    ? process.env.SUPABASE_SERVICE_ROLE_KEY
    : process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  if (!key) throw new Error('Missing credentials');
  const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

  // Page through politicians with wikipedia_data set.
  const pageSize = 500;
  let offset = 0;
  let totalScanned = 0;
  let totalNeedingCleanup = 0;
  let totalUpdated = 0;
  const sampleDiffs: Array<{ name: string; field: string; before: string; after: string }> = [];

  while (true) {
    const { data, error } = await supabase
      .from('politicians')
      .select('id, name, wikipedia_data')
      .not('wikipedia_data', 'is', null)
      .order('id', { ascending: true })
      .range(offset, offset + pageSize - 1);
    if (error) throw error;
    const rows = (data || []) as PoliticianRow[];
    if (rows.length === 0) break;

    for (const row of rows) {
      totalScanned += 1;
      const wd = row.wikipedia_data;
      if (!wd || typeof wd !== 'object') continue;
      const ib = (wd as Record<string, unknown>).infobox;
      if (!isInfobox(ib)) continue;

      const cleaned = cleanInfoboxValues(ib);
      // Skip if nothing changed.
      const ibKeys = Object.keys(ib).sort();
      const cleanedKeys = Object.keys(cleaned).sort();
      const sameKeys = ibKeys.length === cleanedKeys.length && ibKeys.every((k, i) => k === cleanedKeys[i]);
      const sameValues = sameKeys && ibKeys.every((k) => ib[k] === cleaned[k]);
      if (sameValues) continue;

      totalNeedingCleanup += 1;
      // Capture a couple of diff samples for human review.
      if (sampleDiffs.length < 6) {
        for (const k of ibKeys) {
          const before = String(ib[k] ?? '');
          const after = cleaned[k] ?? '';
          if (before !== after) {
            sampleDiffs.push({ name: row.name, field: k, before, after });
            break;
          }
        }
      }

      if (args.apply) {
        const newWikipediaData = { ...(wd as Record<string, unknown>), infobox: cleaned };
        const { error: upErr } = await supabase
          .from('politicians')
          .update({ wikipedia_data: newWikipediaData })
          .eq('id', row.id);
        if (upErr) {
          console.error(`update failed for ${row.name}: ${upErr.message}`);
          continue;
        }
        totalUpdated += 1;
      }

      if (args.limit !== null && totalNeedingCleanup >= args.limit) {
        console.log(JSON.stringify({ apply: args.apply, scanned: totalScanned, needing_cleanup: totalNeedingCleanup, updated: totalUpdated, sample_diffs: sampleDiffs }, null, 2));
        return;
      }
    }

    if (rows.length < pageSize) break;
    offset += pageSize;
  }

  console.log(JSON.stringify({ apply: args.apply, scanned: totalScanned, needing_cleanup: totalNeedingCleanup, updated: totalUpdated, sample_diffs: sampleDiffs }, null, 2));
}

main().catch((err) => { console.error(err); process.exit(1); });
