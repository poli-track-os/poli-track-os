#!/usr/bin/env node
// Sync LobbyFacts.eu (which republishes the EU Transparency Register) into
// `lobby_organisations` and `lobby_spend`. Pages through the search results
// then fetches each org's datacard for spend history + meta.
//
// Source: https://www.lobbyfacts.eu/ — CC-BY 4.0, attribution to ALTER-EU.
//
// Usage:
//   node --experimental-strip-types scripts/sync-lobbyfacts.ts [--apply] [--max-orgs N]

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { createClient } from '@supabase/supabase-js';
import {
  parseLobbyfactsDatacard,
  parseLobbyfactsSearchPage,
  type LobbyfactsDatacard,
} from '../src/lib/lobbyfacts-helpers.ts';

const BASE = 'https://www.lobbyfacts.eu';
const USER_AGENT = 'poli-track lobbyfacts-sync (https://github.com/poli-track-os/poli-track-os)';

type Args = { apply: boolean; maxOrgs: number | null; pageSize: number };

function parseArgs(argv: string[]): Args {
  const args: Args = { apply: false, maxOrgs: 100, pageSize: 50 };
  for (let i = 0; i < argv.length; i += 1) {
    const t = argv[i];
    if (t === '--apply') { args.apply = true; continue; }
    if (t === '--max-orgs') {
      const next = argv[++i];
      if (!next) throw new Error('Missing value for --max-orgs');
      args.maxOrgs = next === 'all' ? null : parseInt(next, 10);
      continue;
    }
    if (t === '--page-size') {
      const next = argv[++i];
      if (!next) throw new Error('Missing value for --page-size');
      args.pageSize = parseInt(next, 10);
      continue;
    }
    if (t === '--help' || t === '-h') {
      console.log('scripts/sync-lobbyfacts.ts [--apply] [--max-orgs N|all] [--page-size N]');
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
  if (!url) throw new Error('Missing SUPABASE_URL');
  const key = apply
    ? process.env.SUPABASE_SERVICE_ROLE_KEY
    : process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  if (!key) throw new Error('Missing credentials');
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

const fetchHtml = async (url: string): Promise<string> => {
  const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT }, signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`);
  return res.text();
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function ensureRunLog(supabase: ReturnType<typeof createClient>): Promise<string | null> {
  const { data, error } = await supabase
    .from('scrape_runs')
    .insert({ source_type: 'lobbyfacts', status: 'running' })
    .select('id')
    .single();
  if (error) { console.error('ensureRunLog failed:', error.message); return null; }
  return (data as { id: string }).id;
}

async function updateRunLog(
  supabase: ReturnType<typeof createClient>,
  runId: string | null,
  payload: { status: 'completed' | 'failed'; records_fetched: number; records_created?: number; error_message?: string | null },
) {
  if (!runId) return;
  await supabase.from('scrape_runs').update({ ...payload, completed_at: new Date().toISOString() }).eq('id', runId);
}

function upsertOrgRow(card: LobbyfactsDatacard) {
  return {
    transparency_id: card.transparencyId,
    name: card.name,
    legal_name: card.legalName,
    category: card.category,
    subcategory: card.subcategory,
    country_of_hq: card.countryOfHq,
    website: card.website,
    registered_at: card.registeredAt,
    last_updated_tr: card.lastUpdatedTr,
    accreditation_count: card.epAccreditations,
    data_source: 'lobbyfacts',
    source_url: `${BASE}/datacard/${card.transparencyId}`,
  };
}

async function main() {
  loadLocalEnv();
  const args = parseArgs(process.argv.slice(2));
  const supabase = getSupabaseClient(args.apply);
  const runId = args.apply ? await ensureRunLog(supabase) : null;

  let totalFetched = 0;
  let totalInserted = 0;
  let totalSpendRows = 0;
  const errors: string[] = [];

  try {
    const seenIds = new Set<string>();
    let page = 0;
    while (true) {
      console.error(`  -> fetching search page ${page}`);
      const html = await fetchHtml(`${BASE}/search-all?page=${page}`);
      const entries = parseLobbyfactsSearchPage(html);
      if (entries.length === 0) {
        console.error(`  -> empty results at page ${page}, stopping`);
        break;
      }
      let newIdsOnPage = 0;

      for (const entry of entries) {
        if (seenIds.has(entry.transparencyId)) continue;
        seenIds.add(entry.transparencyId);
        newIdsOnPage += 1;
        if (args.maxOrgs !== null && totalFetched >= args.maxOrgs) break;

        try {
          await sleep(150); // courteous rate limit
          const cardHtml = await fetchHtml(`${BASE}${entry.datacardPath}`);
          const card = parseLobbyfactsDatacard(cardHtml, entry.transparencyId);
          card.name = card.name === 'Unknown organisation' ? entry.name : card.name;
          totalFetched += 1;

          if (args.apply) {
            // Upsert the organisation row.
            const { data: orgRow, error: orgErr } = await supabase
              .from('lobby_organisations')
              .upsert(upsertOrgRow(card), { onConflict: 'transparency_id' })
              .select('id')
              .single();
            if (orgErr) { errors.push(`${entry.name}: ${orgErr.message}`); continue; }
            const orgId = (orgRow as { id: string }).id;
            totalInserted += 1;

            // Insert spend rows for this org.
            if (card.spendByYear.length > 0) {
              const spendRows = card.spendByYear.map((s) => ({
                lobby_id: orgId,
                year: s.year,
                declared_amount_eur_low: s.amountEur,
                declared_amount_eur_high: s.amountEur,
                full_time_equivalents: card.fteCount,
                data_source: 'lobbyfacts',
                source_url: `${BASE}${entry.datacardPath}`,
              }));
              const { error: spendErr, data: spendData } = await supabase
                .from('lobby_spend')
                .upsert(spendRows, { onConflict: 'lobby_id,year,data_source' })
                .select('id');
              if (spendErr) {
                errors.push(`${entry.name} spend: ${spendErr.message}`);
              } else {
                totalSpendRows += (spendData as unknown[] | null)?.length ?? 0;
              }
            }
          } else {
            if (totalFetched <= 3) console.error(`  sample: ${JSON.stringify(card).slice(0, 200)}`);
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          errors.push(`${entry.name}: ${msg}`);
        }

        if (args.maxOrgs !== null && totalFetched >= args.maxOrgs) break;
      }

      if (args.maxOrgs !== null && totalFetched >= args.maxOrgs) break;
      if (newIdsOnPage === 0) {
        console.error(`  -> no new organisations on page ${page}, stopping`);
        break;
      }
      page += 1;
      await sleep(300);
    }

    if (args.apply) {
      await supabase.rpc('increment_total_records', { p_source_type: 'lobbyfacts', p_delta: totalInserted });
      await updateRunLog(supabase, runId, { status: 'completed', records_fetched: totalFetched, records_created: totalInserted });
    }

    console.log(JSON.stringify({
      apply: args.apply,
      orgs_fetched: totalFetched,
      orgs_inserted: totalInserted,
      spend_rows: totalSpendRows,
      errors_count: errors.length,
      first_errors: errors.slice(0, 5),
    }, null, 2));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('sync-lobbyfacts error:', msg);
    await updateRunLog(supabase, runId, { status: 'failed', records_fetched: totalFetched, error_message: msg });
    throw err;
  }
}

main().catch((err) => { console.error(err); process.exit(1); });
