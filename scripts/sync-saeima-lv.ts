#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import vm from 'node:vm';
import { JSDOM } from 'jsdom';
import { createClient } from '@supabase/supabase-js';
import { buildProposalFromSaeimaLvRow, type SaeimaLvDetail, type SaeimaLvListEntry } from '../src/lib/saeima-lv-helpers.ts';
import { fetchExistingProposalIdsBySourceUrl } from '../src/lib/proposal-sync.ts';

type Args = {
  apply: boolean;
  terms: string[];
  pageSize: number;
  maxPagesPerTerm: number | null;
  expectProjectRef: string | null;
};

const DEFAULT_TERMS = ['14', '13', '12', '11', '10'];

function parseArgs(argv: string[]): Args {
  const args: Args = {
    apply: false,
    terms: [...DEFAULT_TERMS],
    pageSize: 30,
    maxPagesPerTerm: null,
    expectProjectRef: null,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === '--apply') {
      args.apply = true;
      continue;
    }
    if (token === '--terms') {
      const next = argv[++index];
      if (!next) throw new Error('Missing value for --terms');
      args.terms = next.split(',').map((value) => value.trim()).filter(Boolean);
      continue;
    }
    if (token === '--page-size') {
      const next = argv[++index];
      if (!next) throw new Error('Missing value for --page-size');
      args.pageSize = Math.max(1, parseInt(next, 10));
      continue;
    }
    if (token === '--max-pages-per-term') {
      const next = argv[++index];
      if (!next) throw new Error('Missing value for --max-pages-per-term');
      args.maxPagesPerTerm = Math.max(1, parseInt(next, 10));
      continue;
    }
    if (token === '--expect-project-ref') {
      const next = argv[++index];
      if (!next) throw new Error('Missing value for --expect-project-ref');
      args.expectProjectRef = next.trim();
      continue;
    }
    if (token === '--help' || token === '-h') {
      console.log('scripts/sync-saeima-lv.ts [--apply] [--terms 14,13] [--page-size 30] [--max-pages-per-term 2]');
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
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

async function ensureRunLog(supabase: ReturnType<typeof createClient>): Promise<string | null> {
  const { data, error } = await supabase
    .from('scrape_runs')
    .insert({ source_type: 'saeima_lv', status: 'running' })
    .select('id')
    .single();
  if (error) {
    console.error('ensureRunLog failed:', error.message);
    return null;
  }
  return (data as { id: string }).id;
}

async function updateRunLog(
  supabase: ReturnType<typeof createClient>,
  runId: string | null,
  payload: {
    status: 'completed' | 'failed';
    records_fetched: number;
    records_created?: number;
    records_updated?: number;
    error_message?: string | null;
  },
) {
  if (!runId) return;
  await supabase.from('scrape_runs').update({ ...payload, completed_at: new Date().toISOString() }).eq('id', runId);
}

function decodeHtml(bytes: ArrayBuffer, contentType: string | null): string {
  const charsetMatch = (contentType ?? '').match(/charset=([^;]+)/i);
  const charset = charsetMatch?.[1]?.trim().toLowerCase() || 'utf-8';
  const preferredCharset = charset === 'iso-8859-1' ? 'windows-1257' : charset;
  try {
    return new TextDecoder(preferredCharset).decode(bytes);
  } catch {
    return new TextDecoder('utf-8').decode(bytes);
  }
}

async function fetchHtml(url: string): Promise<string> {
  const response = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0' },
    signal: AbortSignal.timeout(30000),
  });
  if (!response.ok) throw new Error(`saeima.lv ${response.status} for ${url}`);
  return decodeHtml(await response.arrayBuffer(), response.headers.get('content-type'));
}

function parseListEntries(term: string, html: string): SaeimaLvListEntry[] {
  const dom = new JSDOM(html);
  const holder = dom.window.document.querySelector('#viewHolderText');
  const source = holder?.textContent ?? '';
  const entries: SaeimaLvListEntry[] = [];
  const sandbox = {
    dvRow_LPView: (statusLabel: string, title: string, reference: string, unid: string) => {
      entries.push({ term, statusLabel, title, reference, unid });
    },
  };
  vm.runInNewContext(source, sandbox, { timeout: 1000 });
  return entries;
}

function parseLatvianDate(value: string): string | null {
  const match = value.match(/(\d{2})\.(\d{2})\.(\d{4})/);
  if (!match) return null;
  return `${match[3]}-${match[2]}-${match[1]}`;
}

function parseDetail(html: string): SaeimaLvDetail {
  const dom = new JSDOM(html);
  const document = dom.window.document;

  const dateRow = [...document.querySelectorAll('#mainInfoTable tr')].find((row) => {
    const label = row.querySelector('.labelCellCT2')?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
    return label === 'Datums';
  });
  const dates = dateRow
    ? [...dateRow.querySelectorAll('td')]
        .slice(1)
        .map((cell) => cell.textContent?.replace(/\s+/g, ' ').trim() ?? '')
        .map((value) => parseLatvianDate(value))
        .filter((value): value is string => Boolean(value))
    : [];

  let responsibleCommittee: string | null = null;
  const committeeBlock = document.querySelector('#respCommitteeBlock');
  if (committeeBlock) {
    const committeeText = committeeBlock.textContent?.replace(/\s+/g, ' ').trim() ?? '';
    const marker = 'Atbildīgā komisija:';
    if (committeeText.includes(marker)) {
      responsibleCommittee = committeeText.split(marker)[1]?.trim() || null;
    }
  }

  const sponsors: string[] = [];
  for (const block of document.querySelectorAll('.addBlock')) {
    const text = block.textContent?.replace(/\s+/g, ' ').trim() ?? '';
    const marker = 'Iesniedzēji:';
    if (!text.startsWith(marker)) continue;
    sponsors.push(text.slice(marker.length).trim());
  }

  return {
    submittedDate: dates[0] ?? null,
    lastActionDate: dates.at(-1) ?? null,
    sponsors,
    responsibleCommittee,
  };
}

async function fetchTermEntries(term: string, pageSize: number, maxPagesPerTerm: number | null): Promise<SaeimaLvListEntry[]> {
  const entries: SaeimaLvListEntry[] = [];
  for (let pageIndex = 0; ; pageIndex += 1) {
    if (maxPagesPerTerm && pageIndex >= maxPagesPerTerm) break;
    const start = pageIndex * pageSize + 1;
    const html = await fetchHtml(`https://titania.saeima.lv/LIVS${term}/saeimalivs${term}.nsf/webAll?OpenView&Count=${pageSize}&Start=${start}`);
    const pageEntries = parseListEntries(term, html);
    if (pageEntries.length === 0) break;
    entries.push(...pageEntries);
    if (pageEntries.length < pageSize) break;
  }
  return entries;
}

async function main() {
  loadLocalEnv();
  const args = parseArgs(process.argv.slice(2));
  const supabase = getSupabaseClient(args.apply);

  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
  const projectRef = (() => {
    try {
      return new URL(url).hostname.split('.')[0];
    } catch {
      return null;
    }
  })();
  if (args.expectProjectRef && projectRef !== args.expectProjectRef) {
    throw new Error(`Resolved project ref ${projectRef ?? 'unknown'} does not match expected ${args.expectProjectRef}`);
  }

  const runId = args.apply ? await ensureRunLog(supabase) : null;
  let totalFetched = 0;
  let totalCreated = 0;
  let totalUpdated = 0;
  let totalPrepared = 0;

  try {
    for (const term of args.terms) {
      const entries = await fetchTermEntries(term, args.pageSize, args.maxPagesPerTerm);
      totalFetched += entries.length;

      const proposals = [];
      for (const entry of entries) {
        const detailHtml = await fetchHtml(`https://titania.saeima.lv/LIVS${term}/saeimalivs${term}.nsf/0/${encodeURIComponent(entry.unid)}?OpenDocument`);
        const detail = parseDetail(detailHtml);
        const proposal = buildProposalFromSaeimaLvRow(entry, detail);
        if (proposal) proposals.push(proposal);
      }

      totalPrepared += proposals.length;

      if (args.apply && proposals.length > 0) {
        const existingByUrl = await fetchExistingProposalIdsBySourceUrl(
          supabase,
          proposals.map((proposal) => proposal.source_url),
          50,
        );

        totalCreated += proposals.filter((proposal) => !existingByUrl.has(proposal.source_url)).length;
        totalUpdated += proposals.filter((proposal) => existingByUrl.has(proposal.source_url)).length;

        for (let index = 0; index < proposals.length; index += 100) {
          const chunk = proposals.slice(index, index + 100);
          const { error } = await supabase.from('proposals').upsert(chunk, { onConflict: 'source_url' });
          if (error) throw error;
        }
      }
    }

    if (args.apply) {
      await supabase.rpc('increment_total_records', { p_source_type: 'saeima_lv', p_delta: totalCreated + totalUpdated });
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
      prepared: totalPrepared,
      created: totalCreated,
      updated: totalUpdated,
      terms: args.terms,
    }, null, 2));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await updateRunLog(supabase, runId, {
      status: 'failed',
      records_fetched: totalFetched,
      records_created: totalCreated,
      records_updated: totalUpdated,
      error_message: message,
    });
    throw error;
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
