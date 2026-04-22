#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { createClient } from '@supabase/supabase-js';
import {
  buildProposalFromParlamentoPt,
  type ParlamentoPtInitiativeDetail,
  type ParlamentoPtInitiativeListResponse,
} from '../src/lib/parlamento-pt-helpers.ts';
import { fetchExistingProposalIdsBySourceUrl } from '../src/lib/proposal-sync.ts';

const API_BASE = 'https://api.votoaberto.org/api/v1';

type Args = {
  apply: boolean;
  limit: number;
  maxPages: number;
  detailConcurrency: number;
  expectProjectRef: string | null;
};

function parseArgs(argv: string[]): Args {
  const args: Args = { apply: false, limit: 100, maxPages: 200, detailConcurrency: 10, expectProjectRef: null };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === '--apply') { args.apply = true; continue; }
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
    if (token === '--detail-concurrency') {
      const next = argv[++i];
      if (!next) throw new Error('Missing value for --detail-concurrency');
      args.detailConcurrency = parseInt(next, 10);
      continue;
    }
    if (token === '--expect-project-ref') {
      const next = argv[++i];
      if (!next) throw new Error('Missing value for --expect-project-ref');
      args.expectProjectRef = next.trim();
      continue;
    }
    if (token === '--help' || token === '-h') {
      console.log('scripts/sync-parlamento-pt.ts [--apply] [--limit 100] [--max-pages 200] [--detail-concurrency 10]');
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
    .insert({ source_type: 'parlamento_pt', status: 'running' })
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

async function fetchJson<T>(url: string): Promise<T> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'poli-track sync-parlamento-pt' },
      signal: AbortSignal.timeout(30000),
    });
    if (res.ok) return (await res.json()) as T;
    if (res.status === 429 || res.status >= 500) {
      await new Promise((resolve) => setTimeout(resolve, 1000 * (attempt + 1)));
      continue;
    }
    throw new Error(`parlamento.pt ${res.status}: ${await res.text().catch(() => '')}`);
  }
  throw new Error('parlamento.pt retry limit exceeded');
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
  let detailFailures = 0;

  try {
    const ids: string[] = [];
    let offset = 0;
    for (let page = 0; page < args.maxPages; page += 1) {
      const listUrl = `${API_BASE}/iniciativas/?limit=${args.limit}&offset=${offset}`;
      const payload = await fetchJson<ParlamentoPtInitiativeListResponse>(listUrl);
      const pageRows = payload.data ?? [];
      if (pageRows.length === 0) break;
      for (const item of pageRows) {
        if (item.ini_id) ids.push(item.ini_id);
      }
      totalFetched += pageRows.length;
      offset += args.limit;
      const total = payload.pagination?.total ?? 0;
      if (total > 0 && offset >= total) break;
    }

    const rows: NonNullable<ReturnType<typeof buildProposalFromParlamentoPt>>[] = [];
    for (let index = 0; index < ids.length; index += args.detailConcurrency) {
      const chunkIds = ids.slice(index, index + args.detailConcurrency);
      const details = await Promise.allSettled(
        chunkIds.map((id) => fetchJson<ParlamentoPtInitiativeDetail>(`${API_BASE}/iniciativas/${id}`)),
      );

      for (const detail of details) {
        if (detail.status !== 'fulfilled') {
          detailFailures += 1;
          continue;
        }

        const row = buildProposalFromParlamentoPt(detail.value);
        if (row) rows.push(row);
      }

      if ((index + chunkIds.length) % 100 === 0) {
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
    }

    const deduped = new Map<string, NonNullable<ReturnType<typeof buildProposalFromParlamentoPt>>>();
    for (const row of rows) deduped.set(row.source_url, row);
    const proposals = [...deduped.values()];

    if (args.apply && proposals.length > 0) {
      const existingByUrl = await fetchExistingProposalIdsBySourceUrl(
        supabase,
        proposals.map((proposal) => proposal.source_url),
      );
      const toInsert = proposals.filter((proposal) => !existingByUrl.has(proposal.source_url));
      const toUpdate = proposals.filter((proposal) => existingByUrl.has(proposal.source_url));

      for (let i = 0; i < toInsert.length; i += 25) {
        const chunk = toInsert.slice(i, i + 25);
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
      await supabase.rpc('increment_total_records', { p_source_type: 'parlamento_pt', p_delta: totalCreated + totalUpdated });
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
      detailFailures,
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
