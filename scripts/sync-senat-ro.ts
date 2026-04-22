#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { JSDOM } from 'jsdom';
import { createClient } from '@supabase/supabase-js';
import { buildProposalFromSenatRoEntry, type SenatRoDetail, type SenatRoListEntry } from '../src/lib/senat-ro-helpers.ts';
import { fetchExistingProposalIdsBySourceUrl } from '../src/lib/proposal-sync.ts';

type Args = {
  apply: boolean;
  years: string[];
  concurrency: number;
  expectProjectRef: string | null;
};

const DEFAULT_YEARS = Array.from({ length: 2026 - 1990 + 1 }, (_, index) => String(2026 - index));
const SENAT_RO_SEARCH_URL = 'https://www.senat.ro/Legis/Lista.aspx';

function parseArgs(argv: string[]): Args {
  const args: Args = { apply: false, years: [...DEFAULT_YEARS], concurrency: 6, expectProjectRef: null };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === '--apply') {
      args.apply = true;
      continue;
    }
    if (token === '--years') {
      const next = argv[++index];
      if (!next) throw new Error('Missing value for --years');
      args.years = next.split(',').map((value) => value.trim()).filter(Boolean);
      continue;
    }
    if (token === '--concurrency') {
      const next = argv[++index];
      if (!next) throw new Error('Missing value for --concurrency');
      args.concurrency = Math.max(1, parseInt(next, 10));
      continue;
    }
    if (token === '--expect-project-ref') {
      const next = argv[++index];
      if (!next) throw new Error('Missing value for --expect-project-ref');
      args.expectProjectRef = next.trim();
      continue;
    }
    if (token === '--help' || token === '-h') {
      console.log('scripts/sync-senat-ro.ts [--apply] [--years 2026,2025] [--concurrency 6] [--expect-project-ref ref]');
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
    .insert({ source_type: 'senat_ro', status: 'running' })
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
  payload: { status: 'completed' | 'failed'; records_fetched: number; records_created?: number; records_updated?: number; error_message?: string | null },
) {
  if (!runId) return;
  await supabase.from('scrape_runs').update({ ...payload, completed_at: new Date().toISOString() }).eq('id', runId);
}

async function fetchHtml(url: string, init?: RequestInit): Promise<string> {
  const response = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0', ...(init?.headers ?? {}) },
    ...init,
    signal: AbortSignal.timeout(60000),
  });
  if (!response.ok) throw new Error(`senat.ro ${response.status} for ${url}`);
  return await response.text();
}

function buildSearchPayload(document: Document, year: string): URLSearchParams {
  const form = new URLSearchParams();
  for (const input of [...document.querySelectorAll('input')]) {
    const name = input.getAttribute('name');
    if (!name) continue;
    const type = (input.getAttribute('type') || '').toLowerCase();
    if (type === 'hidden' || type === 'text') {
      form.set(name, input.getAttribute('value') || '');
    }
  }
  for (const select of [...document.querySelectorAll('select')]) {
    const name = select.getAttribute('name');
    if (!name) continue;
    const selectedValue = select.querySelector('option[selected]')?.getAttribute('value')
      ?? select.querySelector('option')?.getAttribute('value')
      ?? '';
    form.set(name, selectedValue);
  }
  form.set('ctl00$B_Center$Lista$ddAni', year);
  form.set('ctl00$B_Center$Lista$chkFaraPaginare', 'on');
  form.set('ctl00$B_Center$Lista$btnCauta2', 'Caută');
  return form;
}

function parseInitiators(value: string): string[] {
  return value
    .split(/\s*;\s*/)
    .map((part) => part.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
}

function parseListEntries(html: string): SenatRoListEntry[] {
  const dom = new JSDOM(html);
  const rows = [...dom.window.document.querySelectorAll('#ctl00_B_Center_Lista_grdLista tr')].slice(1);
  const entries: SenatRoListEntry[] = [];

  for (const row of rows) {
    if (row.querySelector('th')) continue;
    const cells = [...row.querySelectorAll('td')];
    if (cells.length < 4) continue;

    const numberText = cells[1].textContent?.replace(/\s+/g, ' ').trim() ?? '';
    const match = numberText.match(/^([A-Z]+[0-9]+)\/(\d{4})$/i);
    if (!match) continue;
    const title = cells[2].querySelector('b')?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
    const initiatorText = cells[2].querySelector('.lista-legis-table-initiatori-container div:last-child')?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
    const statusLabel = cells[3].textContent?.replace(/\s+/g, ' ').trim() ?? '';

    entries.push({
      number: match[1].toUpperCase(),
      year: match[2],
      title,
      initiators: parseInitiators(initiatorText),
      statusLabel,
    });
  }

  return entries;
}

function extractTableValue(document: Document, label: string): string | null {
  const rows = [...document.querySelectorAll('table.legislation-list-table tbody tr')];
  for (const row of rows) {
    const cells = [...row.querySelectorAll('td')];
    if (cells.length < 2) continue;
    const key = cells[0].textContent?.replace(/\s+/g, ' ').trim() ?? '';
    if (key === label) {
      return cells[1].textContent?.replace(/\s+/g, ' ').trim() ?? null;
    }
  }
  return null;
}

function parseDetail(html: string): SenatRoDetail {
  const dom = new JSDOM(html);
  const document = dom.window.document;

  const procedureDates = [...document.querySelectorAll('table.legislative-procedure-table tbody tr td:first-child')]
    .map((cell) => cell.textContent?.replace(/\s+/g, ' ').trim() ?? '')
    .filter(Boolean);

  return {
    firstChamber: extractTableValue(document, 'Prima cameră:'),
    initiativeType: extractTableValue(document, 'Tip inițiativă:'),
    initiators: parseInitiators(extractTableValue(document, 'Inițiatori:') ?? ''),
    statusLabel: extractTableValue(document, 'Stadiu:') ?? '',
    lawCharacter: extractTableValue(document, 'Caracterul legii:'),
    adoptionDeadline: extractTableValue(document, 'Termen adoptare:'),
    procedureDates,
  };
}

async function mapWithConcurrency<T, R>(items: T[], concurrency: number, mapper: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      results[currentIndex] = await mapper(items[currentIndex]);
    }
  }

  const workerCount = Math.max(1, Math.min(concurrency, items.length || 1));
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return results;
}

async function fetchYearEntries(year: string): Promise<SenatRoListEntry[]> {
  const searchHtml = await fetchHtml(SENAT_RO_SEARCH_URL);
  const searchDom = new JSDOM(searchHtml);
  const payload = buildSearchPayload(searchDom.window.document, year);
  const resultHtml = await fetchHtml(SENAT_RO_SEARCH_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: payload.toString(),
  });
  return parseListEntries(resultHtml);
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
  let totalPrepared = 0;
  let totalCreated = 0;
  let totalUpdated = 0;
  let totalDetailFallbacks = 0;

  try {
    for (const year of args.years) {
      const entries = await fetchYearEntries(year);
      totalFetched += entries.length;
      const proposals = (
        await mapWithConcurrency(entries, args.concurrency, async (entry) => {
          let detail: SenatRoDetail;
          try {
            const detailHtml = await fetchHtml(`https://www.senat.ro/Legis/Lista.aspx?nr_cls=${encodeURIComponent(entry.number)}&an_cls=${encodeURIComponent(entry.year)}`);
            detail = parseDetail(detailHtml);
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            if (!message.includes('senat.ro 500')) throw error;
            totalDetailFallbacks += 1;
            console.error(`senat_ro detail fallback ${entry.number}/${entry.year}: ${message}`);
            detail = {
              firstChamber: null,
              initiativeType: null,
              initiators: entry.initiators,
              statusLabel: entry.statusLabel,
              lawCharacter: null,
              adoptionDeadline: null,
              procedureDates: [],
            };
          }
          return buildProposalFromSenatRoEntry(entry, detail);
        })
      ).filter((proposal): proposal is NonNullable<typeof proposal> => Boolean(proposal));

      const deduped = new Map<string, NonNullable<(typeof proposals)[number]>>();
      for (const proposal of proposals) deduped.set(proposal.source_url, proposal);
      const uniqueProposals = [...deduped.values()];

      totalPrepared += uniqueProposals.length;
      console.error(`senat_ro year ${year}: fetched=${entries.length} prepared=${uniqueProposals.length}`);

      if (args.apply && uniqueProposals.length > 0) {
        const existingByUrl = await fetchExistingProposalIdsBySourceUrl(
          supabase,
          uniqueProposals.map((proposal) => proposal.source_url),
          50,
        );

        totalCreated += uniqueProposals.filter((proposal) => !existingByUrl.has(proposal.source_url)).length;
        totalUpdated += uniqueProposals.filter((proposal) => existingByUrl.has(proposal.source_url)).length;

        for (let index = 0; index < uniqueProposals.length; index += 100) {
          const chunk = uniqueProposals.slice(index, index + 100);
          const { error } = await supabase.from('proposals').upsert(chunk, { onConflict: 'source_url' });
          if (error) throw error;
        }
      }
    }

    if (args.apply) {
      await supabase.rpc('increment_total_records', { p_source_type: 'senat_ro', p_delta: totalCreated + totalUpdated });
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
      years: args.years,
      concurrency: args.concurrency,
      detailFallbacks: totalDetailFallbacks,
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
