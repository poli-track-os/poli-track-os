#!/usr/bin/env node
// Sync French Assemblée nationale legislative proposals into the proposals
// table. Uses the nosdeputes.fr API which provides structured JSON access
// to all legislative texts with author and group (party) attribution.
//
// Data license: CC-BY-SA (Regards Citoyens). Attribution in INGESTION.md.
//
// Usage:
//   node --experimental-strip-types scripts/sync-assemblee-nationale.ts \
//     [--apply] [--legislature 17] [--max-pages 50] [--expect-project-ref REF]
//
// The script first fetches the deputy list for the legislature, then collects
// each deputy's legislative texts (propositions de loi) with their party group.

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { createClient } from '@supabase/supabase-js';
import {
  buildProposalFromOfficialNotice,
  buildProposalFromDeputeTexte,
  buildProposalFromTexteloi,
  type AssembleeOfficialNotice,
  type NosDeputesDepute,
  type NosDeputesSearchResponse,
  type NosDeputesTexteloi,
} from '../src/lib/assemblee-helpers.ts';
import { fetchExistingProposalIdsBySourceUrl } from '../src/lib/proposal-sync.ts';

const OFFICIAL_BASE = 'https://www.assemblee-nationale.fr';
const NOSDEPUTES_BASE = 'https://www.nosdeputes.fr';
const OFFICIAL_TEXT_PAGE_CONCURRENCY = 8;

type Args = {
  apply: boolean;
  legislature: number;
  maxPages: number;
  expectProjectRef: string | null;
};

function parseArgs(argv: string[]): Args {
  const args: Args = { apply: false, legislature: 17, maxPages: 100, expectProjectRef: null };
  for (let i = 0; i < argv.length; i += 1) {
    const t = argv[i];
    if (t === '--apply') { args.apply = true; continue; }
    if (t === '--legislature') {
      const next = argv[++i];
      if (!next) throw new Error('Missing value for --legislature');
      args.legislature = parseInt(next, 10);
      continue;
    }
    if (t === '--max-pages') {
      const next = argv[++i];
      if (!next) throw new Error('Missing value for --max-pages');
      args.maxPages = parseInt(next, 10);
      continue;
    }
    if (t === '--expect-project-ref') {
      const next = argv[++i];
      if (!next) throw new Error('Missing value for --expect-project-ref');
      args.expectProjectRef = next.trim();
      continue;
    }
    if (t === '--help' || t === '-h') {
      console.log('scripts/sync-assemblee-nationale.ts [--apply] [--legislature 17] [--max-pages 100]');
      process.exit(0);
    }
    throw new Error(`Unknown argument: ${t}`);
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
    .insert({ source_type: 'assemblee_nationale', status: 'running' })
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
      headers: { 'User-Agent': 'poli-track sync-assemblee (https://github.com/poli-track-os)' },
      signal: AbortSignal.timeout(30_000),
    });
    if (res.ok) return (await res.json()) as T;
    if (res.status === 429 || res.status >= 500) {
      await new Promise((r) => setTimeout(r, 3_000 * (attempt + 1)));
      continue;
    }
    throw new Error(`nosdeputes.fr ${res.status} for ${url}: ${await res.text().catch(() => '')}`);
  }
  throw new Error(`nosdeputes.fr retry limit exceeded for ${url}`);
}

async function fetchText(url: string): Promise<string> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'poli-track sync-assemblee (https://github.com/poli-track-os)' },
      signal: AbortSignal.timeout(30_000),
    });
    if (res.ok) return await res.text();
    if (res.status === 429 || res.status >= 500) {
      await new Promise((resolve) => setTimeout(resolve, 3_000 * (attempt + 1)));
      continue;
    }
    throw new Error(`assemblee.fr ${res.status} for ${url}: ${await res.text().catch(() => '')}`);
  }
  throw new Error(`assemblee.fr retry limit exceeded for ${url}`);
}

function extractOfficialTextPageLinks(html: string) {
  const matches = html.matchAll(/href="(https:\/\/www\.assemblee-nationale\.fr\/dyn\/\d+\/textes\/[^"]+)"/g);
  return [...new Set(Array.from(matches, (match) => match[1]))];
}

function extractOfficialNoticeUrl(html: string) {
  const match = html.match(/href="(\/dyn\/opendata\/[^"]+\.json)"/);
  return match ? new URL(match[1], OFFICIAL_BASE).toString() : null;
}

async function fetchDocumentsViaOfficialNotices(
  legislature: number,
  maxPages: number,
): Promise<NonNullable<ReturnType<typeof buildProposalFromOfficialNotice>>[]> {
  const textPageLinks = new Set<string>();

  for (let page = 1; page <= maxPages; page += 1) {
    const html = await fetchText(`${OFFICIAL_BASE}/dyn/${legislature}/dossiers?page=${page}&limit=25`);
    const pageLinks = extractOfficialTextPageLinks(html);
    if (pageLinks.length === 0) break;
    for (const link of pageLinks) textPageLinks.add(link);
    if (page % 10 === 0) {
      console.error(`    ${page} official dossier pages scanned (${textPageLinks.size} text pages found)`);
    }
  }

  console.error(`  -> found ${textPageLinks.size} official text pages`);

  const rows: NonNullable<ReturnType<typeof buildProposalFromOfficialNotice>>[] = [];
  const links = [...textPageLinks];

  for (let index = 0; index < links.length; index += OFFICIAL_TEXT_PAGE_CONCURRENCY) {
    const chunk = links.slice(index, index + OFFICIAL_TEXT_PAGE_CONCURRENCY);
    const results = await Promise.allSettled(
      chunk.map(async (textPageUrl) => {
        const html = await fetchText(textPageUrl);
        const noticeUrl = extractOfficialNoticeUrl(html);
        if (!noticeUrl) return null;
        const notice = await fetchJson<AssembleeOfficialNotice>(noticeUrl);
        return buildProposalFromOfficialNotice(notice, textPageUrl);
      }),
    );

    for (const result of results) {
      if (result.status === 'fulfilled' && result.value) {
        rows.push(result.value);
      }
    }

    if (index > 0 && index % 100 === 0) {
      console.error(`    ${index}/${links.length} official text pages resolved`);
    }
  }

  return rows;
}

/**
 * Strategy 1: search for Texteloi documents via the search API, then fetch
 * each document individually for full metadata (signataires, type, etc).
 */
async function fetchDocumentsViaSearch(legislature: number, maxPages: number): Promise<ReturnType<typeof buildProposalFromTexteloi>[]> {
  const baseUrl = legislature === 17
    ? NOSDEPUTES_BASE
    : `https://${legislature === 16 ? '2022-2024' : `${2002 + (legislature - 12) * 5}-${2007 + (legislature - 12) * 5}`}.nosdeputes.fr`;

  const docUrls: string[] = [];
  for (let page = 1; page <= maxPages; page += 1) {
    const start = (page - 1) * 50 + 1;
    const url = `${baseUrl}/recherche/proposition+de+loi?format=json&start=${start}`;
    try {
      const data = await fetchJson<NosDeputesSearchResponse>(url);
      const results = data.results ?? [];
      if (results.length === 0) break;
      for (const r of results) {
        if (r.document_type === 'Texteloi' && r.document_url) {
          docUrls.push(r.document_url);
        }
      }
      const total = data.last_result ?? 0;
      if (start + 50 > total) break;
      await new Promise((r) => setTimeout(r, 500));
    } catch (err) {
      console.error(`  search page ${page} failed: ${err instanceof Error ? err.message : err}`);
      break;
    }
  }

  console.error(`  -> found ${docUrls.length} Texteloi document URLs`);
  const rows: ReturnType<typeof buildProposalFromTexteloi>[] = [];
  for (let i = 0; i < docUrls.length; i += 1) {
    try {
      const doc = await fetchJson<NosDeputesTexteloi>(docUrls[i]);
      const row = buildProposalFromTexteloi(doc);
      if (row) rows.push(row);
    } catch {
      /* individual doc fetch failure is non-fatal */
    }
    if (i > 0 && i % 50 === 0) {
      console.error(`    ${i}/${docUrls.length} documents fetched`);
      await new Promise((r) => setTimeout(r, 300));
    }
  }
  return rows;
}

/**
 * Strategy 2: iterate over deputies and collect their legislative texts.
 * Falls back to this if the search API does not return documents.
 */
async function fetchDocumentsViaDeputes(legislature: number): Promise<ReturnType<typeof buildProposalFromDeputeTexte>[]> {
  const baseUrl = legislature === 17
    ? NOSDEPUTES_BASE
    : `https://${legislature === 16 ? '2022-2024' : `${2002 + (legislature - 12) * 5}-${2007 + (legislature - 12) * 5}`}.nosdeputes.fr`;

  console.error(`  -> fetching deputy list from ${baseUrl}`);
  let deputes: NosDeputesDepute[];
  try {
    const data = await fetchJson<{ deputes: NosDeputesDepute[] }>(`${baseUrl}/deputes/json`);
    deputes = data.deputes ?? [];
  } catch {
    const data = await fetchJson<NosDeputesDepute[]>(`${baseUrl}/deputes/json`);
    deputes = data;
  }
  console.error(`  -> ${deputes.length} deputies loaded`);

  const rows: ReturnType<typeof buildProposalFromDeputeTexte>[] = [];
  let deputesFetched = 0;

  for (const d of deputes) {
    const dep = d.depute ?? (d as unknown as NosDeputesDepute['depute']);
    if (!dep?.slug) continue;

    try {
      const profile = await fetchJson<NosDeputesDepute>(`${baseUrl}/depute/${dep.slug}/json`);
      const fullDep = profile.depute ?? (profile as unknown as NosDeputesDepute['depute']);
      const textes = fullDep?.textes_de_loi ?? [];
      const groupeSigle = fullDep?.groupe_sigle ?? dep.groupe_sigle;
      const fullName = fullDep?.nom ?? dep.nom ?? `${dep.prenom} ${dep.nom_de_famille}`;

      for (const t of textes) {
        const row = buildProposalFromDeputeTexte(t, fullName, groupeSigle);
        if (row) rows.push(row);
      }
      deputesFetched += 1;
      if (deputesFetched % 50 === 0) console.error(`    ${deputesFetched}/${deputes.length} deputies processed`);
      await new Promise((r) => setTimeout(r, 300));
    } catch (err) {
      console.error(`  deputy ${dep.slug} failed: ${err instanceof Error ? err.message : err}`);
    }
  }

  return rows;
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
    console.error(`  -> Assemblée nationale, legislature ${args.legislature}`);

    let allRows = await fetchDocumentsViaOfficialNotices(args.legislature, args.maxPages);
    if (allRows.length === 0) {
      console.error('  -> official dossier/notice path returned 0 rows, falling back to nosdeputes search');
    }
    if (allRows.length === 0) {
      allRows = await fetchDocumentsViaSearch(args.legislature, args.maxPages);
    }
    if (allRows.length === 0) {
      console.error('  -> search returned 0 Texteloi results, falling back to per-deputy iteration');
      allRows = await fetchDocumentsViaDeputes(args.legislature);
    }
    totalFetched = allRows.length;

    const validRows = allRows.filter((r): r is NonNullable<typeof r> => r !== null);
    const seen = new Set<string>();
    const uniqueRows = validRows.filter((r) => {
      if (seen.has(r.source_url)) return false;
      seen.add(r.source_url);
      return true;
    });
    console.error(`  -> ${uniqueRows.length} unique proposals (${totalFetched} raw)`);

    if (args.apply && uniqueRows.length > 0) {
      const existingByUrl = await fetchExistingProposalIdsBySourceUrl(
        supabase,
        uniqueRows.map((row) => row.source_url),
      );

      const toInsert = uniqueRows.filter((r) => !existingByUrl.has(r.source_url));
      const toUpdate = uniqueRows.filter((r) => existingByUrl.has(r.source_url));

      for (let i = 0; i < toInsert.length; i += 50) {
        const chunk = toInsert.slice(i, i + 50);
        const { data, error } = await supabase.from('proposals').insert(chunk).select('id');
        if (error) throw error;
        totalCreated += (data as unknown[] | null)?.length ?? 0;
      }

      for (const row of toUpdate) {
        const id = existingByUrl.get(row.source_url);
        if (!id) continue;
        const { error } = await supabase.from('proposals').update(row).eq('id', id);
        if (error) { console.error(`update failed: ${error.message}`); continue; }
        totalUpdated += 1;
      }
    }

    if (args.apply) {
      await supabase.rpc('increment_total_records', { p_source_type: 'assemblee_nationale', p_delta: totalCreated });
      await updateRunLog(supabase, runId, { status: 'completed', records_fetched: totalFetched, records_created: totalCreated, records_updated: totalUpdated });
    }

    console.log(JSON.stringify({
      apply: args.apply,
      legislature: args.legislature,
      fetched: totalFetched,
      created: totalCreated,
      updated: totalUpdated,
    }, null, 2));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('sync-assemblee-nationale error:', msg);
    await updateRunLog(supabase, runId, { status: 'failed', records_fetched: totalFetched, error_message: msg });
    throw err;
  }
}

main().catch((err) => { console.error(err); process.exit(1); });
