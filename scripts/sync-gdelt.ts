#!/usr/bin/env node
// Sync one day of GDELT events into political_events, attributing to known
// politicians by full-name match.
//
// GDELT v1 publishes daily exports at:
//   http://data.gdeltproject.org/events/{YYYYMMDD}.export.CSV.zip
//
// The zip contains a single CSV with 58 tab-separated columns. We stream
// it via the external `unzip` binary (already a dep for the Bundestag sync).
//
// Usage:
//   node --experimental-strip-types scripts/sync-gdelt.ts [--apply] [--date YYYYMMDD]
//
// Defaults to "yesterday" in UTC.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { spawn } from 'node:child_process';
import readline from 'node:readline';
import { createClient } from '@supabase/supabase-js';
import {
  mapEventCodeToType,
  matchesPolitician,
  normalizeForGdeltMatch,
  parseGdeltLine,
} from '../src/lib/gdelt-helpers.ts';

type Args = { apply: boolean; date: string };

function parseArgs(argv: string[]): Args {
  // Default: yesterday UTC.
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const defaultDate = yesterday.toISOString().slice(0, 10).replace(/-/g, '');
  const args: Args = { apply: false, date: defaultDate };
  for (let i = 0; i < argv.length; i += 1) {
    const t = argv[i];
    if (t === '--apply') { args.apply = true; continue; }
    if (t === '--date') {
      const next = argv[++i];
      if (!next) throw new Error('Missing value for --date');
      if (!/^\d{8}$/.test(next)) throw new Error('--date must be YYYYMMDD');
      args.date = next;
      continue;
    }
    if (t === '--help' || t === '-h') {
      console.log('scripts/sync-gdelt.ts [--apply] [--date YYYYMMDD]');
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
  if (!url) throw new Error('Missing SUPABASE_URL');
  const key = apply
    ? process.env.SUPABASE_SERVICE_ROLE_KEY
    : process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  if (!key) throw new Error('Missing credentials');
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

interface PoliticianRow {
  id: string;
  name: string;
  tokens: string[];
}

async function loadPoliticianTokens(supabase: ReturnType<typeof createClient>): Promise<PoliticianRow[]> {
  const out: PoliticianRow[] = [];
  let from = 0;
  const pageSize = 1000;
  while (true) {
    const { data, error } = await supabase
      .from('politicians')
      .select('id, name')
      .order('id', { ascending: true })
      .range(from, from + pageSize - 1);
    if (error) throw error;
    const rows = (data || []) as { id: string; name: string }[];
    if (rows.length === 0) break;
    for (const r of rows) {
      const tokens = normalizeForGdeltMatch(r.name);
      // Only keep politicians whose name has at least 2 tokens — single-token
      // names are too noisy.
      if (tokens.length >= 2) out.push({ id: r.id, name: r.name, tokens });
    }
    if (rows.length < pageSize) break;
    from += pageSize;
  }
  return out;
}

async function downloadGdeltZip(date: string, dest: string) {
  const url = `http://data.gdeltproject.org/events/${date}.export.CSV.zip`;
  console.error(`  -> downloading ${url}`);
  const res = await fetch(url, { signal: AbortSignal.timeout(60_000) });
  if (!res.ok) throw new Error(`GDELT ${res.status} for ${date}`);
  const ab = await res.arrayBuffer();
  fs.writeFileSync(dest, Buffer.from(ab));
  console.error(`  -> wrote ${ab.byteLength} bytes`);
}

async function main() {
  loadLocalEnv();
  const args = parseArgs(process.argv.slice(2));
  const supabase = getSupabaseClient(args.apply);

  const politicians = await loadPoliticianTokens(supabase);
  console.error(`loaded ${politicians.length} politicians for matching`);

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gdelt-'));
  const zipPath = path.join(tempDir, `${args.date}.export.CSV.zip`);

  let totalLines = 0;
  let matched = 0;
  let inserted = 0;
  const errors: string[] = [];

  try {
    await downloadGdeltZip(args.date, zipPath);

    const unzipProc = spawn('unzip', ['-p', zipPath], { stdio: ['ignore', 'pipe', 'inherit'] });
    const rl = readline.createInterface({ input: unzipProc.stdout, crlfDelay: Infinity });

    const batch: Array<Record<string, unknown>> = [];

    const flush = async () => {
      if (batch.length === 0) return;
      if (!args.apply) { batch.length = 0; return; }
      const { data, error } = await supabase
        .from('political_events')
        .upsert(batch, { onConflict: 'politician_id,source_url,event_timestamp', ignoreDuplicates: true })
        .select('id');
      if (error) { errors.push(error.message); }
      else { inserted += (data as unknown[] | null)?.length ?? 0; }
      batch.length = 0;
    };

    for await (const line of rl) {
      totalLines += 1;
      const event = parseGdeltLine(line);
      if (!event) continue;
      // Match against politicians.
      for (const p of politicians) {
        if (matchesPolitician(event.actor1Name, p.tokens) || matchesPolitician(event.actor2Name, p.tokens)) {
          matched += 1;
          batch.push({
            politician_id: p.id,
            event_type: mapEventCodeToType(event.eventCode),
            title: `GDELT mention: ${event.actor1Name || ''}${event.actor2Name ? ` ↔ ${event.actor2Name}` : ''}`.slice(0, 240),
            description: `CAMEO code ${event.eventCode || '?'}, Goldstein ${event.goldsteinScale ?? '?'}, tone ${event.avgTone ?? '?'}`,
            source: 'news' as const,
            source_url: event.sourceUrl,
            event_timestamp: `${event.sqlDate}T00:00:00Z`,
            valid_from: `${event.sqlDate}T00:00:00Z`,
            raw_data: { gdelt_id: event.globalEventId, code: event.eventCode, goldstein: event.goldsteinScale, tone: event.avgTone },
            evidence_count: 1,
            trust_level: 2,
            entities: [],
          });
          if (batch.length >= 500) await flush();
          break; // Only attribute to the first matching politician per event.
        }
      }
    }
    await flush();

    if (args.apply) {
      await supabase.rpc('increment_total_records', { p_source_type: 'gdelt', p_delta: inserted });
    }

    console.log(JSON.stringify({
      apply: args.apply,
      date: args.date,
      total_lines: totalLines,
      matched,
      inserted,
      errors_count: errors.length,
      first_errors: errors.slice(0, 3),
    }, null, 2));
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

main().catch((err) => { console.error(err); process.exit(1); });
