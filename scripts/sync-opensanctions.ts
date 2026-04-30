#!/usr/bin/env node
// Sync OpenSanctions entities into influence_actors for PEP/state-linked
// context. Supports CSV, JSON arrays, or newline-delimited JSON exports.

import process from 'node:process';
import { parseOpenSanctions } from '../src/lib/influence-ingest.ts';
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

const USER_AGENT = 'poli-track opensanctions-sync (https://github.com/poli-track-os/poli-track-os)';

async function main() {
  const args = parseCommonArgs(process.argv.slice(2));
  const text = await readInput(args, USER_AGENT);
  const bundle = limitBundle(parseOpenSanctions(text), args.limit);

  if (!args.apply) {
    console.log(JSON.stringify({ apply: false, ...summarizeBundle(bundle) }, null, 2));
    return;
  }

  const supabase = getSupabaseClient(true);
  const runId = await ensureRunLog(supabase, 'opensanctions');
  try {
    const summary = await applyInfluenceBundle(supabase, bundle);
    await updateRunLog(supabase, runId, {
      status: 'completed',
      records_fetched: bundle.actors.length,
      records_created: summary.actors,
    });
    console.log(JSON.stringify({ apply: true, ...summary }, null, 2));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await updateRunLog(supabase, runId, { status: 'failed', records_fetched: bundle.actors.length, error_message: message });
    throw error;
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
