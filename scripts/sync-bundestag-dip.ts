#!/usr/bin/env node
// Sync German Bundestag legislative proposals from the DIP API into the
// proposals table. Provides rich party (Fraktion) attribution from the
// initiative field.
//
// DIP API docs: https://dip.bundestag.api.bund.dev/
//
// Usage:
//   node --experimental-strip-types scripts/sync-bundestag-dip.ts \
//     [--apply] [--wahlperiode 20] [--max-pages 50] [--expect-project-ref REF]
//
// Requires BUNDESTAG_DIP_API_KEY env var (request at
// parlamentsdokumentation@bundestag.de).

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { createClient } from '@supabase/supabase-js';
import {
  buildProposalFromVorgang,
  buildVoteBundleFromDipVorgang,
  type DipListResponse,
  type DipVorgang,
} from '../src/lib/bundestag-dip-helpers.ts';
import { upsertProposalVoteBundles } from '../src/lib/proposal-sync.ts';

const DIP_BASE = 'https://search.dip.bundestag.de/api/v1';

type Args = {
  apply: boolean;
  wahlperiode: number;
  maxPages: number;
  expectProjectRef: string | null;
};

function parseArgs(argv: string[]): Args {
  const args: Args = { apply: false, wahlperiode: 20, maxPages: 100, expectProjectRef: null };
  for (let i = 0; i < argv.length; i += 1) {
    const t = argv[i];
    if (t === '--apply') { args.apply = true; continue; }
    if (t === '--wahlperiode') {
      const next = argv[++i];
      if (!next) throw new Error('Missing value for --wahlperiode');
      args.wahlperiode = parseInt(next, 10);
      continue;
    }
    if (t === '--max-pages') {
      const next = argv[++i];
      if (!next) throw new Error('Missing value for --max-pages');
      args.maxPages = parseInt(next, 10);
      continue;
    }
    if (t === '--expect-project-ref') {
      const next = argv[++i];
      if (!next) throw new Error('Missing value for --expect-project-ref');
      args.expectProjectRef = next.trim();
      continue;
    }
    if (t === '--help' || t === '-h') {
      console.log('scripts/sync-bundestag-dip.ts [--apply] [--wahlperiode 20] [--max-pages 50]');
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
  if (!key) throw new Error('Missing credentials');
  return createClient(url!, key!, { auth: { persistSession: false, autoRefreshToken: false } });
}

async function ensureRunLog(supabase: ReturnType<typeof createClient>): Promise<string | null> {
  const { data, error } = await supabase
    .from('scrape_runs')
    .insert({ source_type: 'bundestag_dip', status: 'running' })
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

/**
 * Paginate through DIP /vorgang endpoint using cursor-based pagination.
 */
async function* fetchVorgaenge(apiKey: string, wahlperiode: number, maxPages: number): AsyncGenerator<DipVorgang> {
  let cursor: string | null = null;
  for (let page = 0; page < maxPages; page += 1) {
    const params = new URLSearchParams({
      apikey: apiKey,
      'f.vorgangstyp': 'Gesetzgebung',
      'f.wahlperiode': String(wahlperiode),
      format: 'json',
    });
    if (cursor) params.set('cursor', cursor);

    const url = `${DIP_BASE}/vorgang?${params.toString()}`;
    let response: DipListResponse | null = null;

    for (let attempt = 0; attempt < 3; attempt += 1) {
      const res = await fetch(url, {
        headers: { 'User-Agent': 'poli-track sync-bundestag-dip' },
        signal: AbortSignal.timeout(30_000),
      });
      if (res.ok) {
        response = (await res.json()) as DipListResponse;
        break;
      }
      if (res.status === 429 || res.status >= 500) {
        await new Promise((r) => setTimeout(r, 3_000 * (attempt + 1)));
        continue;
      }
      throw new Error(`DIP API ${res.status}: ${await res.text().catch(() => '')}`);
    }
    if (!response) throw new Error('DIP API: all retries failed');

    const docs = response.documents ?? [];
    if (docs.length === 0) break;

    for (const doc of docs) yield doc;

    cursor = response.cursor ?? null;
    if (!cursor) break;
    await new Promise((r) => setTimeout(r, 500));
  }
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

  const apiKey = process.env.BUNDESTAG_DIP_API_KEY;
  if (!apiKey) throw new Error('Missing BUNDESTAG_DIP_API_KEY env var');

  const runId = args.apply ? await ensureRunLog(supabase) : null;
  let totalFetched = 0;
  let totalCreated = 0;
  let totalUpdated = 0;

  try {
    type ProposalRow = NonNullable<ReturnType<typeof buildProposalFromVorgang>>;
    type VoteRow = ReturnType<typeof buildVoteBundleFromDipVorgang>;
    type BatchRow = ProposalRow & { __vote_bundle: VoteRow };
    const batch: BatchRow[] = [];

    const flushBatch = async () => {
      if (batch.length === 0) return;
      if (!args.apply) { batch.length = 0; return; }

      const urls = batch.map((r) => r.source_url);
      const { data: existing } = await supabase
        .from('proposals')
        .select('id, source_url')
        .in('source_url', urls);
      const existingByUrl = new Map<string, string>();
      for (const row of existing ?? []) {
        if (row.source_url) existingByUrl.set(row.source_url, row.id);
      }

      const toInsert = batch.filter((r) => !existingByUrl.has(r.source_url));
      const toUpdate = batch.filter((r) => existingByUrl.has(r.source_url));
      const proposalIdBySourceUrl = new Map(existingByUrl);

      if (toInsert.length > 0) {
        const { data, error } = await supabase
          .from('proposals')
          .insert(toInsert.map(({ __vote_bundle, ...proposal }) => proposal))
          .select('id, source_url');
        if (error) throw error;
        for (const row of data ?? []) {
          if (row.source_url) proposalIdBySourceUrl.set(row.source_url, row.id);
        }
        totalCreated += (data as unknown[] | null)?.length ?? 0;
      }
      for (const row of toUpdate) {
        const id = existingByUrl.get(row.source_url);
        if (!id) continue;
        const proposal = (({ __vote_bundle, ...proposalRow }: BatchRow) => proposalRow)(row);
        const { error } = await supabase.from('proposals').update(proposal).eq('id', id);
        if (error) { console.error(`update failed: ${error.message}`); continue; }
        proposalIdBySourceUrl.set(row.source_url, id);
        totalUpdated += 1;
      }

      const voteBundles = batch
        .map((row) => {
          const source = row.source_url;
          const proposalId = proposalIdBySourceUrl.get(source);
          const vote = row.__vote_bundle;
          if (!proposalId || !vote) return null;
          return {
            proposal_id: proposalId,
            event: {
              source_event_id: vote.source_event_id,
              chamber: vote.chamber,
              vote_method: vote.vote_method,
              happened_at: vote.happened_at,
              result: vote.result,
              for_count: vote.for_count,
              against_count: vote.against_count,
              abstain_count: vote.abstain_count,
              absent_count: vote.absent_count,
              total_eligible: vote.total_eligible,
              total_cast: vote.total_cast,
              quorum_required: vote.quorum_required,
              quorum_reached: vote.quorum_reached,
              source_url: vote.source_url,
              source_payload: vote.source_payload,
            },
            groups: vote.groups,
            records: vote.records,
          };
        })
        .filter(Boolean);
      if (voteBundles.length > 0) {
        await upsertProposalVoteBundles(supabase, voteBundles as Parameters<typeof upsertProposalVoteBundles>[1]);
      }
      batch.length = 0;
    };

    console.error(`  -> fetching Bundestag Vorgänge (WP${args.wahlperiode})`);
    for await (const vorgang of fetchVorgaenge(apiKey, args.wahlperiode, args.maxPages)) {
      totalFetched += 1;
      const row = buildProposalFromVorgang(vorgang);
      if (row) {
        const voteBundle = buildVoteBundleFromDipVorgang(vorgang);
        batch.push({ ...row, __vote_bundle: voteBundle });
      }
      if (batch.length >= 100) await flushBatch();
    }
    await flushBatch();

    if (args.apply) {
      await supabase.rpc('increment_total_records', { p_source_type: 'bundestag_dip', p_delta: totalCreated });
      await updateRunLog(supabase, runId, { status: 'completed', records_fetched: totalFetched, records_created: totalCreated, records_updated: totalUpdated });
    }

    console.log(JSON.stringify({
      apply: args.apply,
      wahlperiode: args.wahlperiode,
      fetched: totalFetched,
      created: totalCreated,
      updated: totalUpdated,
    }, null, 2));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('sync-bundestag-dip error:', msg);
    await updateRunLog(supabase, runId, { status: 'failed', records_fetched: totalFetched, error_message: msg });
    throw err;
  }
}

main().catch((err) => { console.error(err); process.exit(1); });
