#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { createClient } from '@supabase/supabase-js';
import {
  buildProposalFromSejmPrint,
  buildVoteBundleFromSejmVoting,
  extractPrintNumbersFromVoting,
  type SejmPrint,
  type SejmVotingEntry,
} from '../src/lib/sejm-helpers.ts';
import { fetchExistingProposalIdsBySourceUrl, upsertProposalVoteBundles } from '../src/lib/proposal-sync.ts';

type Args = {
  apply: boolean;
  term: number;
  limit: number;
  maxPages: number;
  maxVoteSittings: number;
  expectProjectRef: string | null;
};

function parseArgs(argv: string[]): Args {
  const args: Args = { apply: false, term: 10, limit: 200, maxPages: 100, maxVoteSittings: 120, expectProjectRef: null };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === '--apply') { args.apply = true; continue; }
    if (token === '--term') {
      const next = argv[++i];
      if (!next) throw new Error('Missing value for --term');
      args.term = parseInt(next, 10);
      continue;
    }
    if (token === '--limit') {
      const next = argv[++i];
      if (!next) throw new Error('Missing value for --limit');
      args.limit = parseInt(next, 10);
      continue;
    }
    if (token === '--max-pages') {
      const next = argv[++i];
      if (!next) throw new Error('Missing value for --max-pages');
      args.maxPages = parseInt(next, 10);
      continue;
    }
    if (token === '--max-vote-sittings') {
      const next = argv[++i];
      if (!next) throw new Error('Missing value for --max-vote-sittings');
      args.maxVoteSittings = parseInt(next, 10);
      continue;
    }
    if (token === '--expect-project-ref') {
      const next = argv[++i];
      if (!next) throw new Error('Missing value for --expect-project-ref');
      args.expectProjectRef = next.trim();
      continue;
    }
    if (token === '--help' || token === '-h') {
      console.log('scripts/sync-sejm.ts [--apply] [--term 10] [--limit 200] [--max-pages 100]');
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
    .insert({ source_type: 'sejm', status: 'running' })
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

async function fetchPrints(term: number, limit: number, offset: number): Promise<SejmPrint[]> {
  const url = `https://api.sejm.gov.pl/sejm/term${term}/prints?limit=${limit}&offset=${offset}`;
  const res = await fetch(url, {
    headers: { 'User-Agent': 'poli-track sync-sejm' },
    signal: AbortSignal.timeout(30000),
  });
  if (!res.ok) throw new Error(`api.sejm.gov.pl ${res.status}`);
  return (await res.json()) as SejmPrint[];
}

async function fetchSittingVotings(term: number, sitting: number): Promise<SejmVotingEntry[]> {
  const res = await fetch(`https://api.sejm.gov.pl/sejm/term${term}/votings/${sitting}`, {
    headers: { 'User-Agent': 'poli-track sync-sejm' },
    signal: AbortSignal.timeout(30000),
  });
  if (!res.ok) return [];
  return (await res.json()) as SejmVotingEntry[];
}

async function fetchVotingDetails(term: number, sitting: number, votingNumber: number): Promise<SejmVotingEntry | null> {
  const res = await fetch(`https://api.sejm.gov.pl/sejm/term${term}/votings/${sitting}/${votingNumber}`, {
    headers: { 'User-Agent': 'poli-track sync-sejm' },
    signal: AbortSignal.timeout(30000),
  });
  if (!res.ok) return null;
  return (await res.json()) as SejmVotingEntry;
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
    type ProposalRow = NonNullable<ReturnType<typeof buildProposalFromSejmPrint>>;
    type SyncRow = ProposalRow & { __printNumber: string | null };
    const rows: SyncRow[] = [];
    let offset = 0;
    for (let page = 0; page < args.maxPages; page += 1) {
      const prints = await fetchPrints(args.term, args.limit, offset);
      if (prints.length === 0) break;
      totalFetched += prints.length;
      for (const print of prints) {
        const row = buildProposalFromSejmPrint(print);
        if (row) rows.push({ ...row, __printNumber: print.number ?? null });
      }
      offset += args.limit;
    }

    const deduped = new Map<string, SyncRow>();
    for (const row of rows) deduped.set(row.source_url, row);
    const proposals = [...deduped.values()];

    if (args.apply && proposals.length > 0) {
      const existingByUrl = await fetchExistingProposalIdsBySourceUrl(
        supabase,
        proposals.map((proposal) => proposal.source_url),
      );
      const toInsert = proposals.filter((proposal) => !existingByUrl.has(proposal.source_url));
      const toUpdate = proposals.filter((proposal) => existingByUrl.has(proposal.source_url));
      const proposalIdByUrl = new Map(existingByUrl);

      for (let i = 0; i < toInsert.length; i += 100) {
        const chunk = toInsert.slice(i, i + 100);
        const { data, error } = await supabase
          .from('proposals')
          .insert(chunk.map(({ __printNumber, ...proposal }) => proposal))
          .select('id, source_url');
        if (error) throw error;
        for (const row of data ?? []) {
          if (row.source_url) proposalIdByUrl.set(row.source_url, row.id);
        }
        totalCreated += (data as unknown[] | null)?.length ?? 0;
      }
      for (const proposal of toUpdate) {
        const id = existingByUrl.get(proposal.source_url);
        if (!id) continue;
        const { __printNumber, ...proposalRow } = proposal;
        const { error } = await supabase.from('proposals').update(proposalRow).eq('id', id);
        if (error) continue;
        proposalIdByUrl.set(proposal.source_url, id);
        totalUpdated += 1;
      }

      const proposalIdByPrint = new Map<string, string>();
      for (const proposal of proposals) {
        const proposalId = proposalIdByUrl.get(proposal.source_url);
        const printNumber = proposal.__printNumber?.trim();
        if (!proposalId || !printNumber) continue;
        proposalIdByPrint.set(printNumber, proposalId);
      }
      const voteBundles: Parameters<typeof upsertProposalVoteBundles>[1] = [];
      for (let sitting = 1; sitting <= args.maxVoteSittings; sitting += 1) {
        const votes = await fetchSittingVotings(args.term, sitting);
        if (votes.length === 0) continue;
        for (const vote of votes) {
          const printNumbers = extractPrintNumbersFromVoting(vote);
          if (printNumbers.length === 0) continue;
          const detail = await fetchVotingDetails(args.term, sitting, vote.votingNumber ?? 0);
          if (!detail) continue;
          const bundle = buildVoteBundleFromSejmVoting(detail);
          for (const printNumber of printNumbers) {
            const proposalId = proposalIdByPrint.get(printNumber);
            if (!proposalId) continue;
            voteBundles.push({
              proposal_id: proposalId,
              event: {
                source_event_id: bundle.source_event_id,
                chamber: bundle.chamber,
                vote_method: bundle.vote_method,
                happened_at: bundle.happened_at,
                result: bundle.result,
                for_count: bundle.for_count,
                against_count: bundle.against_count,
                abstain_count: bundle.abstain_count,
                absent_count: bundle.absent_count,
                total_eligible: bundle.total_eligible,
                total_cast: bundle.total_cast,
                quorum_required: bundle.quorum_required,
                quorum_reached: bundle.quorum_reached,
                source_url: bundle.source_url,
                source_payload: bundle.source_payload,
              },
              groups: bundle.groups,
              records: bundle.records,
            });
          }
        }
      }
      if (voteBundles.length > 0) {
        await upsertProposalVoteBundles(supabase, voteBundles);
      }
      await supabase.rpc('increment_total_records', { p_source_type: 'sejm', p_delta: totalCreated + totalUpdated });
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
      prepared: proposals.length,
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
