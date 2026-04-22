#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { createClient } from '@supabase/supabase-js';
import { buildProposalFromFolketingSag, type FolketingSag } from '../src/lib/folketinget-helpers.ts';
import { resolveNextFolketingSkip } from '../src/lib/folketinget-pagination.ts';
import { fetchExistingProposalIdsBySourceUrl } from '../src/lib/proposal-sync.ts';

type Args = {
  apply: boolean;
  top: number;
  maxPages: number;
  expectProjectRef: string | null;
};

type ODataCollection<T> = {
  value?: T[];
  'odata.count'?: string;
};

type FolketingStatus = {
  id?: number;
  status?: string | null;
};

type FolketingSagActorLink = {
  sagid?: number;
  'akt\u00f8rid'?: number;
  rolleid?: number;
};

type FolketingActor = {
  id?: number;
  navn?: string | null;
  fornavn?: string | null;
  efternavn?: string | null;
};

type FolketingSagStep = {
  sagid?: number;
  dato?: string | null;
  typeid?: number;
};

const FOLKETING_BASE_URL = 'https://oda.ft.dk/api/';
const BILL_TYPE_ID = 3;
const PRIVATE_SPONSOR_ROLE_ID = 16;
const GOVERNMENT_SPONSOR_ROLE_ID = 19;
const INTRO_STEP_TYPE_IDS = [31, 32];

function parseArgs(argv: string[]): Args {
  const args: Args = { apply: false, top: 200, maxPages: 200, expectProjectRef: null };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === '--apply') { args.apply = true; continue; }
    if (token === '--top') {
      const next = argv[++i];
      if (!next) throw new Error('Missing value for --top');
      args.top = parseInt(next, 10);
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
      console.log('scripts/sync-folketinget.ts [--apply] [--top 200] [--max-pages 200]');
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
    .insert({ source_type: 'folketinget', status: 'running' })
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

function buildCollectionUrl(resourcePath: string, params: Record<string, string | number>) {
  const url = new URL(resourcePath, FOLKETING_BASE_URL);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, String(value));
  return url.toString();
}

async function fetchCollection<T>(url: string): Promise<ODataCollection<T>> {
  const res = await fetch(url, {
    headers: { Accept: 'application/json', 'User-Agent': 'poli-track sync-folketinget' },
    signal: AbortSignal.timeout(30000),
  });
  if (!res.ok) throw new Error(`oda.ft.dk ${res.status} for ${url}`);
  return (await res.json()) as ODataCollection<T>;
}

function chunkNumbers(values: number[], chunkSize: number) {
  const unique = [...new Set(values.filter((value) => Number.isFinite(value)))];
  const chunks: number[][] = [];
  for (let index = 0; index < unique.length; index += chunkSize) chunks.push(unique.slice(index, index + chunkSize));
  return chunks;
}

function buildOrFilter(field: string, values: number[]) {
  return values.map((value) => `${field} eq ${value}`).join(' or ');
}

function normalizeActorName(actor: FolketingActor): string | null {
  const fromFields = `${actor.fornavn ?? ''} ${actor.efternavn ?? ''}`.replace(/\s+/g, ' ').trim();
  const name = fromFields || actor.navn?.replace(/\s+/g, ' ').trim() || '';
  return name || null;
}

async function fetchAllBills(top: number, maxPages: number) {
  const bills: FolketingSag[] = [];
  let totalCount: number | null = null;
  let skip = 0;

  for (let pageIndex = 0; pageIndex < maxPages; pageIndex += 1) {
    const payload = await fetchCollection<FolketingSag>(buildCollectionUrl('Sag', {
      '$format': 'json',
      '$inlinecount': 'allpages',
      '$select': 'id,titel,titelkort,resume,nummer,opdateringsdato,lovnummer,lovnummerdato,statsbudgetsag,afstemningskonklusion,statusid',
      '$filter': `typeid eq ${BILL_TYPE_ID}`,
      '$orderby': 'id asc',
      '$top': top,
      '$skip': skip,
    }));
    const rows = payload.value ?? [];
    if (pageIndex === 0) totalCount = payload['odata.count'] ? parseInt(payload['odata.count'], 10) : null;
    if (rows.length === 0) break;
    bills.push(...rows);
    const nextSkip = resolveNextFolketingSkip({ currentSkip: skip, fetchedCount: rows.length, totalCount });
    if (nextSkip === null) break;
    skip = nextSkip;
    if (totalCount === null && rows.length < top) break;
  }

  return { bills, totalCount };
}

async function fetchStatusMap() {
  const payload = await fetchCollection<FolketingStatus>(buildCollectionUrl('Sagsstatus', {
    '$format': 'json',
    '$select': 'id,status',
    '$top': 200,
  }));
  const statuses = new Map<number, string>();
  for (const row of payload.value ?? []) {
    if (typeof row.id === 'number' && row.status?.trim()) statuses.set(row.id, row.status.trim());
  }
  return statuses;
}

async function fetchSubmittedDatesBySagId(sagIds: number[]) {
  const datesBySagId = new Map<number, string>();

  for (const sagIdChunk of chunkNumbers(sagIds, 25)) {
    const introTypeFilter = INTRO_STEP_TYPE_IDS.map((typeId) => `typeid eq ${typeId}`).join(' or ');
    const sagFilter = buildOrFilter('sagid', sagIdChunk);
    const rows = await fetchCollection<FolketingSagStep>(buildCollectionUrl('Sagstrin', {
      '$format': 'json',
      '$select': 'sagid,dato,typeid',
      '$filter': `(${sagFilter}) and (${introTypeFilter})`,
      '$top': 200,
    }));

    for (const row of rows.value ?? []) {
      if (typeof row.sagid !== 'number' || !row.dato) continue;
      const nextDate = row.dato.slice(0, 10);
      const current = datesBySagId.get(row.sagid);
      if (!current || nextDate < current) datesBySagId.set(row.sagid, nextDate);
    }
  }

  return datesBySagId;
}

async function fetchSponsorNamesBySagId(sagIds: number[]) {
  const actorIdsBySagId = new Map<number, Set<number>>();

  for (const sagIdChunk of chunkNumbers(sagIds, 25)) {
    const sagFilter = buildOrFilter('sagid', sagIdChunk);
    const sponsorFilter = `rolleid eq ${PRIVATE_SPONSOR_ROLE_ID} or rolleid eq ${GOVERNMENT_SPONSOR_ROLE_ID}`;

    for (let skip = 0; ; skip += 500) {
      const payload = await fetchCollection<FolketingSagActorLink>(buildCollectionUrl('SagAkt%C3%B8r', {
        '$format': 'json',
        '$select': 'sagid,akt\u00f8rid,rolleid',
        '$filter': `(${sagFilter}) and (${sponsorFilter})`,
        '$top': 500,
        '$skip': skip,
      }));
      const rows = payload.value ?? [];
      if (rows.length === 0) break;

      for (const row of rows) {
        if (typeof row.sagid !== 'number') continue;
        const actorId = row['akt\u00f8rid'];
        if (typeof actorId !== 'number') continue;
        const actorIds = actorIdsBySagId.get(row.sagid) ?? new Set<number>();
        actorIds.add(actorId);
        actorIdsBySagId.set(row.sagid, actorIds);
      }

      if (rows.length < 500) break;
    }
  }

  const actorIdToName = new Map<number, string>();
  const allActorIds = [...new Set([...actorIdsBySagId.values()].flatMap((ids) => [...ids]))];
  for (const actorIdChunk of chunkNumbers(allActorIds, 50)) {
    const payload = await fetchCollection<FolketingActor>(buildCollectionUrl('Akt%C3%B8r', {
      '$format': 'json',
      '$select': 'id,navn,fornavn,efternavn',
      '$filter': buildOrFilter('id', actorIdChunk),
      '$top': actorIdChunk.length,
    }));
    for (const actor of payload.value ?? []) {
      if (typeof actor.id !== 'number') continue;
      const name = normalizeActorName(actor);
      if (name) actorIdToName.set(actor.id, name);
    }
  }

  const sponsorNamesBySagId = new Map<number, string[]>();
  for (const [sagId, actorIds] of actorIdsBySagId) {
    const sponsorNames = [...actorIds]
      .map((actorId) => actorIdToName.get(actorId) ?? null)
      .filter((name): name is string => Boolean(name));
    sponsorNamesBySagId.set(sagId, sponsorNames);
  }
  return sponsorNamesBySagId;
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
    const { bills, totalCount } = await fetchAllBills(args.top, args.maxPages);
    totalFetched = bills.length;

    const [statusById, submittedDateBySagId, sponsorNamesBySagId] = await Promise.all([
      fetchStatusMap(),
      fetchSubmittedDatesBySagId(bills.map((bill) => bill.id ?? -1)),
      fetchSponsorNamesBySagId(bills.map((bill) => bill.id ?? -1)),
    ]);

    const rows = bills
      .map((bill) => buildProposalFromFolketingSag(bill, {
        statusLabel: typeof bill.statusid === 'number' ? statusById.get(bill.statusid) ?? null : null,
        submittedDate: typeof bill.id === 'number' ? submittedDateBySagId.get(bill.id) ?? null : null,
        sponsors: typeof bill.id === 'number' ? sponsorNamesBySagId.get(bill.id) ?? [] : [],
      }))
      .filter((row): row is NonNullable<typeof row> => Boolean(row));

    const deduped = new Map<string, NonNullable<(typeof rows)[number]>>();
    for (const row of rows) deduped.set(row.source_url, row);
    const proposals = [...deduped.values()];
    const budgetPrepared = bills.filter((bill) => bill.statsbudgetsag === true).length;

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

      await supabase.rpc('increment_total_records', { p_source_type: 'folketinget', p_delta: totalCreated + totalUpdated });
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
      budgetPrepared,
      totalCount,
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
