#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { createClient } from '@supabase/supabase-js';
import {
  buildProposalFromRiksdagDocument,
  buildVoteBundlesFromRiksdagRows,
  extractReportCodeFromDocumentStatus,
  type RiksdagDocument,
  type RiksdagDocumentStatusResponse,
  type RiksdagVoteringRow,
} from '../src/lib/riksdag-helpers.ts';
import { fetchExistingProposalIdsBySourceUrl, upsertProposalVoteBundles } from '../src/lib/proposal-sync.ts';

type Args = {
  apply: boolean;
  size: number;
  maxPages: number;
  expectProjectRef: string | null;
};

interface RiksdagResponse {
  dokumentlista?: {
    dokument?: RiksdagDocument[] | RiksdagDocument;
    '@nasta_sida'?: string;
  };
}

interface RiksdagVoteringListResponse {
  voteringlista?: {
    votering?: RiksdagVoteringRow[] | RiksdagVoteringRow;
  };
}

function parseArgs(argv: string[]): Args {
  const args: Args = { apply: false, size: 100, maxPages: 200, expectProjectRef: null };
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
      console.log('scripts/sync-riksdag.ts [--apply] [--size 100] [--max-pages 200]');
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
    .insert({ source_type: 'riksdag', status: 'running' })
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

async function fetchPage(url: string): Promise<RiksdagResponse> {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'poli-track sync-riksdag' },
    signal: AbortSignal.timeout(30000),
  });
  if (!res.ok) throw new Error(`data.riksdagen.se ${res.status}`);
  return (await res.json()) as RiksdagResponse;
}

async function fetchDocumentStatus(dokId: string): Promise<RiksdagDocumentStatusResponse | null> {
  const res = await fetch(`https://data.riksdagen.se/dokumentstatus/${encodeURIComponent(dokId)}.json`, {
    headers: { 'User-Agent': 'poli-track sync-riksdag' },
    signal: AbortSignal.timeout(30000),
  });
  if (!res.ok) return null;
  return (await res.json()) as RiksdagDocumentStatusResponse;
}

async function fetchVotesForReport(rm: string, reportCode: string): Promise<RiksdagVoteringRow[]> {
  const url = `https://data.riksdagen.se/voteringlista/?rm=${encodeURIComponent(rm)}&bet=${encodeURIComponent(reportCode)}&utformat=json&sz=9999`;
  const res = await fetch(url, {
    headers: { 'User-Agent': 'poli-track sync-riksdag' },
    signal: AbortSignal.timeout(30000),
  });
  if (!res.ok) return [];
  const payload = (await res.json()) as RiksdagVoteringListResponse;
  const rows = payload.voteringlista?.votering;
  return Array.isArray(rows) ? rows : (rows ? [rows] : []);
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
    type ProposalRow = NonNullable<ReturnType<typeof buildProposalFromRiksdagDocument>>;
    type SyncRow = ProposalRow & { __rm: string | null; __dokId: string | null };
    const rows: SyncRow[] = [];
    let nextUrl = `https://data.riksdagen.se/dokumentlista/?doktyp=prop&utformat=json&sz=${args.size}`;
    for (let page = 0; page < args.maxPages && nextUrl; page += 1) {
      const payload = await fetchPage(nextUrl);
      const docsField = payload.dokumentlista?.dokument;
      const docs = Array.isArray(docsField) ? docsField : (docsField ? [docsField] : []);
      if (docs.length === 0) break;
      totalFetched += docs.length;
      for (const doc of docs) {
        const row = buildProposalFromRiksdagDocument(doc);
        if (row) rows.push({ ...row, __rm: doc.rm ?? null, __dokId: doc.dok_id ?? null });
      }
      const nxt = payload.dokumentlista?.['@nasta_sida'];
      nextUrl = nxt ?? '';
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
      const proposalIdBySourceUrl = new Map(existingByUrl);

      for (let i = 0; i < toInsert.length; i += 100) {
        const chunk = toInsert.slice(i, i + 100);
        const { data, error } = await supabase
          .from('proposals')
          .insert(chunk.map(({ __rm, __dokId, ...proposal }) => proposal))
          .select('id, source_url');
        if (error) throw error;
        for (const row of data ?? []) {
          if (row.source_url) proposalIdBySourceUrl.set(row.source_url, row.id);
        }
        totalCreated += (data as unknown[] | null)?.length ?? 0;
      }
      for (const proposal of toUpdate) {
        const id = existingByUrl.get(proposal.source_url);
        if (!id) continue;
        const { __rm, __dokId, ...proposalRow } = proposal;
        const { error } = await supabase.from('proposals').update(proposalRow).eq('id', id);
        if (error) continue;
        proposalIdBySourceUrl.set(proposal.source_url, id);
        totalUpdated += 1;
      }

      const statusCache = new Map<string, RiksdagDocumentStatusResponse | null>();
      const votesCache = new Map<string, RiksdagVoteringRow[]>();
      const voteBundles: Parameters<typeof upsertProposalVoteBundles>[1] = [];
      for (const proposal of proposals) {
        const proposalId = proposalIdBySourceUrl.get(proposal.source_url);
        if (!proposalId || !proposal.__dokId || !proposal.__rm) continue;
        let status = statusCache.get(proposal.__dokId);
        if (status === undefined) {
          status = await fetchDocumentStatus(proposal.__dokId);
          statusCache.set(proposal.__dokId, status);
        }
        if (!status) continue;
        const reportCode = extractReportCodeFromDocumentStatus(status);
        if (!reportCode) continue;
        const cacheKey = `${proposal.__rm}:${reportCode}`;
        let voteRows = votesCache.get(cacheKey);
        if (!voteRows) {
          voteRows = await fetchVotesForReport(proposal.__rm, reportCode);
          votesCache.set(cacheKey, voteRows);
        }
        if (voteRows.length === 0) continue;
        const bundles = buildVoteBundlesFromRiksdagRows(voteRows).map((bundle) => ({
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
        }));
        voteBundles.push(...bundles);
      }
      if (voteBundles.length > 0) {
        await upsertProposalVoteBundles(supabase, voteBundles);
      }
      await supabase.rpc('increment_total_records', { p_source_type: 'riksdag', p_delta: totalCreated + totalUpdated });
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
