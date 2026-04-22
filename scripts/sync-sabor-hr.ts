#!/usr/bin/env node

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { JSDOM } from 'jsdom';
import { createClient } from '@supabase/supabase-js';
import { buildProposalFromSaborHrEntry, type SaborHrDetail, type SaborHrListEntry } from '../src/lib/sabor-hr-helpers.ts';
import { fetchExistingProposalIdsBySourceUrl } from '../src/lib/proposal-sync.ts';

type Args = {
  apply: boolean;
  maxPages: number | null;
  detailConcurrency: number;
  expectProjectRef: string | null;
};

type PageSnapshot = {
  rowCount: number;
  rows: SaborHrListEntry[];
};

type CdpClient = {
  send: <T = unknown>(method: string, params?: Record<string, unknown>) => Promise<T>;
  close: () => void;
};

type BrowserHandle = {
  process: ChildProcessWithoutNullStreams;
  port: number;
  profileDir: string;
};

const SABOR_HR_LIST_URL = 'https://edoc.sabor.hr/Akti.aspx';
const SABOR_HR_CHROMIUM_ARGS = [
  '--headless',
  '--disable-gpu',
  '--no-sandbox',
  '--remote-debugging-port=0',
  'about:blank',
];

function parseArgs(argv: string[]): Args {
  const args: Args = {
    apply: false,
    maxPages: null,
    detailConcurrency: 6,
    expectProjectRef: null,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === '--apply') {
      args.apply = true;
      continue;
    }
    if (token === '--max-pages') {
      const next = argv[++index];
      if (!next) throw new Error('Missing value for --max-pages');
      args.maxPages = Math.max(1, parseInt(next, 10));
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
      console.log('scripts/sync-sabor-hr.ts [--apply] [--max-pages 3] [--detail-concurrency 6] [--expect-project-ref ref]');
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
    .insert({ source_type: 'sabor_hr', status: 'running' })
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

async function sleep(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function launchChromium(): Promise<BrowserHandle> {
  const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'poli-track-sabor-hr-'));
  const browser = spawn('chromium', [...SABOR_HR_CHROMIUM_ARGS, `--user-data-dir=${profileDir}`], {
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  const endpoint = await new Promise<string>((resolve, reject) => {
    let stderr = '';
    const timeout = setTimeout(() => reject(new Error('Timed out waiting for Chromium DevTools endpoint')), 30000);

    const onData = (chunk: Buffer) => {
      stderr += chunk.toString('utf8');
      const match = stderr.match(/DevTools listening on (ws:\/\/127\.0\.0\.1:(\d+)\/devtools\/browser\/[^\s]+)/);
      if (!match) return;
      clearTimeout(timeout);
      resolve(match[1]);
    };

    browser.stderr.on('data', onData);
    browser.on('exit', (code) => {
      clearTimeout(timeout);
      reject(new Error(`Chromium exited before startup (code ${code ?? 'unknown'})`));
    });
  });

  const portMatch = endpoint.match(/127\.0\.0\.1:(\d+)/);
  if (!portMatch) throw new Error(`Unable to derive Chromium port from ${endpoint}`);

  return { process: browser, port: parseInt(portMatch[1], 10), profileDir };
}

async function closeChromium(handle: BrowserHandle | null) {
  if (!handle) return;
  try {
    handle.process.kill('SIGTERM');
  } catch {
    // Ignore shutdown races.
  }
  await sleep(500);
  try {
    fs.rmSync(handle.profileDir, { recursive: true, force: true });
  } catch {
    // Ignore temp cleanup failures.
  }
}

async function createPageTarget(port: number, url: string): Promise<string> {
  const response = await fetch(`http://127.0.0.1:${port}/json/new?${encodeURIComponent(url)}`, {
    method: 'PUT',
    signal: AbortSignal.timeout(30000),
  });
  if (!response.ok) {
    throw new Error(`Failed to create Chromium target (${response.status})`);
  }
  const data = await response.json() as { webSocketDebuggerUrl?: string };
  if (!data.webSocketDebuggerUrl) throw new Error('Chromium target missing webSocketDebuggerUrl');
  return data.webSocketDebuggerUrl;
}

async function connectPage(wsUrl: string): Promise<CdpClient> {
  const socket = new WebSocket(wsUrl);
  let nextId = 0;
  const pending = new Map<number, { resolve: (value: unknown) => void; reject: (reason: Error) => void }>();

  socket.onmessage = (event) => {
    const message = JSON.parse(String(event.data)) as {
      id?: number;
      result?: unknown;
      error?: { message?: string };
    };
    if (!message.id || !pending.has(message.id)) return;
    const deferred = pending.get(message.id)!;
    pending.delete(message.id);
    if (message.error) {
      deferred.reject(new Error(message.error.message || 'Unknown CDP error'));
      return;
    }
    deferred.resolve(message.result);
  };

  await new Promise<void>((resolve, reject) => {
    socket.onopen = () => resolve();
    socket.onerror = () => reject(new Error('Failed to open Chromium target WebSocket'));
  });

  return {
    send: <T = unknown>(method: string, params: Record<string, unknown> = {}) => new Promise<T>((resolve, reject) => {
      const id = ++nextId;
      pending.set(id, { resolve: (value) => resolve(value as T), reject });
      socket.send(JSON.stringify({ id, method, params }));
    }),
    close: () => socket.close(),
  };
}

async function evaluateJson<T>(page: CdpClient, expression: string): Promise<T> {
  const result = await page.send<{
    result?: {
      type?: string;
      value?: T;
    };
  }>('Runtime.evaluate', {
    expression,
    returnByValue: true,
    awaitPromise: true,
  });
  return result.result?.value as T;
}

const EXTRACT_PAGE_SNAPSHOT = `(() => {
  const rowCount = Number(document.querySelector('#ctl00_ContentPlaceHolder_gvAkti_PagerBarB_RowCount')?.textContent?.trim() || '0');
  const rows = [...document.querySelectorAll("#ctl00_ContentPlaceHolder_gvAkti_DXMainTable tr[id*='DXDataRow']")].map((row) => {
    const cells = [...row.querySelectorAll('td')].map((cell) => (cell.textContent || '').replace(/\\s+/g, ' ').trim());
    const anchor = row.querySelector("a[href*='Views/AktView.aspx?type=HTML&id=']");
    return {
      proposalCode: cells[0] || '',
      title: cells[1] || '',
      legislature: cells[2] || null,
      session: cells[3] || null,
      readingLabel: cells[4] || null,
      sponsor: cells[5] || null,
      statusLabel: cells[6] || null,
      detailUrl: anchor ? new URL(anchor.getAttribute('href'), location.href).toString() : null,
    };
  }).filter((row) => row.detailUrl);
  return { rowCount, rows };
})()`;

async function waitForPageAdvance(page: CdpClient, previousFirstUrl: string | null) {
  const deadline = Date.now() + 20000;
  while (Date.now() < deadline) {
    const snapshot = await evaluateJson<PageSnapshot>(page, EXTRACT_PAGE_SNAPSHOT);
    const nextFirstUrl = snapshot.rows[0]?.detailUrl ?? null;
    if (nextFirstUrl && nextFirstUrl !== previousFirstUrl) return snapshot;
    await sleep(250);
  }
  throw new Error('Timed out waiting for Sabor grid pager to advance');
}

async function collectListEntries(maxPages: number | null): Promise<{ rowCount: number; pagesCollected: number; rows: SaborHrListEntry[] }> {
  let browser: BrowserHandle | null = null;
  let page: CdpClient | null = null;

  try {
    browser = await launchChromium();
    const targetWsUrl = await createPageTarget(browser.port, SABOR_HR_LIST_URL);
    page = await connectPage(targetWsUrl);

    await page.send('Page.enable');
    await page.send('Runtime.enable');
    await page.send('Page.navigate', { url: SABOR_HR_LIST_URL });
    await sleep(4000);

    const initialSnapshot = await evaluateJson<PageSnapshot>(page, EXTRACT_PAGE_SNAPSHOT);
    const pageSize = Math.max(1, initialSnapshot.rows.length);
    const totalPages = Math.max(1, Math.ceil(initialSnapshot.rowCount / pageSize));
    const pageLimit = maxPages ? Math.min(totalPages, maxPages) : totalPages;
    const rows: SaborHrListEntry[] = [...initialSnapshot.rows];
    let currentSnapshot = initialSnapshot;
    let pagesCollected = 1;

    console.error(`sabor_hr list page 1/${pageLimit}: rows=${initialSnapshot.rows.length} total=${initialSnapshot.rowCount}`);

    for (let pageIndex = 2; pageIndex <= pageLimit; pageIndex += 1) {
      const previousFirstUrl = currentSnapshot.rows[0]?.detailUrl ?? null;
      await evaluateJson(page, `(() => {
        const target = document.querySelector('#ctl00_ContentPlaceHolder_gvAkti_PagerBarB_NextButton input')
          || document.querySelector('#ctl00_ContentPlaceHolder_gvAkti_PagerBarB_NextButton');
        if (!target) return false;
        target.click();
        return true;
      })()`);
      currentSnapshot = await waitForPageAdvance(page, previousFirstUrl);
      rows.push(...currentSnapshot.rows);
      pagesCollected = pageIndex;
      console.error(`sabor_hr list page ${pageIndex}/${pageLimit}: rows=${currentSnapshot.rows.length}`);
    }

    return { rowCount: initialSnapshot.rowCount, pagesCollected, rows };
  } finally {
    page?.close();
    await closeChromium(browser);
  }
}

async function fetchHtml(url: string): Promise<string> {
  const response = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0' },
    signal: AbortSignal.timeout(30000),
  });
  if (!response.ok) throw new Error(`sabor.hr ${response.status} for ${url}`);
  return await response.text();
}

function parseDetail(html: string): SaborHrDetail {
  const document = new JSDOM(html).window.document;
  const textByIdPart = (idPart: string): string | null => {
    const node = document.querySelector(`[id*="${idPart}"]`);
    return node ? node.textContent?.replace(/\s+/g, ' ').trim() ?? null : null;
  };

  const committees = [...document.querySelectorAll('[id*="pnlIzvjesca"] a[href*="DocumentView.aspx?entid="]')]
    .map((anchor) => anchor.textContent?.replace(/\s+/g, ' ').trim() ?? '')
    .filter(Boolean);

  const readings = [...document.querySelectorAll('[name^="pnlCitanje"]')]
    .map((node) => node.textContent?.replace(/\s+/g, ' ').trim() ?? '')
    .filter(Boolean);

  const statuses = [...document.querySelectorAll('[id*="lblStatus"]')]
    .map((node) => node.textContent?.replace(/\s+/g, ' ').trim() ?? '')
    .filter(Boolean);

  return {
    proposalNumber: textByIdPart('glava_lblBrojPrijedloga'),
    euAligned: textByIdPart('glava_lblUskladjenSAC'),
    procedureType: textByIdPart('glava_lblVrstaPostupka'),
    policyArea: textByIdPart('glava_lblPodrucje'),
    globalStatus: textByIdPart('glava_lblStatus'),
    readings,
    sponsor: textByIdPart('lblPredlagatelj'),
    committees,
    signature: textByIdPart('lblSignatura'),
    readingStatus: statuses.at(-1) ?? null,
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
    const { rowCount, pagesCollected, rows } = await collectListEntries(args.maxPages);
    totalFetched = rows.length;

    const proposalCandidates = rows.filter((row) => /^PZE?\s+\d+$/i.test(row.proposalCode));
    const detailPairs = await mapWithConcurrency(proposalCandidates, args.detailConcurrency, async (entry) => {
      const detail = parseDetail(await fetchHtml(entry.detailUrl));
      return { entry, detail };
    });

    const proposals = detailPairs
      .map(({ entry, detail }) => buildProposalFromSaborHrEntry(entry, detail))
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

      await supabase.rpc('increment_total_records', { p_source_type: 'sabor_hr', p_delta: totalCreated + totalUpdated });
      await updateRunLog(supabase, runId, {
        status: 'completed',
        records_fetched: totalFetched,
        records_created: totalCreated,
        records_updated: totalUpdated,
      });
    }

    console.log(JSON.stringify({
      apply: args.apply,
      gridRowCount: rowCount,
      fetched: totalFetched,
      proposalCandidates: proposalCandidates.length,
      prepared: uniqueProposals.length,
      created: totalCreated,
      updated: totalUpdated,
      pagesCollected,
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
