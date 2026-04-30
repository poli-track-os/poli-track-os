#!/usr/bin/env node
// Queue public affiliation claims for review. Rows are never visible by
// default; source files must explicitly set review_status=approved and
// visible=true to publish a reviewed claim.

import process from 'node:process';
import { parsePublicAffiliations } from '../src/lib/influence-ingest.ts';
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

const USER_AGENT = 'poli-track public-affiliations-sync (https://github.com/poli-track-os/poli-track-os)';

async function main() {
  const args = parseCommonArgs(process.argv.slice(2));
  const text = await readInput(args, USER_AGENT);
  const bundle = limitBundle(parsePublicAffiliations(text), args.limit);

  if (!args.apply) {
    console.log(JSON.stringify({ apply: false, ...summarizeBundle(bundle) }, null, 2));
    return;
  }

  const supabase = getSupabaseClient(true);
  const runId = await ensureRunLog(supabase, 'wikidata_affiliation');
  try {
    const summary = await applyInfluenceBundle(supabase, bundle);
    await updateRunLog(supabase, runId, {
      status: 'completed',
      records_fetched: bundle.affiliations.length,
      records_created: summary.affiliations,
    });
    console.log(JSON.stringify({ apply: true, ...summary }, null, 2));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await updateRunLog(supabase, runId, { status: 'failed', records_fetched: bundle.affiliations.length, error_message: message });
    throw error;
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
