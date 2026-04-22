#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { JSDOM } from 'jsdom';
import { createClient } from '@supabase/supabase-js';
import { buildProposalFromPspCzEntry, isPspCzBillType, type PspCzListEntry } from '../src/lib/psp-cz-helpers.ts';
import { fetchExistingProposalIdsBySourceUrl } from '../src/lib/proposal-sync.ts';

type Args = {
  apply: boolean;
  terms: string[];
  maxPages: number;
  expectProjectRef: string | null;
};

const DEFAULT_TERMS = ['10', '9', '8', '7', '6', '5', '4', '3', '2', '1'];

function parseArgs(argv: string[]): Args {
  const args: Args = { apply: false, terms: [...DEFAULT_TERMS], maxPages: 30, expectProjectRef: null };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === '--apply') { args.apply = true; continue; }
    if (token === '--term') {
      const next = argv[++i];
      if (!next) throw new Error('Missing value for --term');
      args.terms = [next.trim()];
      continue;
    }
    if (token === '--terms') {
      const next = argv[++i];
      if (!next) throw new Error('Missing value for --terms');
      args.terms = next.split(',').map((value) => value.trim()).filter(Boolean);
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
      console.log('scripts/sync-psp-cz.ts [--apply] [--term 10 | --terms 10,9,8] [--max-pages 30]');
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
    .insert({ source_type: 'psp_cz', status: 'running' })
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

async function fetchHtml(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'poli-track sync-psp-cz' },
    signal: AbortSignal.timeout(30000),
  });
  if (!res.ok) throw new Error(`psp.cz ${res.status} for ${url}`);
  const contentType = res.headers.get('content-type') ?? '';
  const charsetMatch = contentType.match(/charset=([^;]+)/i);
  const charset = charsetMatch?.[1]?.trim().toLowerCase() || 'utf-8';
  const bytes = await res.arrayBuffer();
  try {
    return new TextDecoder(charset).decode(bytes);
  } catch {
    return new TextDecoder('utf-8').decode(bytes);
  }
}

function findResultsTable(document: Document): HTMLTableElement | null {
  const tables = [...document.querySelectorAll('table')];
  for (const table of tables) {
    const headerCells = [...table.querySelectorAll('th')].map((cell) => cell.textContent?.replace(/\s+/g, ' ').trim().toLowerCase() ?? '');
    if (headerCells.includes('číslo') && headerCells.includes('úplný název') && headerCells.includes('typ tisku')) {
      return table as HTMLTableElement;
    }
  }
  return (tables[0] as HTMLTableElement | undefined) ?? null;
}

async function fetchListEntries(term: string, maxPages: number): Promise<PspCzListEntry[]> {
  const entries: PspCzListEntry[] = [];
  for (let page = 1; page <= maxPages; page += 1) {
    const html = await fetchHtml(`https://www.psp.cz/sqw/tisky.sqw?F=H&N=1&O=${term}&PT=D&RA=20&str=${page}`);
    const dom = new JSDOM(html);
    const resultsTable = findResultsTable(dom.window.document);
    const rows = resultsTable ? [...resultsTable.querySelectorAll('tr')].slice(1) : [];
    if (rows.length === 0) break;
    for (const row of rows) {
      const cells = [...row.querySelectorAll('td')];
      if (cells.length < 3) continue;
      const numberText = cells[0].textContent?.replace(/\s+/g, ' ').trim() ?? '';
      const title = cells[1].textContent?.replace(/\s+/g, ' ').trim() ?? '';
      const typeLabel = cells[2].textContent?.replace(/\s+/g, ' ').trim() ?? '';
      const link = cells[0].querySelector('a')?.getAttribute('href') ?? '';
      const printNumber = numberText.split('/')[0];
      if (!printNumber || !isPspCzBillType(typeLabel) || !link || !numberText.endsWith('/0')) continue;
      entries.push({
        printNumber,
        title,
        typeLabel,
        sourceUrl: new URL(link, 'https://www.psp.cz/sqw/').toString(),
      });
    }
    if (rows.length < 20) break;
  }
  return entries;
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
    const entryGroups = await Promise.all(args.terms.map((term) => fetchListEntries(term, args.maxPages)));
    const entries = entryGroups.flat();
    totalFetched = entries.length;
    const proposals = [];
    for (const entry of entries) {
      const html = await fetchHtml(entry.sourceUrl);
      const detailText = new JSDOM(html).window.document.body.textContent?.replace(/\s+/g, ' ').trim() ?? '';
      const proposal = buildProposalFromPspCzEntry(entry, detailText);
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

      await supabase.rpc('increment_total_records', { p_source_type: 'psp_cz', p_delta: totalCreated + totalUpdated });
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
      terms: args.terms,
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
