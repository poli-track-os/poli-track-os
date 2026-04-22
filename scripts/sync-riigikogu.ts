#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { createClient } from '@supabase/supabase-js';
import { buildProposalFromRiigikoguDraft, buildVoteBundleFromRiigikoguDraft, type RiigikoguDraftListRow } from '../src/lib/riigikogu-helpers.ts';
import { fetchExistingProposalIdsBySourceUrl, upsertProposalVoteBundles } from '../src/lib/proposal-sync.ts';

type Args = {
  apply: boolean;
  size: number;
  maxPages: number;
  expectProjectRef: string | null;
};

type RiigikoguDraftListResponse = {
  _embedded?: {
    content?: RiigikoguDraftListRow[];
  };
  page?: {
    size?: number;
    totalElements?: number;
    totalPages?: number;
    number?: number;
  };
};

let lastRequestStartedAt = 0;

function parseArgs(argv: string[]): Args {
  const args: Args = { apply: false, size: 1000, maxPages: 20, expectProjectRef: null };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === '--apply') { args.apply = true; continue; }
    if (token === '--size') {
      const next = argv[++i];
      if (!next) throw new Error('Missing value for --size');
      args.size = parseInt(next, 10);
      continue;
    }
    if (token === '--max-pages') {
      const next = argv[++i];
      if (!next) throw new Error('Missing value for --max-pages');
      args.maxPages = parseInt(next, 10);
      continue;
    }
    if (token === '--expect-project-ref') {
      const next = argv[++i];
      if (!next) throw new Error('Missing value for --expect-project-ref');
      args.expectProjectRef = next.trim();
      continue;
    }
    if (token === '--help' || token === '-h') {
      console.log('scripts/sync-riigikogu.ts [--apply] [--size 1000] [--max-pages 20]');
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
    .insert({ source_type: 'riigikogu', status: 'running' })
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

function buildRiigikoguPageUrl(size: number, page: number) {
  const url = new URL('https://api.riigikogu.ee/api/volumes/drafts');
  url.searchParams.set('draftTypeCode', 'SE');
  url.searchParams.set('lang', 'en');
  url.searchParams.set('page', String(page));
  url.searchParams.set('size', String(size));
  return url.toString();
}

async function sleep(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchPage(url: string): Promise<RiigikoguDraftListResponse> {
  const minIntervalMs = 1_100;
  const waitMs = Math.max(0, minIntervalMs - (Date.now() - lastRequestStartedAt));
  if (waitMs > 0) await sleep(waitMs);

  for (let attempt = 0; attempt < 5; attempt += 1) {
    lastRequestStartedAt = Date.now();
    const res = await fetch(url, {
      headers: { Accept: 'application/json', 'User-Agent': 'poli-track sync-riigikogu' },
      signal: AbortSignal.timeout(30000),
    });
    if (res.status === 429) {
      await sleep(5_500 * (attempt + 1));
      continue;
    }
    if (!res.ok) throw new Error(`api.riigikogu.ee ${res.status}`);
    return (await res.json()) as RiigikoguDraftListResponse;
  }

  throw new Error('api.riigikogu.ee 429');
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
    type ProposalRow = NonNullable<ReturnType<typeof buildProposalFromRiigikoguDraft>>;
    type VoteRow = ReturnType<typeof buildVoteBundleFromRiigikoguDraft>;
    type SyncRow = ProposalRow & { __vote_bundle: VoteRow };
    const rows: SyncRow[] = [];
    let totalPages: number | null = null;

    for (let page = 0; page < args.maxPages; page += 1) {
      if (totalPages !== null && page >= totalPages) break;
      const payload = await fetchPage(buildRiigikoguPageUrl(args.size, page));
      const drafts = payload._embedded?.content ?? [];
      if (page === 0) totalPages = payload.page?.totalPages ?? null;
      if (drafts.length === 0) break;
      totalFetched += drafts.length;
      for (const draft of drafts) {
        const row = buildProposalFromRiigikoguDraft(draft);
        if (row) rows.push({ ...row, __vote_bundle: buildVoteBundleFromRiigikoguDraft(draft) });
      }
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
          .insert(chunk.map(({ __vote_bundle, ...proposal }) => proposal))
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
        const { __vote_bundle, ...proposalRow } = proposal;
        const { error } = await supabase.from('proposals').update(proposalRow).eq('id', id);
        if (error) continue;
        proposalIdByUrl.set(proposal.source_url, id);
        totalUpdated += 1;
      }
      const voteBundles = proposals
        .map((proposal) => {
          const proposalId = proposalIdByUrl.get(proposal.source_url);
          const vote = proposal.__vote_bundle;
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

      await supabase.rpc('increment_total_records', { p_source_type: 'riigikogu', p_delta: totalCreated + totalUpdated });
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
      pageSize: args.size,
      totalPages,
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
