#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { createClient } from '@supabase/supabase-js';
import { buildProposalFromParlamentAtRow, type ParlamentAtHeaderField, type ParlamentAtRawRow } from '../src/lib/parlament-at-helpers.ts';
import { fetchExistingProposalIdsBySourceUrl } from '../src/lib/proposal-sync.ts';

type Args = {
  apply: boolean;
  expectProjectRef: string | null;
};

type ParlamentAtResponse = {
  count?: number;
  header?: ParlamentAtHeaderField[];
  rows?: ParlamentAtRawRow[];
};

function parseArgs(argv: string[]): Args {
  const args: Args = { apply: false, expectProjectRef: null };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === '--apply') { args.apply = true; continue; }
    if (token === '--expect-project-ref') {
      const next = argv[++i];
      if (!next) throw new Error('Missing value for --expect-project-ref');
      args.expectProjectRef = next.trim();
      continue;
    }
    if (token === '--help' || token === '-h') {
      console.log('scripts/sync-parlament-at.ts [--apply]');
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
    const sep = line.indexOf('=');
    if (sep === -1) continue;
    const key = line.slice(0, sep).trim();
    let value = line.slice(sep + 1).trim();
    if (!key) continue;
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
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

async function ensureRunLog(supabase: ReturnType<typeof createClient>): Promise<string | null> {
  const { data, error } = await supabase
    .from('scrape_runs')
    .insert({ source_type: 'parlament_at', status: 'running' })
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

async function fetchGovernmentBills(): Promise<ParlamentAtResponse> {
  const res = await fetch('https://www.parlament.gv.at/Filter/api/filter/data/101?js=eval&showAll=true', {
    method: 'POST',
    headers: { 'content-type': 'application/json', Accept: 'application/json', 'User-Agent': 'poli-track sync-parlament-at' },
    body: JSON.stringify({ NRBR: ['NR'], VHG: ['RV'] }),
    signal: AbortSignal.timeout(60000),
  });
  if (!res.ok) throw new Error(`parlament.gv.at ${res.status}`);
  return (await res.json()) as ParlamentAtResponse;
}

async function main() {
  loadLocalEnv();
  const args = parseArgs(process.argv.slice(2));
  const supabase = getSupabaseClient(args.apply);

  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
  const projectRef = (() => { try { return new URL(url).hostname.split('.')[0]; } catch { return null; } })();
  if (args.expectProjectRef && projectRef !== args.expectProjectRef) {
    throw new Error(`Resolved project ref ${projectRef ?? 'unknown'} does not match expected ${args.expectProjectRef}`);
  }

  const runId = args.apply ? await ensureRunLog(supabase) : null;
  let totalFetched = 0;
  let totalCreated = 0;
  let totalUpdated = 0;

  try {
    const payload = await fetchGovernmentBills();
    const headers = payload.header ?? [];
    const rows = payload.rows ?? [];
    totalFetched = rows.length;

    const proposals = rows
      .map((row) => buildProposalFromParlamentAtRow(headers, row))
      .filter((row): row is NonNullable<typeof row> => Boolean(row));

    const deduped = new Map<string, NonNullable<(typeof proposals)[number]>>();
    for (const proposal of proposals) deduped.set(proposal.source_url, proposal);
    const uniqueProposals = [...deduped.values()];

    if (args.apply && uniqueProposals.length > 0) {
      const existingByUrl = await fetchExistingProposalIdsBySourceUrl(
        supabase,
        uniqueProposals.map((proposal) => proposal.source_url),
      );
      const toInsert = uniqueProposals.filter((proposal) => !existingByUrl.has(proposal.source_url));
      const toUpdate = uniqueProposals.filter((proposal) => existingByUrl.has(proposal.source_url));

      for (let i = 0; i < toInsert.length; i += 100) {
        const chunk = toInsert.slice(i, i + 100);
        const { data, error } = await supabase.from('proposals').insert(chunk).select('id');
        if (error) throw error;
        totalCreated += (data as unknown[] | null)?.length ?? 0;
      }
      for (const proposal of toUpdate) {
        const id = existingByUrl.get(proposal.source_url);
        if (!id) continue;
        const { error } = await supabase.from('proposals').update(proposal).eq('id', id);
        if (error) continue;
        totalUpdated += 1;
      }

      await supabase.rpc('increment_total_records', { p_source_type: 'parlament_at', p_delta: totalCreated + totalUpdated });
      await updateRunLog(supabase, runId, {
        status: 'completed',
        records_fetched: totalFetched,
        records_created: totalCreated,
        records_updated: totalUpdated,
      });
    }

    console.log(JSON.stringify({
      apply: args.apply,
      fetched: totalFetched,
      prepared: uniqueProposals.length,
      count: payload.count ?? null,
      created: totalCreated,
      updated: totalUpdated,
    }, null, 2));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await updateRunLog(supabase, runId, { status: 'failed', records_fetched: totalFetched, error_message: message });
    throw error;
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
