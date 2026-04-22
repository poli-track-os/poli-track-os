#!/usr/bin/env node
// Data integrity checker. Runs a series of read-only SQL queries and
// reports issues in a structured form. Safe to run any time; never writes.
//
// Usage:
//   node --experimental-strip-types scripts/check-data-integrity.ts

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { createClient } from '@supabase/supabase-js';
import { EUROSTAT_SUPPORTED_GEOS } from '../src/lib/eurostat-geo.ts';

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

interface Check {
  name: string;
  description: string;
  run: () => Promise<{ ok: boolean; count: number; sample?: unknown }>;
}

async function countTable(supabase: ReturnType<typeof createClient>, table: string, filter?: (q: ReturnType<typeof supabase.from>) => unknown): Promise<number> {
  let q = supabase.from(table).select('id', { count: 'exact', head: true });
  if (filter) q = filter(q) as typeof q;
  const { count, error } = await q;
  if (error) throw error;
  return count ?? 0;
}

async function countTableByCountry(
  supabase: ReturnType<typeof createClient>,
  table: string,
  countries: readonly string[],
): Promise<Array<{ country_code: string; rows: number }>> {
  const counts = await Promise.all(countries.map(async (countryCode) => {
    const { count, error } = await supabase
      .from(table)
      .select('country_code', { count: 'exact', head: true })
      .eq('country_code', countryCode);
    if (error) throw error;
    return { country_code: countryCode, rows: count ?? 0 };
  }));
  return counts;
}

async function main() {
  loadLocalEnv();
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  if (!url) throw new Error('Missing SUPABASE_URL');
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  if (!key) throw new Error('Missing credentials');
  const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

  const checks: Check[] = [
    {
      name: 'politicians-with-entity-id',
      description: 'Politicians that have been projected into the canonical entities graph.',
      run: async () => {
        const { count: total } = await supabase.from('politicians').select('id', { count: 'exact', head: true });
        const { count: withEntity } = await supabase.from('politicians').select('id', { count: 'exact', head: true }).not('entity_id', 'is', null);
        const t = total ?? 0;
        const w = withEntity ?? 0;
        return { ok: t === 0 || w / t > 0.95, count: t - w, sample: { total: t, with_entity: w } };
      },
    },
    {
      name: 'orphan-political-events',
      description: 'political_events rows whose politician_id no longer exists.',
      run: async () => {
        // PostgREST can't easily express anti-joins. We inline a small query.
        const { data, error } = await supabase
          .from('political_events')
          .select('id, politician_id, politicians(id)')
          .is('politicians', null)
          .limit(20);
        if (error) throw error;
        return { ok: (data?.length ?? 0) === 0, count: data?.length ?? 0, sample: data?.slice(0, 3) };
      },
    },
    {
      name: 'politicians-without-country',
      description: 'Politicians missing a country_code.',
      run: async () => {
        const c = await countTable(supabase, 'politicians', (q) => q.is('country_code', null));
        return { ok: c === 0, count: c };
      },
    },
    {
      name: 'duplicate-external-ids',
      description: 'politicians.external_id values that appear more than once (should be impossible after the unique index).',
      run: async () => {
        // We can't aggregate via PostgREST; do a sanity sample.
        const { data } = await supabase
          .from('politicians')
          .select('external_id')
          .not('external_id', 'is', null)
          .limit(2000);
        const counts = new Map<string, number>();
        for (const r of (data || []) as { external_id: string }[]) counts.set(r.external_id, (counts.get(r.external_id) ?? 0) + 1);
        const dupes = [...counts.entries()].filter(([, n]) => n > 1);
        return { ok: dupes.length === 0, count: dupes.length, sample: dupes.slice(0, 5) };
      },
    },
    {
      name: 'government-expenditure-coverage',
      description: 'Eurostat COFOG coverage across all supported countries.',
      run: async () => {
        const counts = await countTableByCountry(supabase, 'government_expenditure', EUROSTAT_SUPPORTED_GEOS);
        const missing = counts.filter((entry) => entry.rows === 0).map((entry) => entry.country_code);
        return {
          ok: missing.length === 0,
          count: counts.length - missing.length,
          sample: missing.length > 0 ? { missing } : counts.slice(0, 5),
        };
      },
    },
    {
      name: 'country-demographics-coverage',
      description: 'Eurostat macro coverage across all supported countries.',
      run: async () => {
        const counts = await countTableByCountry(supabase, 'country_demographics', EUROSTAT_SUPPORTED_GEOS);
        const missing = counts.filter((entry) => entry.rows === 0).map((entry) => entry.country_code);
        return {
          ok: missing.length === 0,
          count: counts.length - missing.length,
          sample: missing.length > 0 ? { missing } : counts.slice(0, 5),
        };
      },
    },
    {
      name: 'entities-projected',
      description: 'Number of canonical entities projected from existing tables.',
      run: async () => {
        const c = await countTable(supabase, 'entities');
        return { ok: c > 0, count: c };
      },
    },
    {
      name: 'recent-failed-runs',
      description: 'Source types whose latest scrape_run in the last 24 hours is failed.',
      run: async () => {
        const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
        const { data, error } = await supabase
          .from('scrape_runs')
          .select('source_type, status, error_message, started_at')
          .gte('started_at', since)
          .order('started_at', { ascending: false })
          .limit(200);
        if (error) throw error;
        const latestBySource = new Map<string, { source_type: string; status: string; error_message: string | null; started_at: string }>();
        for (const row of (data || []) as Array<{ source_type: string; status: string; error_message: string | null; started_at: string }>) {
          if (!latestBySource.has(row.source_type)) latestBySource.set(row.source_type, row);
        }
        const unresolved = [...latestBySource.values()].filter((row) => row.status === 'failed');
        return { ok: unresolved.length === 0, count: unresolved.length, sample: unresolved.slice(0, 3) };
      },
    },
  ];

  const results: Array<{ name: string; description: string; ok: boolean; count: number; sample?: unknown }> = [];
  for (const c of checks) {
    try {
      const r = await c.run();
      results.push({ name: c.name, description: c.description, ...r });
    } catch (err) {
      results.push({ name: c.name, description: c.description, ok: false, count: -1, sample: { error: err instanceof Error ? err.message : String(err) } });
    }
  }

  const allOk = results.every((r) => r.ok);
  console.log(JSON.stringify({ all_ok: allOk, checks: results }, null, 2));
  if (!allOk) process.exitCode = 2;
}

main().catch((err) => { console.error(err); process.exit(1); });
