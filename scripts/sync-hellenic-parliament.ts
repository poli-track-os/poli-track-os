#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { JSDOM } from 'jsdom';
import { createClient } from '@supabase/supabase-js';
import {
  buildProposalFromHellenicParliamentEntry,
  type HellenicParliamentDetail,
  type HellenicParliamentListEntry,
} from '../src/lib/hellenic-parliament-helpers.ts';
import { fetchExistingProposalIdsBySourceUrl } from '../src/lib/proposal-sync.ts';

type Args = {
  apply: boolean;
  detailConcurrency: number;
  expectProjectRef: string | null;
};

type PhaseConfig = {
  key: 'submitted' | 'committee' | 'adopted';
  listUrl: string;
};

const PHASES: PhaseConfig[] = [
  { key: 'submitted', listUrl: 'https://www.hellenicparliament.gr/Nomothetiko-Ergo/Katatethenta-Nomosxedia' },
  { key: 'committee', listUrl: 'https://www.hellenicparliament.gr/Nomothetiko-Ergo/Epexergasia-stis-Epitropes' },
  { key: 'adopted', listUrl: 'https://www.hellenicparliament.gr/en/Nomothetiko-Ergo/Psifisthenta-Nomoschedia' },
];

function parseArgs(argv: string[]): Args {
  const args: Args = {
    apply: false,
    detailConcurrency: 2,
    expectProjectRef: null,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === '--apply') {
      args.apply = true;
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
      console.log('scripts/sync-hellenic-parliament.ts [--apply] [--detail-concurrency 2] [--expect-project-ref ref]');
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
    .insert({ source_type: 'hellenic_parliament', status: 'running' })
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

function cleanText(value: string | null | undefined): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function isRetriableHellenicFetchError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return (
    /hellenicparliament\.gr (403|408|409|425|429|500|502|503|504) for /i.test(message)
    || /timeout/i.test(message)
    || /fetch failed/i.test(message)
    || /aborted/i.test(message)
  );
}

async function fetchHtml(url: string): Promise<string> {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0',
          'Accept-Language': 'el,en;q=0.9',
          Referer: 'https://www.hellenicparliament.gr/',
        },
        signal: AbortSignal.timeout(45000),
      });
      if (response.ok) return await response.text();
      throw new Error(`hellenicparliament.gr ${response.status} for ${url}`);
    } catch (error) {
      if (attempt === 7 || !isRetriableHellenicFetchError(error)) throw error;
      await new Promise((resolve) => setTimeout(resolve, 5000 * (attempt + 1)));
    }
  }
  throw new Error(`hellenicparliament.gr retry exhaustion for ${url}`);
}

function isRetryableOrBlockedDetailError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /hellenicparliament\.gr (403|404|429|500|502|503|504) for /i.test(message);
}

function parseTotalPages(text: string): number {
  const normalized = cleanText(text);
  const greekMatch = normalized.match(/Βρέθηκαν\s+\d+\s+Αποτελέσματα\s+\|\s+Σελίδα\s+\d+\s+από\s+(\d+)/i);
  if (greekMatch) return parseInt(greekMatch[1], 10);
  const englishMatch = normalized.match(/Found\s+\d+\s+results\s+\|\s+Page\s+\d+\s+\/\s+(\d+)/i);
  if (englishMatch) return parseInt(englishMatch[1], 10);
  return 1;
}

function extractLawId(href: string): string | null {
  try {
    const url = new URL(href, 'https://www.hellenicparliament.gr/');
    return url.searchParams.get('law_id');
  } catch {
    return null;
  }
}

function parseListPage(html: string, phase: PhaseConfig): { totalPages: number; rows: HellenicParliamentListEntry[] } {
  const document = new JSDOM(html).window.document;
  const totalPages = parseTotalPages(document.body.textContent ?? '');
  const rows = [...document.querySelectorAll('table.grid tbody tr')]
    .map((row) => {
      const cells = [...row.querySelectorAll('td')];
      const detailAnchor = row.querySelector('a[href*="law_id="]');
      if (!detailAnchor || cells.length === 0) return null;
      const lawId = extractLawId(detailAnchor.getAttribute('href') || '');
      if (!lawId) return null;
      const detailUrl = new URL(detailAnchor.getAttribute('href') || '', 'https://www.hellenicparliament.gr/').toString();

      if (phase.key === 'submitted') {
        return {
          lawId,
          title: cleanText(cells[1]?.textContent),
          typeLabel: cleanText(cells[2]?.textContent) || null,
          ministry: cleanText(cells[3]?.textContent) || null,
          committee: null,
          phaseLabel: 'Κατατεθέντα',
          phaseDate: cleanText(cells[0]?.textContent) || null,
          detailUrl,
        } satisfies HellenicParliamentListEntry;
      }

      if (phase.key === 'committee') {
        return {
          lawId,
          title: cleanText(cells[0]?.textContent),
          typeLabel: null,
          ministry: cleanText(cells[4]?.textContent) || null,
          committee: cleanText(cells[1]?.textContent) || null,
          phaseLabel: cleanText(cells[2]?.textContent) || 'Επεξεργασία στις Επιτροπές',
          phaseDate: cleanText(cells[3]?.textContent) || null,
          detailUrl,
        } satisfies HellenicParliamentListEntry;
      }

      return {
        lawId,
        title: cleanText(cells[1]?.textContent),
        typeLabel: null,
        ministry: null,
        committee: null,
        phaseLabel: 'Ολοκλήρωση',
        phaseDate: cleanText(cells[0]?.textContent) || null,
        detailUrl,
      } satisfies HellenicParliamentListEntry;
    })
    .filter((row): row is HellenicParliamentListEntry => Boolean(row));

  return { totalPages, rows };
}

function parseDetail(html: string): HellenicParliamentDetail {
  const document = new JSDOM(html).window.document;
  const details = new Map<string, string>();
  const container = document.querySelector('dl.lawDetails');
  if (container) {
    const children = [...container.children];
    for (let index = 0; index < children.length; index += 1) {
      const child = children[index];
      if (child.tagName.toLowerCase() !== 'dt') continue;
      const label = cleanText(child.textContent);
      const next = children[index + 1];
      if (!label || !next || next.tagName.toLowerCase() !== 'dd') continue;
      details.set(label, cleanText(next.textContent));
    }
  }

  return {
    title: details.get('Τίτλος') ?? details.get('Title') ?? null,
    typeLabel: details.get('Τύπος') ?? details.get('Type') ?? null,
    ministry: details.get('Υπουργείο') ?? details.get('Ministry') ?? null,
    committee: details.get('Επιτροπή') ?? details.get('Committee') ?? null,
    phaseLabel: details.get('Φάση Επεξεργασίας') ?? details.get('Processing phase') ?? null,
    phaseDate: details.get('Ημερ/νια Φάσης επεξεργασίας') ?? details.get('Processing phase date') ?? null,
    fekNumber: details.get('Αριθμός Φεκ') ?? details.get('Fek Number') ?? null,
    lawNumber: details.get('Αριθμός Νόμου') ?? details.get('Law Number') ?? null,
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

async function collectPhaseEntries(phase: PhaseConfig): Promise<HellenicParliamentListEntry[]> {
  const firstHtml = await fetchHtml(phase.listUrl);
  const firstPage = parseListPage(firstHtml, phase);
  const rows = [...firstPage.rows];
  console.error(`hellenic_parliament ${phase.key} page 1/${firstPage.totalPages}: rows=${firstPage.rows.length}`);

  for (let pageNo = 2; pageNo <= firstPage.totalPages; pageNo += 1) {
    const pageHtml = await fetchHtml(`${phase.listUrl}?pageNo=${pageNo}`);
    const page = parseListPage(pageHtml, phase);
    rows.push(...page.rows);
    console.error(`hellenic_parliament ${phase.key} page ${pageNo}/${firstPage.totalPages}: rows=${page.rows.length}`);
  }

  return rows;
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
  let detailFallbacks = 0;

  try {
    const entries: HellenicParliamentListEntry[] = [];
    for (const phase of PHASES) {
      entries.push(...await collectPhaseEntries(phase));
    }
    totalFetched = entries.length;

    const detailPairs = await mapWithConcurrency(entries, args.detailConcurrency, async (entry, index) => {
      if ((index + 1) % 100 === 0 || index === entries.length - 1) {
        console.error(`hellenic_parliament detail ${index + 1}/${entries.length}`);
      }
      let detail: HellenicParliamentDetail;
      try {
        detail = parseDetail(await fetchHtml(`https://www.hellenicparliament.gr/Nomothetiko-Ergo/Anazitisi-Nomothetikou-Ergou?law_id=${encodeURIComponent(entry.lawId)}`));
      } catch (error) {
        if (!isRetryableOrBlockedDetailError(error)) throw error;
        detailFallbacks += 1;
        console.error(`hellenic_parliament detail fallback law_id=${entry.lawId}: ${error instanceof Error ? error.message : String(error)}`);
        detail = {
          title: null,
          typeLabel: null,
          ministry: null,
          committee: null,
          phaseLabel: null,
          phaseDate: null,
          fekNumber: null,
          lawNumber: null,
        };
      }
      return { entry, detail };
    });

    const proposals = detailPairs
      .map(({ entry, detail }) => buildProposalFromHellenicParliamentEntry(entry, detail))
      .filter((row): row is NonNullable<typeof row> => Boolean(row));

    const deduped = new Map<string, NonNullable<(typeof proposals)[number]>>();
    for (const proposal of proposals) deduped.set(proposal.source_url, proposal);
    const uniqueProposals = [...deduped.values()];

    if (args.apply && uniqueProposals.length > 0) {
      const existingByUrl = await fetchExistingProposalIdsBySourceUrl(
        supabase,
        uniqueProposals.map((proposal) => proposal.source_url),
      );

      totalCreated += uniqueProposals.filter((proposal) => !existingByUrl.has(proposal.source_url)).length;
      totalUpdated += uniqueProposals.filter((proposal) => existingByUrl.has(proposal.source_url)).length;

      for (let index = 0; index < uniqueProposals.length; index += 100) {
        const chunk = uniqueProposals.slice(index, index + 100);
        const { error } = await supabase.from('proposals').upsert(chunk, { onConflict: 'source_url' });
        if (error) throw error;
      }

      await supabase.rpc('increment_total_records', { p_source_type: 'hellenic_parliament', p_delta: totalCreated + totalUpdated });
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
      created: totalCreated,
      updated: totalUpdated,
      detailFallbacks,
      phases: PHASES.map((phase) => phase.key),
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
