#!/usr/bin/env node
// Apply an already-normalized InfluenceBundle JSON artifact to Supabase.

import fs from 'node:fs';
import process from 'node:process';
import type { InfluenceBundle } from '../src/lib/influence-ingest.ts';
import {
  applyInfluenceBundle,
  ensureRunLog,
  getSupabaseClient,
  summarizeBundle,
  updateRunLog,
} from './influence-sync-helpers.ts';

type Args = {
  input: string;
  apply: boolean;
};

function parseArgs(argv: string[]): Args {
  const args: Args = { input: '', apply: false };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === '--input') {
      args.input = argv[++i] || '';
      if (!args.input) throw new Error('Missing value for --input');
    } else if (token === '--apply') {
      args.apply = true;
    } else if (token === '--help' || token === '-h') {
      console.log('apply-influence-bundle.ts --input data/influence/live/YYYY-MM-DD/normalized/combined-bundle.json [--apply]');
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${token}`);
    }
  }
  if (!args.input) throw new Error('Use --input combined-bundle.json');
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const bundle = JSON.parse(fs.readFileSync(args.input, 'utf8')) as InfluenceBundle;
  const summary = summarizeBundle(bundle);
  if (!args.apply) {
    console.log(JSON.stringify({ apply: false, input: args.input, ...summary }, null, 2));
    return;
  }

  const supabase = getSupabaseClient(true);
  const runId = await ensureRunLog(supabase, 'curated_influence_media');
  try {
    const applied = await applyInfluenceBundle(supabase, bundle);
    await updateRunLog(supabase, runId, {
      status: 'completed',
      records_fetched: summary.filings + summary.actors + summary.clients,
      records_created: applied.filings + applied.money + applied.contacts + applied.actors + applied.clients,
    });
    console.log(JSON.stringify({ apply: true, input: args.input, ...applied }, null, 2));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await updateRunLog(supabase, runId, { status: 'failed', records_fetched: summary.filings, error_message: message });
    throw error;
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
