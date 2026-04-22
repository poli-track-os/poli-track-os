#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { JSDOM } from 'jsdom';
import { createClient } from '@supabase/supabase-js';
import { buildProposalFromESeimasLtEntry, type ESeimasLtDetail, type ESeimasLtListEntry } from '../src/lib/eseimas-lt-helpers.ts';
import { fetchExistingProposalIdsBySourceUrl } from '../src/lib/proposal-sync.ts';

type Args = {
  apply: boolean;
  detailConcurrency: number;
  maxPages: number | null;
  expectProjectRef: string | null;
};

type InitialListState = {
  actionUrl: string;
  cookieHeader: string;
  formId: string;
  tableId: string;
  fields: Map<string, string>;
  rowCount: number;
};

const ESEIMAS_LT_LIST_URL = 'https://e-seimas.lrs.lt/portal/prefilledSearch/lt/d228346c-54b5-41cd-9eca-8044654a0f7f';
const RESULTS_PER_PAGE = 50;

function parseArgs(argv: string[]): Args {
  const args: Args = {
    apply: false,
    detailConcurrency: 8,
    maxPages: null,
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
    if (token === '--max-pages') {
      const next = argv[++index];
      if (!next) throw new Error('Missing value for --max-pages');
      args.maxPages = Math.max(1, parseInt(next, 10));
      continue;
    }
    if (token === '--expect-project-ref') {
      const next = argv[++index];
      if (!next) throw new Error('Missing value for --expect-project-ref');
      args.expectProjectRef = next.trim();
      continue;
    }
    if (token === '--help' || token === '-h') {
      console.log('scripts/sync-eseimas-lt.ts [--apply] [--detail-concurrency 8] [--max-pages 3] [--expect-project-ref ref]');
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
    .insert({ source_type: 'eseimas_lt', status: 'running' })
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

function extractUpdateContent(xml: string, id: string): string | null {
  const escapedId = id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = xml.match(new RegExp(`<update id="${escapedId}"><!\\[CDATA\\[(.*?)\\]\\]><\\/update>`, 's'));
  return match?.[1] ?? null;
}

function parseWidgetRowCount(html: string): number {
  const match = html.match(/PrimeFaces\.cw\("DataTable","resultsTable",\{[^}]*rows:(\d+),rowCount:(\d+),page:0/);
  if (!match) throw new Error('Unable to locate e-Seimas rowCount widget config');
  return parseInt(match[2], 10);
}

function collectFormFields(document: Document, formId: string): Map<string, string> {
  const form = document.getElementById(formId);
  if (!form) throw new Error(`Unable to locate form ${formId}`);
  const fields = new Map<string, string>();
  for (const element of form.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>('input[name], select[name], textarea[name]')) {
    const name = element.getAttribute('name');
    if (!name) continue;
    const tag = element.tagName.toLowerCase();
    if (tag === 'input') {
      const type = (element as HTMLInputElement).type;
      if ((type === 'checkbox' || type === 'radio') && !(element as HTMLInputElement).checked) continue;
    }
    fields.set(name, element.value);
  }
  return fields;
}

async function fetchInitialState(): Promise<InitialListState> {
  const response = await fetch(ESEIMAS_LT_LIST_URL, {
    headers: { 'User-Agent': 'Mozilla/5.0' },
    signal: AbortSignal.timeout(30000),
  });
  if (!response.ok) throw new Error(`e-seimas.lt ${response.status} for initial list page`);
  const html = await response.text();
  const document = new JSDOM(html).window.document;
  const formId = 'searchCompositeComponent:contentForm';
  const form = document.getElementById(formId);
  if (!form) throw new Error('Unable to locate Lithuanian search form');
  const action = form.getAttribute('action');
  if (!action) throw new Error('Lithuanian search form missing action URL');

  return {
    actionUrl: new URL(action, ESEIMAS_LT_LIST_URL).toString(),
    cookieHeader: (response.headers.getSetCookie?.() || []).map((value) => value.split(';')[0]).join('; '),
    formId,
    tableId: 'searchCompositeComponent:contentForm:resultsTable',
    fields: collectFormFields(document, formId),
    rowCount: parseWidgetRowCount(html),
  };
}

function parseListRows(fragment: string): ESeimasLtListEntry[] {
  const document = new JSDOM(`<table><tbody>${fragment}</tbody></table>`).window.document;
  return [...document.querySelectorAll('tr')]
    .map((row) => {
      const cells = [...row.querySelectorAll('td')];
      if (cells.length < 7) return null;
      const titleCell = cells[3];
      const anchor = titleCell.querySelector('a[href*="/portal/legalAct/lt/TAP/"]');
      if (!anchor) return null;
      const title = cleanText(anchor.textContent);
      const sponsorLabel = cleanText(titleCell.textContent?.replace(title, '').replace(/^Parengė:\s*/i, ''));
      return {
        typeLabel: cleanText(cells[2].textContent),
        title,
        documentNumber: cleanText(cells[4].textContent),
        registeredAt: cleanText(cells[5].textContent) || null,
        statusLabel: cleanText(cells[6].textContent) || null,
        sponsorLabel: sponsorLabel || null,
        detailUrl: new URL(anchor.getAttribute('href') || '', ESEIMAS_LT_LIST_URL).toString(),
      } satisfies ESeimasLtListEntry;
    })
    .filter((row): row is ESeimasLtListEntry => Boolean(row));
}

async function fetchListPage(state: InitialListState, pageIndex: number): Promise<ESeimasLtListEntry[]> {
  const params = new URLSearchParams();
  for (const [name, value] of state.fields) params.set(name, value);
  params.set('javax.faces.partial.ajax', 'true');
  params.set('javax.faces.source', state.tableId);
  params.set('javax.faces.partial.execute', state.tableId);
  params.set('javax.faces.partial.render', state.tableId);
  params.set('javax.faces.behavior.event', 'page');
  params.set('javax.faces.partial.event', 'page');
  params.set(state.formId, state.formId);
  params.set(`${state.formId}_SUBMIT`, '1');
  params.set(`${state.tableId}_selection`, '');
  params.set(`${state.tableId}_pagination`, 'true');
  params.set(`${state.tableId}_first`, String(pageIndex * RESULTS_PER_PAGE));
  params.set(`${state.tableId}_rows`, String(RESULTS_PER_PAGE));
  params.set(`${state.tableId}_page`, String(pageIndex));
  params.set(`${state.tableId}_encodeFeature`, 'true');

  const response = await fetch(state.actionUrl, {
    method: 'POST',
    headers: {
      'User-Agent': 'Mozilla/5.0',
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      'Faces-Request': 'partial/ajax',
      'X-Requested-With': 'XMLHttpRequest',
      ...(state.cookieHeader ? { Cookie: state.cookieHeader } : {}),
      Referer: ESEIMAS_LT_LIST_URL,
    },
    body: params.toString(),
    signal: AbortSignal.timeout(30000),
  });
  if (!response.ok) throw new Error(`e-seimas.lt ${response.status} for list page ${pageIndex + 1}`);
  const xml = await response.text();

  const viewState = extractUpdateContent(xml, 'javax.faces.ViewState');
  if (viewState) state.fields.set('javax.faces.ViewState', viewState);

  const tableUpdate = extractUpdateContent(xml, state.tableId);
  if (!tableUpdate) throw new Error(`Lithuanian partial response missing ${state.tableId} update on page ${pageIndex + 1}`);
  return parseListRows(tableUpdate);
}

function cleanNodeText(node: Element | null): string {
  if (!node) return '';
  const clone = node.cloneNode(true) as Element;
  for (const nested of clone.querySelectorAll('script, style, img, .ui-tooltip, .ui-overlaypanel')) nested.remove();
  return cleanText(clone.textContent);
}

function parseDetail(html: string): ESeimasLtDetail {
  const document = new JSDOM(html).window.document;
  const fields = new Map<string, string>();

  for (const row of document.querySelectorAll('tr')) {
    const cells = [...row.querySelectorAll('td')].map((cell) => cleanNodeText(cell));
    for (let index = 0; index < cells.length - 1; index += 1) {
      if (!cells[index].endsWith(':')) continue;
      const label = cells[index].slice(0, -1);
      const value = cells[index + 1];
      if (value) fields.set(label, value);
    }
  }

  const chronologyDates = [...new Set(
    [...document.querySelectorAll('[id="mainForm:chronologyOverlay"], [id^="mainForm:chronologyOverlay"]')]
      .flatMap((node) => cleanNodeText(node).match(/\d{4}-\d{2}-\d{2}/g) ?? []),
  )];

  return {
    typeLabel: fields.get('Rūšis') ?? null,
    registeredAt: fields.get('Reg. data') ?? null,
    statusLabel: fields.get('Būsena') ?? null,
    sponsorLabel: fields.get('Parengė') ?? null,
    chronologyDates,
  };
}

async function fetchHtml(url: string): Promise<string> {
  const response = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0' },
    signal: AbortSignal.timeout(30000),
  });
  if (!response.ok) throw new Error(`e-seimas.lt ${response.status} for ${url}`);
  return await response.text();
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

  try {
    const state = await fetchInitialState();
    const totalPages = Math.max(1, Math.ceil(state.rowCount / RESULTS_PER_PAGE));
    const pageLimit = args.maxPages ? Math.min(totalPages, args.maxPages) : totalPages;
    const entries: ESeimasLtListEntry[] = [];

    for (let pageIndex = 0; pageIndex < pageLimit; pageIndex += 1) {
      const pageRows = await fetchListPage(state, pageIndex);
      entries.push(...pageRows);
      console.error(`eseimas_lt list page ${pageIndex + 1}/${pageLimit}: rows=${pageRows.length}`);
    }

    totalFetched = entries.length;
    const proposalCandidates = entries.filter((entry) => cleanText(entry.typeLabel) === 'Įstatymo projektas');
    const detailPairs = await mapWithConcurrency(proposalCandidates, args.detailConcurrency, async (entry, index) => {
      if ((index + 1) % 100 === 0 || index === proposalCandidates.length - 1) {
        console.error(`eseimas_lt detail ${index + 1}/${proposalCandidates.length}`);
      }
      const detail = parseDetail(await fetchHtml(entry.detailUrl));
      return { entry, detail };
    });

    const proposals = detailPairs
      .map(({ entry, detail }) => buildProposalFromESeimasLtEntry(entry, detail))
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

      await supabase.rpc('increment_total_records', { p_source_type: 'eseimas_lt', p_delta: totalCreated + totalUpdated });
      await updateRunLog(supabase, runId, {
        status: 'completed',
        records_fetched: totalFetched,
        records_created: totalCreated,
        records_updated: totalUpdated,
      });
    }

    console.log(JSON.stringify({
      apply: args.apply,
      rowCount: state.rowCount,
      fetched: totalFetched,
      proposalCandidates: proposalCandidates.length,
      prepared: uniqueProposals.length,
      created: totalCreated,
      updated: totalUpdated,
      pagesCollected: pageLimit,
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
