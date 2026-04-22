#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { createClient } from '@supabase/supabase-js';
import {
  buildEduskuntaDetailUrl,
  buildEduskuntaListEntry,
  buildProposalFromEduskuntaDetail,
  pickPreferredEduskuntaListEntry,
} from '../src/lib/eduskunta-helpers.ts';
import { fetchExistingProposalIdsBySourceUrl } from '../src/lib/proposal-sync.ts';

type Args = {
  apply: boolean;
  perPage: number;
  maxPages: number;
  detailDelayMs: number;
  expectProjectRef: string | null;
};

type EduskuntaListResponse = {
  page?: number;
  perPage?: number;
  hasMore?: boolean;
  rowData?: unknown[][];
};

type EduskuntaDetailResponse = {
  rowData?: unknown[][];
};

let lastRequestStartedAt = 0;

function parseArgs(argv: string[]): Args {
  const args: Args = { apply: false, perPage: 100, maxPages: 50, detailDelayMs: 700, expectProjectRef: null };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === '--apply') { args.apply = true; continue; }
    if (token === '--per-page') {
      const next = argv[++i];
      if (!next) throw new Error('Missing value for --per-page');
      args.perPage = parseInt(next, 10);
      continue;
    }
    if (token === '--max-pages') {
      const next = argv[++i];
      if (!next) throw new Error('Missing value for --max-pages');
      args.maxPages = parseInt(next, 10);
      continue;
    }
    if (token === '--detail-delay-ms') {
      const next = argv[++i];
      if (!next) throw new Error('Missing value for --detail-delay-ms');
      args.detailDelayMs = parseInt(next, 10);
      continue;
    }
    if (token === '--expect-project-ref') {
      const next = argv[++i];
      if (!next) throw new Error('Missing value for --expect-project-ref');
      args.expectProjectRef = next.trim();
      continue;
    }
    if (token === '--help' || token === '-h') {
      console.log('scripts/sync-eduskunta.ts [--apply] [--per-page 100] [--max-pages 50] [--detail-delay-ms 700]');
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
    const separator = line.indexOf('=');
    if (separator === -1) continue;
    const key = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();
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
    .insert({ source_type: 'eduskunta', status: 'running' })
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

function buildListPageUrl(page: number, perPage: number): string {
  const url = new URL('https://avoindata.eduskunta.fi/api/v1/vaski/asiakirjatyyppinimi');
  url.searchParams.set('filter', 'Hallituksen esitys');
  url.searchParams.set('page', String(page));
  url.searchParams.set('perPage', String(perPage));
  url.searchParams.set('languageCode', 'fi');
  return url.toString();
}

async function sleep(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchJson<T>(url: string): Promise<T> {
  const minIntervalMs = 400;
  const waitMs = Math.max(0, minIntervalMs - (Date.now() - lastRequestStartedAt));
  if (waitMs > 0) await sleep(waitMs);

  for (let attempt = 0; attempt < 4; attempt += 1) {
    lastRequestStartedAt = Date.now();
    const res = await fetch(url, {
      headers: { Accept: 'application/json', 'User-Agent': 'poli-track sync-eduskunta' },
      signal: AbortSignal.timeout(30000),
    });
    if (res.status === 429 || res.status >= 500) {
      await sleep(1_500 * (attempt + 1));
      continue;
    }
    if (!res.ok) throw new Error(`avoindata.eduskunta.fi ${res.status} for ${url}`);
    return (await res.json()) as T;
  }

  throw new Error(`avoindata.eduskunta.fi transient failure for ${url}`);
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
    const preferredByReference = new Map<string, ReturnType<typeof buildEduskuntaListEntry>>();
    let scannedPages = 0;

    for (let page = 0; page < args.maxPages; page += 1) {
      const payload = await fetchJson<EduskuntaListResponse>(buildListPageUrl(page, args.perPage));
      const rows = payload.rowData ?? [];
      totalFetched += rows.length;
      scannedPages += 1;

      for (const row of rows) {
        const entry = buildEduskuntaListEntry(row);
        if (!entry) continue;
        preferredByReference.set(entry.reference, pickPreferredEduskuntaListEntry(preferredByReference.get(entry.reference) ?? null, entry));
      }

      if (!payload.hasMore || rows.length === 0) break;
    }

    const selectedEntries = [...preferredByReference.values()].filter((entry): entry is NonNullable<typeof entry> => Boolean(entry));
    const proposals: NonNullable<ReturnType<typeof buildProposalFromEduskuntaDetail>>[] = [];

    for (const entry of selectedEntries) {
      await sleep(args.detailDelayMs);
      const payload = await fetchJson<EduskuntaDetailResponse>(buildEduskuntaDetailUrl(entry.id));
      const detailRow = payload.rowData?.[0];
      if (!detailRow) continue;
      const proposal = buildProposalFromEduskuntaDetail(entry, detailRow);
      if (proposal) proposals.push(proposal);
    }

    if (args.apply && proposals.length > 0) {
      const existingByUrl = await fetchExistingProposalIdsBySourceUrl(
        supabase,
        proposals.map((proposal) => proposal.source_url),
      );
      const toInsert = proposals.filter((proposal) => !existingByUrl.has(proposal.source_url));
      const toUpdate = proposals.filter((proposal) => existingByUrl.has(proposal.source_url));

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

      await supabase.rpc('increment_total_records', { p_source_type: 'eduskunta', p_delta: totalCreated + totalUpdated });
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
      selected: selectedEntries.length,
      prepared: proposals.length,
      created: totalCreated,
      updated: totalUpdated,
      scannedPages,
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
