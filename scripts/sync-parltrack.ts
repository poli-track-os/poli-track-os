#!/usr/bin/env node
// Sync Parltrack (https://parltrack.org) nightly dumps into politicians,
// political_events, and related tables. Replaces the broken scrape-mep-reports
// pipeline (S-10) and enriches EP MEP data with speeches, questions, and
// activities that weren't tracked before.
//
// License: Parltrack data is ODBL v1.0. Attribution is in INGESTION.md and
// in the frontend footer.
//
// Usage:
//   node --experimental-strip-types scripts/sync-parltrack.ts [--apply] \
//     [--meps] [--activities] [--expect-project-ref REF]
//
// By default, runs --meps AND --activities. Individual flags let you run
// just one. Both stream-decode the zst dump via the external `zstd` binary.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import readline from 'node:readline';
import { spawn } from 'node:child_process';
import { createClient } from '@supabase/supabase-js';
import {
  buildEventRowFromActivity,
  buildProposalFromDossier,
  buildVoteBundlesFromDossier,
  extractPartyHistory,
  iterateActivityEntries,
  parseParltrackLine,
  type ParltrackActivity,
  type ParltrackDossier,
  type ParltrackMep,
} from '../src/lib/parltrack-helpers.ts';
import { upsertProposalVoteBundles } from '../src/lib/proposal-sync.ts';

const DUMP_BASE = 'https://parltrack.org/dumps';

type Args = {
  apply: boolean;
  meps: boolean;
  activities: boolean;
  dossiers: boolean;
  expectProjectRef: string | null;
  maxRecords: number | null;
};

function parseArgs(argv: string[]): Args {
  const args: Args = {
    apply: false,
    meps: false,
    activities: false,
    dossiers: false,
    expectProjectRef: null,
    maxRecords: null,
  };
  let anyExplicit = false;
  for (let i = 0; i < argv.length; i += 1) {
    const t = argv[i];
    if (t === '--apply') { args.apply = true; continue; }
    if (t === '--meps') { args.meps = true; anyExplicit = true; continue; }
    if (t === '--activities') { args.activities = true; anyExplicit = true; continue; }
    if (t === '--dossiers') { args.dossiers = true; anyExplicit = true; continue; }
    if (t === '--max-records') {
      const next = argv[++i];
      if (!next) throw new Error('Missing value for --max-records');
      args.maxRecords = parseInt(next, 10);
      continue;
    }
    if (t === '--expect-project-ref') {
      const next = argv[++i];
      if (!next) throw new Error('Missing value for --expect-project-ref');
      args.expectProjectRef = next.trim();
      continue;
    }
    if (t === '--help' || t === '-h') {
      console.log('scripts/sync-parltrack.ts [--apply] [--meps] [--activities] [--dossiers] [--max-records N]');
      process.exit(0);
    }
    throw new Error(`Unknown argument: ${t}`);
  }
  if (!anyExplicit) { args.meps = true; args.activities = true; args.dossiers = true; }
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

/**
 * Download a .zst dump to a temp file and stream-decode it line by line
 * via `zstd -d -c`. Yields one parsed JSON record at a time; returns null
 * for framing lines.
 */
async function* streamParltrackDump(dumpName: string, maxRecords: number | null): AsyncGenerator<unknown> {
  const url = `${DUMP_BASE}/${dumpName}`;
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'parltrack-'));
  const zstPath = path.join(tempDir, dumpName);
  try {
    console.error(`  -> downloading ${url}`);
    const res = await fetch(url, { headers: { 'User-Agent': 'poli-track sync-parltrack' } });
    if (!res.ok) throw new Error(`Parltrack ${res.status} for ${dumpName}`);
    const ab = await res.arrayBuffer();
    fs.writeFileSync(zstPath, Buffer.from(ab));
    console.error(`  -> wrote ${ab.byteLength} bytes to ${zstPath}`);

    const zstdProc = spawn('zstd', ['-d', '-c', zstPath], { stdio: ['ignore', 'pipe', 'inherit'] });
    const rl = readline.createInterface({ input: zstdProc.stdout, crlfDelay: Infinity });

    let seq = 0;
    for await (const line of rl) {
      const parsed = parseParltrackLine(line);
      if (parsed !== null) {
        yield parsed;
        seq += 1;
        if (maxRecords !== null && seq >= maxRecords) {
          zstdProc.kill();
          break;
        }
      }
    }
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

async function ensureRunLog(supabase: ReturnType<typeof createClient>): Promise<string | null> {
  const { data, error } = await supabase
    .from('scrape_runs')
    .insert({ source_type: 'parltrack', status: 'running' })
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

/**
 * Sync MEP records: enrich politicians with Parltrack-sourced party history.
 * Does NOT create new politicians — only updates existing ones matched by
 * external_id (EP numeric id). The bespoke scrape-eu-parliament function
 * remains the authoritative source for "who is an MEP right now".
 */
async function syncMeps(supabase: ReturnType<typeof createClient>, apply: boolean, maxRecords: number | null): Promise<{ fetched: number; updated: number }> {
  let fetched = 0;
  let updated = 0;

  // Load the current MEP roster so we can match Parltrack records.
  const { data: existing } = await supabase
    .from('politicians')
    .select('id, external_id')
    .eq('data_source', 'eu_parliament')
    .not('external_id', 'is', null);

  const byExternalId = new Map<string, string>();
  for (const row of (existing as { id: string; external_id: string }[] | null) ?? []) {
    if (row.external_id) byExternalId.set(String(row.external_id), row.id);
  }
  console.error(`  -> loaded ${byExternalId.size} existing MEPs for matching`);

  for await (const record of streamParltrackDump('ep_meps.json.zst', maxRecords)) {
    fetched += 1;
    const mep = record as ParltrackMep;
    const parltrackId = mep.UserID != null ? String(mep.UserID) : null;
    if (!parltrackId) continue;
    const politicianId = byExternalId.get(parltrackId);
    if (!politicianId) continue;

    const twitter = Array.isArray(mep.Twitter) ? mep.Twitter[0] : mep.Twitter;
    const birthYearRaw = mep.Birth?.date?.match(/(\d{4})/)?.[1];
    const birthYear = birthYearRaw ? parseInt(birthYearRaw, 10) : null;

    if (apply) {
      // Fill gaps but don't clobber — same pattern as enrich-wikipedia.
      const update: Record<string, unknown> = {};
      const { data: cur } = await supabase
        .from('politicians')
        .select('twitter_handle, birth_year, photo_url')
        .eq('id', politicianId)
        .single();
      const curRow = cur as { twitter_handle: string | null; birth_year: number | null; photo_url: string | null } | null;
      if (twitter && !curRow?.twitter_handle) update.twitter_handle = twitter.replace(/^@/, '');
      if (birthYear && !curRow?.birth_year) update.birth_year = birthYear;
      if (mep.Photo && !curRow?.photo_url) update.photo_url = mep.Photo;

      // Always touch updated_at to advance the cursor for downstream cron ordering.
      update.updated_at = new Date().toISOString();

      if (Object.keys(update).length > 0) {
        const { error } = await supabase.from('politicians').update(update).eq('id', politicianId);
        if (error) throw error;
        updated += 1;
      }

      // Write party history to claims table if the entity layer is ready.
      // (Soft-skip if the politician hasn't been projected yet.)
      const partyHistory = extractPartyHistory(mep);
      if (partyHistory.length > 0) {
        const { data: pol } = await supabase
          .from('politicians')
          .select('entity_id')
          .eq('id', politicianId)
          .single();
        const entityId = (pol as { entity_id: string | null } | null)?.entity_id;
        if (entityId) {
          const claims = partyHistory.map((h) => ({
            entity_id: entityId,
            key: h.key,
            value: { s: h.value },
            value_type: 'string',
            valid_from: h.valid_from,
            valid_to: h.valid_to,
            data_source: 'parltrack',
            source_url: `https://parltrack.org/mep/${parltrackId}`,
            trust_level: 1,
          }));
          const { error } = await supabase
            .from('claims')
            .upsert(claims, { onConflict: 'entity_id,key,valid_from,data_source', ignoreDuplicates: true });
          if (error) console.error(`claims upsert failed for ${politicianId}:`, error.message);
        }
      }
    }
  }

  console.error(`  meps: fetched=${fetched} updated=${updated}`);
  return { fetched, updated };
}

/**
 * Sync MEP activities: emit political_events rows for REPORT/OPINION/
 * MOTION/QUESTION/SPEECH entries against known MEPs. Replaces the
 * broken scrape-mep-reports pipeline.
 */
async function syncActivities(supabase: ReturnType<typeof createClient>, apply: boolean, maxRecords: number | null): Promise<{ fetched: number; created: number }> {
  let fetched = 0;
  let created = 0;

  const { data: existing } = await supabase
    .from('politicians')
    .select('id, external_id')
    .eq('data_source', 'eu_parliament')
    .not('external_id', 'is', null);

  const byExternalId = new Map<string, string>();
  for (const row of (existing as { id: string; external_id: string }[] | null) ?? []) {
    if (row.external_id) byExternalId.set(String(row.external_id), row.id);
  }
  console.error(`  -> loaded ${byExternalId.size} MEPs for activity matching`);

  const batch: unknown[] = [];
  const flushBatch = async () => {
    if (batch.length === 0) return;
    if (!apply) { batch.length = 0; return; }
    const { data, error } = await supabase
      .from('political_events')
      .upsert(batch, { onConflict: 'politician_id,source_url,event_timestamp', ignoreDuplicates: true })
      .select('id');
    if (error) {
      console.error(`political_events upsert failed: ${error.message}`);
      throw error;
    }
    created += (data as unknown[] | null)?.length ?? 0;
    batch.length = 0;
  };

  for await (const record of streamParltrackDump('ep_mep_activities.json.zst', maxRecords)) {
    fetched += 1;
    const activity = record as ParltrackActivity;
    const parltrackId = activity.mep_id != null ? String(activity.mep_id) : null;
    if (!parltrackId) continue;
    const politicianId = byExternalId.get(parltrackId);
    if (!politicianId) continue;

    for (const { category, entry } of iterateActivityEntries(activity)) {
      const row = buildEventRowFromActivity(politicianId, parltrackId, category, entry);
      if (row) batch.push(row);
      if (batch.length >= 500) await flushBatch();
    }
  }
  await flushBatch();

  console.error(`  activities: fetched=${fetched} events_created=${created}`);
  return { fetched, created };
}

/**
 * Sync EP dossiers: create/update proposals rows with rapporteur and EP
 * group attribution. Deduped on source_url (OEIL procedure link).
 */
async function syncDossiers(supabase: ReturnType<typeof createClient>, apply: boolean, maxRecords: number | null): Promise<{ fetched: number; created: number; updated: number }> {
  let fetched = 0;
  let created = 0;
  let updated = 0;

  type DossierProposalRow = NonNullable<ReturnType<typeof buildProposalFromDossier>> & { raw_dossier: ParltrackDossier };
  const batch: DossierProposalRow[] = [];

  const flushBatch = async () => {
    const rows = [...batch];
    batch.length = 0;
    if (rows.length === 0 || !apply) return;

    const urls = rows.map((r) => r.source_url);
    const { data: existing } = await supabase
      .from('proposals')
      .select('id, source_url')
      .in('source_url', urls);
    const existingByUrl = new Map<string, string>();
    for (const row of existing ?? []) {
      if (row.source_url) existingByUrl.set(row.source_url, row.id);
    }

    const toInsert = rows.filter((r) => !existingByUrl.has(r.source_url));
    const toUpdate = rows.filter((r) => existingByUrl.has(r.source_url));

    const proposalIdByUrl = new Map(existingByUrl);
    if (toInsert.length > 0) {
      const { data, error } = await supabase
        .from('proposals')
        .insert(toInsert.map(({ raw_dossier, ...proposal }) => proposal))
        .select('id, source_url');
      if (error) throw error;
      for (const row of data ?? []) {
        if (row.source_url) proposalIdByUrl.set(row.source_url, row.id);
      }
      created += (data as unknown[] | null)?.length ?? 0;
    }
    for (const row of toUpdate) {
      const id = existingByUrl.get(row.source_url);
      if (!id) continue;
      const { raw_dossier, ...proposal } = row;
      const { error } = await supabase.from('proposals').update(proposal).eq('id', id);
      if (error) { console.error(`proposals update failed: ${error.message}`); continue; }
      proposalIdByUrl.set(row.source_url, id);
      updated += 1;
    }

    const voteBundles = rows.flatMap((row) => {
      const proposalId = proposalIdByUrl.get(row.source_url);
      if (!proposalId) return [];
      return buildVoteBundlesFromDossier(row.raw_dossier)
        .map((vote) => ({
          proposal_id: proposalId,
          event: {
            source_event_id: vote.source_event_id,
            chamber: vote.chamber,
            vote_method: vote.vote_method,
            happened_at: vote.happened_at,
            result: vote.result,
            for_count: vote.for_count,
            against_count: vote.against_count,
            abstain_count: vote.abstain_count,
            absent_count: vote.absent_count,
            total_eligible: vote.total_eligible,
            total_cast: vote.total_cast,
            quorum_required: vote.quorum_required,
            quorum_reached: vote.quorum_reached,
            source_url: vote.source_url,
            source_payload: vote.source_payload,
          },
          groups: vote.groups,
          records: vote.records,
        }));
    });
    if (voteBundles.length > 0) {
      await upsertProposalVoteBundles(supabase, voteBundles);
    }
  };

  for await (const record of streamParltrackDump('ep_dossiers.json.zst', maxRecords)) {
    fetched += 1;
    const dossier = record as ParltrackDossier;
    const row = buildProposalFromDossier(dossier);
    if (row) batch.push({ ...row, raw_dossier: dossier });
    if (batch.length >= 200) await flushBatch();
  }
  await flushBatch();

  console.error(`  dossiers: fetched=${fetched} created=${created} updated=${updated}`);
  return { fetched, created, updated };
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
    if (args.meps) {
      const { fetched, updated } = await syncMeps(supabase, args.apply, args.maxRecords);
      totalFetched += fetched;
      totalUpdated += updated;
    }
    if (args.activities) {
      const { fetched, created } = await syncActivities(supabase, args.apply, args.maxRecords);
      totalFetched += fetched;
      totalCreated += created;
    }
    if (args.dossiers) {
      const { fetched, created, updated } = await syncDossiers(supabase, args.apply, args.maxRecords);
      totalFetched += fetched;
      totalCreated += created;
      totalUpdated += updated;
    }

    if (args.apply) {
      await supabase.rpc('increment_total_records', { p_source_type: 'parltrack', p_delta: totalCreated + totalUpdated });
      await updateRunLog(supabase, runId, { status: 'completed', records_fetched: totalFetched, records_created: totalCreated, records_updated: totalUpdated });
    }

    console.log(JSON.stringify({ apply: args.apply, meps: args.meps, activities: args.activities, dossiers: args.dossiers, fetched: totalFetched, created: totalCreated, updated: totalUpdated }, null, 2));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('sync-parltrack error:', msg);
    await updateRunLog(supabase, runId, { status: 'failed', records_fetched: totalFetched, error_message: msg });
    throw err;
  }
}

main().catch((err) => { console.error(err); process.exit(1); });
