#!/usr/bin/env node
// Sync OpenCorporates-shaped company/officer exports into the influence
// registry. Use JSON from the API or a normalized CSV.

import process from 'node:process';
import { parseOpenCorporates } from '../src/lib/influence-ingest.ts';
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

const USER_AGENT = 'poli-track opencorporates-sync (https://github.com/poli-track-os/poli-track-os)';

async function main() {
  const args = parseCommonArgs(process.argv.slice(2));
  const text = await readInput(args, USER_AGENT);
  const bundle = limitBundle(parseOpenCorporates(text), args.limit);

  if (!args.apply) {
    console.log(JSON.stringify({ apply: false, ...summarizeBundle(bundle) }, null, 2));
    return;
  }

  const supabase = getSupabaseClient(true);
  const runId = await ensureRunLog(supabase, 'opencorporates');
  try {
    const summary = await applyInfluenceBundle(supabase, bundle);
    await updateRunLog(supabase, runId, {
      status: 'completed',
      records_fetched: bundle.companies.length,
      records_created: summary.companies + summary.officers,
    });
    console.log(JSON.stringify({ apply: true, ...summary }, null, 2));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await updateRunLog(supabase, runId, { status: 'failed', records_fetched: bundle.companies.length, error_message: message });
    throw error;
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
