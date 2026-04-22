#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { JSDOM } from 'jsdom';
import { createClient } from '@supabase/supabase-js';
import {
  buildNrsrSkSourceUrl,
  buildProposalFromNrsrSkEntry,
  isNrsrSkBillCategory,
  type NrsrSkDetail,
  type NrsrSkListEntry,
} from '../src/lib/nrsr-sk-helpers.ts';
import { fetchExistingProposalIdsBySourceUrl } from '../src/lib/proposal-sync.ts';

type Args = {
  apply: boolean;
  terms: string[];
  detailConcurrency: number;
  expectProjectRef: string | null;
};

const DEFAULT_TERMS = ['9', '8', '7', '6', '5', '4', '3', '2', '1'];
const TERM_YEAR_SWEEPS: Record<string, string[]> = {
  '9': ['2027', '2026', '2025', '2024', '2023'],
  '8': ['2023', '2022', '2021', '2020'],
  '7': ['2020', '2019', '2018', '2017', '2016'],
  '6': ['2016', '2015', '2014', '2013', '2012'],
  '5': ['2012', '2011', '2010'],
  '4': ['2010', '2009', '2008', '2007', '2006'],
  '3': ['2006', '2005', '2004', '2003', '2002'],
  '2': ['2002', '2001', '2000', '1999', '1998'],
  '1': ['1998', '1997', '1996', '1995', '1994'],
};

function parseArgs(argv: string[]): Args {
  const args: Args = { apply: false, terms: [...DEFAULT_TERMS], detailConcurrency: 3, expectProjectRef: null };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === '--apply') {
      args.apply = true;
      continue;
    }
    if (token === '--term') {
      const next = argv[++index];
      if (!next) throw new Error('Missing value for --term');
      args.terms = [next.trim()];
      continue;
    }
    if (token === '--terms') {
      const next = argv[++index];
      if (!next) throw new Error('Missing value for --terms');
      args.terms = next.split(',').map((value) => value.trim()).filter(Boolean);
      continue;
    }
    if (token === '--detail-concurrency') {
      const next = argv[++index];
      if (!next) throw new Error('Missing value for --detail-concurrency');
      args.detailConcurrency = Math.max(1, parseInt(next, 10));
      continue;
    }
    if (token === '--expect-project-ref') {
      const next = argv[++index];
      if (!next) throw new Error('Missing value for --expect-project-ref');
      args.expectProjectRef = next.trim();
      continue;
    }
    if (token === '--help' || token === '-h') {
      console.log('scripts/sync-nrsr-sk.ts [--apply] [--term 9 | --terms 9,8] [--detail-concurrency 3] [--expect-project-ref ref]');
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
    .insert({ source_type: 'nrsr_sk', status: 'running' })
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

function buildSearchUrl(term: string, year?: string): string {
  const url = new URL('https://www.nrsr.sk/web/Default.aspx');
  url.searchParams.set('sid', 'zakony/sslp');
  url.searchParams.set('Text', '');
  url.searchParams.set('CisObdobia', term);
  url.searchParams.set('DatumOd', year ? `${year}-1-1 0:0:0` : '1. 1. 1900 0:00:00');
  url.searchParams.set('DatumDo', year ? `${year}-12-31 0:0:0` : '1. 1. 2100 0:00:00');
  url.searchParams.set('FullText', 'False');
  url.searchParams.set('StateID', '');
  url.searchParams.set('CategoryID', '-1');
  url.searchParams.set('PredkladatelID', '-1');
  url.searchParams.set('Predkladatel', '');
  url.searchParams.set('PredkladatelPoslanecId', '-1');
  url.searchParams.set('Ciastka', '');
  url.searchParams.set('CisloZz', '');
  url.searchParams.set('SchvaleneOd', '1. 1. 1900 0:00:00');
  url.searchParams.set('SchvaleneDo', '1. 1. 2100 0:00:00');
  return url.toString();
}

function isRetriableFetchError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return (
    /nrsr\.sk (403|408|409|425|429|500|502|503|504) for /i.test(message)
    || /timeout/i.test(message)
    || /fetch failed/i.test(message)
    || /aborted/i.test(message)
  );
}

async function fetchHtml(url: string, timeoutMs = 120000, attempt = 1): Promise<string> {
  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0', 'Accept-Language': 'sk-SK,sk;q=0.9,en;q=0.7' },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!response.ok) throw new Error(`nrsr.sk ${response.status} for ${url}`);
    return await response.text();
  } catch (error) {
    if (attempt >= 6 || !isRetriableFetchError(error)) throw error;
    await new Promise((resolve) => setTimeout(resolve, attempt * 3000));
    return fetchHtml(url, timeoutMs, attempt + 1);
  }
}

function findResultsTable(document: Document): HTMLTableElement | null {
  const tables = [...document.querySelectorAll('table')];
  for (const table of tables) {
    const headers = [...table.querySelectorAll('th')]
      .map((cell) => cell.textContent?.replace(/\s+/g, ' ').trim() ?? '')
      .filter(Boolean);
    if (headers.includes('Návrh zákona') && headers.includes('ČPT') && headers.includes('Kategória')) {
      return table as HTMLTableElement;
    }
  }
  return null;
}

function parseListEntries(html: string): NrsrSkListEntry[] {
  const dom = new JSDOM(html);
  const table = findResultsTable(dom.window.document);
  if (!table) return [];

  const entries: NrsrSkListEntry[] = [];
  const rows = [...table.querySelectorAll('tr')].slice(1);
  for (const row of rows) {
    const cells = [...row.querySelectorAll('td')];
    if (cells.length < 7) continue;

    const detailLink = cells[0].querySelector<HTMLAnchorElement>('a[href*="MasterID="]');
    const href = detailLink?.getAttribute('href') ?? '';
    const masterId = href.match(/MasterID=(\d+)/)?.[1] ?? '';
    const categoryLabel = cells[6].textContent?.replace(/\s+/g, ' ').trim() ?? '';
    if (!masterId || !isNrsrSkBillCategory(categoryLabel)) continue;

    entries.push({
      masterId,
      title: detailLink?.textContent?.replace(/\s+/g, ' ').trim() ?? '',
      printNumber: cells[1].textContent?.replace(/\s+/g, ' ').trim() ?? '',
      statusLabel: cells[2].textContent?.replace(/\s+/g, ' ').trim() ?? '',
      deliveredDate: cells[3].textContent?.replace(/\s+/g, ' ').trim() || null,
      approvedDate: cells[4].textContent?.replace(/\s+/g, ' ').trim() || null,
      proposers: cells[5].textContent?.replace(/\s+/g, ' ').trim() || null,
      categoryLabel,
      sourceUrl: buildNrsrSkSourceUrl(masterId),
    });
  }

  return entries;
}

function parseDetail(html: string): NrsrSkDetail {
  const dom = new JSDOM(html);
  const document = dom.window.document;
  return {
    processState: document.getElementById('_sectionLayoutContainer_ctl01__ProcessStateLabel')?.textContent?.replace(/\s+/g, ' ').trim() || null,
    title: document.getElementById('_sectionLayoutContainer_ctl01__SslpNameLabel')?.textContent?.replace(/\s+/g, ' ').trim() || null,
    categoryLabel: document.getElementById('_sectionLayoutContainer_ctl01_ctl00__CategoryNameLabel')?.textContent?.replace(/\s+/g, ' ').trim() || null,
    printNumber: document.getElementById('_sectionLayoutContainer_ctl01_ctl00__CptLink')?.textContent?.replace(/\s+/g, ' ').trim() || null,
    deliveredDate: document.getElementById('_sectionLayoutContainer_ctl01_ctl00__DatumDoruceniaLabel')?.textContent?.replace(/\s+/g, ' ').trim() || null,
    proposers: document.getElementById('_sectionLayoutContainer_ctl01_ctl00__NavrhovatelLabel')?.textContent?.replace(/\s+/g, ' ').trim() || null,
  };
}

async function mapWithConcurrency<T, R>(items: T[], concurrency: number, mapper: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      results[currentIndex] = await mapper(items[currentIndex], currentIndex);
    }
  }

  const workerCount = Math.max(1, Math.min(concurrency, items.length || 1));
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return results;
}

async function fetchEntriesForTerm(term: string): Promise<{ entries: NrsrSkListEntry[]; mode: 'year-slices' }> {
  const yearEntries: NrsrSkListEntry[] = [];
  const years = TERM_YEAR_SWEEPS[term] ?? [];
  for (const year of years) {
    const html = await fetchHtml(buildSearchUrl(term, year), 120000);
    const entries = parseListEntries(html);
    console.error(`nrsr_sk term ${term} year ${year}: entries=${entries.length}`);
    yearEntries.push(...entries);
  }
  return { entries: yearEntries, mode: 'year-slices' };
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
  let totalDetailFallbacks = 0;
  const termModes: Record<string, string> = {};

  try {
    for (const term of args.terms) {
      const result = await fetchEntriesForTerm(term);
      termModes[term] = result.mode;
      console.error(`nrsr_sk term ${term}: fetched=${result.entries.length} mode=${result.mode}`);
      const uniqueEntries = [...new Map(result.entries.map((entry) => [entry.sourceUrl, entry])).values()];
      totalFetched += uniqueEntries.length;

      let termDetailFallbacks = 0;
      const detailPairs = await mapWithConcurrency(uniqueEntries, args.detailConcurrency, async (entry, index) => {
        if ((index + 1) % 100 === 0 || index === uniqueEntries.length - 1) {
          console.error(`nrsr_sk term ${term} detail ${index + 1}/${uniqueEntries.length}`);
        }
        try {
          const html = await fetchHtml(entry.sourceUrl, 45000);
          return { entry, detail: parseDetail(html) };
        } catch (error) {
          termDetailFallbacks += 1;
          const message = error instanceof Error ? error.message : String(error);
          console.error(`nrsr_sk detail fallback ${entry.masterId}: ${message}`);
          return {
            entry,
            detail: {
              processState: entry.statusLabel,
              title: entry.title,
              categoryLabel: entry.categoryLabel,
              printNumber: entry.printNumber,
              deliveredDate: entry.deliveredDate,
              proposers: entry.proposers,
            },
          };
        }
      });

      const proposals = detailPairs
      .map(({ entry, detail }) => buildProposalFromNrsrSkEntry(entry, detail))
      .filter((proposal): proposal is NonNullable<typeof proposal> => Boolean(proposal));
      totalPrepared += proposals.length;
      totalDetailFallbacks += termDetailFallbacks;

      if (args.apply && proposals.length > 0) {
        const existingByUrl = await fetchExistingProposalIdsBySourceUrl(
          supabase,
          proposals.map((proposal) => proposal.source_url),
        );
        totalCreated += proposals.filter((proposal) => !existingByUrl.has(proposal.source_url)).length;
        totalUpdated += proposals.filter((proposal) => existingByUrl.has(proposal.source_url)).length;

        for (let index = 0; index < proposals.length; index += 100) {
          const chunk = proposals.slice(index, index + 100);
          const { error } = await supabase.from('proposals').upsert(chunk, { onConflict: 'source_url' });
          if (error) throw error;
        }

        await supabase.rpc('increment_total_records', { p_source_type: 'nrsr_sk', p_delta: proposals.length });
      }
      console.error(`nrsr_sk term ${term}: prepared=${proposals.length} detailFallbacks=${termDetailFallbacks}`);
    }

    if (args.apply) {
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
      termModes,
      detailConcurrency: args.detailConcurrency,
      detailFallbacks: totalDetailFallbacks,
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
