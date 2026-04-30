#!/usr/bin/env node
// Sync US Lobbying Disclosure Act records into the influence registry.
//
// Source reference: US Senate Lobbying Disclosure Act search/download portal.
// Use `--input` for reproducible fixture/backfill files, or `--url` for a
// maintained export URL. The script does not guess live bulk URLs because the
// official portal changes file naming by period.

import process from 'node:process';
import { parseUsLda } from '../src/lib/influence-ingest.ts';
import {
  applyInfluenceBundle,
  ensureRunLog,
  getSupabaseClient,
  limitBundle,
  parseCommonArgs,
  readInput,
  summarizeBundle,
  updateRunLog,
} from './influence-sync-helpers.ts';

const USER_AGENT = 'poli-track us-lda-sync (https://github.com/poli-track-os/poli-track-os)';

async function main() {
  const args = parseCommonArgs(process.argv.slice(2));
  const text = await readInput(args, USER_AGENT);
  const bundle = limitBundle(parseUsLda(text), args.limit);

  if (!args.apply) {
    console.log(JSON.stringify({ apply: false, ...summarizeBundle(bundle) }, null, 2));
    return;
  }

  const supabase = getSupabaseClient(true);
  const runId = await ensureRunLog(supabase, 'us_lda');
  try {
    const summary = await applyInfluenceBundle(supabase, bundle);
    await updateRunLog(supabase, runId, {
      status: 'completed',
      records_fetched: bundle.filings.length,
      records_created: summary.filings + summary.money + summary.contacts,
    });
    console.log(JSON.stringify({ apply: true, ...summary }, null, 2));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await updateRunLog(supabase, runId, { status: 'failed', records_fetched: bundle.filings.length, error_message: message });
    throw error;
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
