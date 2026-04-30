#!/usr/bin/env node
// Sync DOJ FARA records into the influence registry.
//
// Source reference: Department of Justice FARA eFile public records and bulk
// exports. Prefer `--input` for archived exports so runs are reproducible.

import process from 'node:process';
import { parseUsFara } from '../src/lib/influence-ingest.ts';
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

const USER_AGENT = 'poli-track us-fara-sync (https://github.com/poli-track-os/poli-track-os)';

async function main() {
  const args = parseCommonArgs(process.argv.slice(2));
  const text = await readInput(args, USER_AGENT);
  const bundle = limitBundle(parseUsFara(text), args.limit);

  if (!args.apply) {
    console.log(JSON.stringify({ apply: false, ...summarizeBundle(bundle) }, null, 2));
    return;
  }

  const supabase = getSupabaseClient(true);
  const runId = await ensureRunLog(supabase, 'us_fara');
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
