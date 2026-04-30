#!/usr/bin/env node
// Backfill the standard European Parliament MEP salary into finance rows
// that already point to official MEP declaration metadata.

import process from 'node:process';
import { getSupabaseClient } from './influence-sync-helpers.ts';

const SOURCE_URL = 'https://www.europarl.europa.eu/meps/en/about/meps';
const SOURCE_LABEL = 'European Parliament official MEP salary page';
const MONTHLY_PRE_TAX_EUR = 11_255.26;
const ANNUAL_PRE_TAX_EUR = Number((MONTHLY_PRE_TAX_EUR * 12).toFixed(2));
const DEFAULT_DECLARATION_YEAR = 2026;
const PAGE_SIZE = 500;

type Args = {
  apply: boolean;
  declarationYear: number;
  insertMissing: boolean;
  limit: number | null;
};

type FinanceRow = {
  id: string;
  politician_id: string;
  notes: string | null;
};

type PoliticianRow = {
  id: string;
  name: string;
};

function parseArgs(argv: string[]): Args {
  const args: Args = {
    apply: false,
    declarationYear: DEFAULT_DECLARATION_YEAR,
    insertMissing: false,
    limit: null,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === '--apply') {
      args.apply = true;
      continue;
    }
    if (token === '--insert-missing') {
      args.insertMissing = true;
      continue;
    }
    if (token === '--declaration-year') {
      const raw = argv[++i];
      if (!raw) throw new Error('Missing value for --declaration-year');
      args.declarationYear = Number.parseInt(raw, 10);
      continue;
    }
    if (token === '--limit') {
      const raw = argv[++i];
      if (!raw) throw new Error('Missing value for --limit');
      args.limit = raw === 'all' ? null : Number.parseInt(raw, 10);
      continue;
    }
    if (token === '--help' || token === '-h') {
      console.log('backfill-ep-mep-salaries.ts [--apply] [--insert-missing] [--declaration-year 2026] [--limit N|all]');
      process.exit(0);
    }
    throw new Error(`Unknown argument: ${token}`);
  }

  if (!Number.isFinite(args.declarationYear)) throw new Error('Invalid --declaration-year');
  if (args.limit !== null && (!Number.isFinite(args.limit) || args.limit < 1)) throw new Error('Invalid --limit');
  return args;
}

function appendSalarySource(notes: string | null) {
  const salaryNote = `Standard salary amount: ${SOURCE_LABEL}, ${SOURCE_URL}, monthly pre-tax EUR ${MONTHLY_PRE_TAX_EUR.toFixed(2)}.`;
  if (!notes) return salaryNote;
  if (notes.includes(SOURCE_URL)) return notes;
  return `${notes}\n${salaryNote}`;
}

async function fetchRowsToBackfill(supabase: ReturnType<typeof getSupabaseClient>, args: Args) {
  const rows: FinanceRow[] = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    if (args.limit !== null && rows.length >= args.limit) break;
    const remaining = args.limit === null ? PAGE_SIZE : Math.min(PAGE_SIZE, args.limit - rows.length);
    const { data, error } = await supabase
      .from('politician_finances')
      .select('id, politician_id, notes')
      .eq('declaration_year', args.declarationYear)
      .eq('salary_source', 'European Parliament MEP salary')
      .is('annual_salary', null)
      .order('id', { ascending: true })
      .range(offset, offset + remaining - 1);
    if (error) throw error;
    rows.push(...((data || []) as FinanceRow[]));
    if (!data || data.length < remaining) break;
  }
  return rows;
}

async function fetchCurrentMepIds(supabase: ReturnType<typeof getSupabaseClient>, limit: number | null) {
  const rows: PoliticianRow[] = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    if (limit !== null && rows.length >= limit) break;
    const remaining = limit === null ? PAGE_SIZE : Math.min(PAGE_SIZE, limit - rows.length);
    const { data, error } = await supabase
      .from('politicians')
      .select('id, name')
      .eq('data_source', 'eu_parliament')
      .not('external_id', 'is', null)
      .order('id', { ascending: true })
      .range(offset, offset + remaining - 1);
    if (error) throw error;
    rows.push(...((data || []) as PoliticianRow[]));
    if (!data || data.length < remaining) break;
  }
  return rows;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const supabase = getSupabaseClient(args.apply);
  const rows = await fetchRowsToBackfill(supabase, args);

  const planned = {
    apply: args.apply,
    declaration_year: args.declarationYear,
    monthly_pre_tax_eur: MONTHLY_PRE_TAX_EUR,
    annual_pre_tax_eur: ANNUAL_PRE_TAX_EUR,
    source_url: SOURCE_URL,
    rows_to_update: rows.length,
    insert_missing: args.insertMissing,
  };

  if (!args.apply) {
    console.log(JSON.stringify(planned, null, 2));
    return;
  }

  let updated = 0;
  for (const row of rows) {
    const { error } = await supabase
      .from('politician_finances')
      .update({
        annual_salary: ANNUAL_PRE_TAX_EUR,
        currency: 'EUR',
        notes: appendSalarySource(row.notes),
      })
      .eq('id', row.id);
    if (error) throw error;
    updated += 1;
  }

  let inserted = 0;
  if (args.insertMissing) {
    const politicians = await fetchCurrentMepIds(supabase, args.limit);
    const rowsToUpsert = politicians.map((politician) => ({
      politician_id: politician.id,
      declaration_year: args.declarationYear,
      annual_salary: ANNUAL_PRE_TAX_EUR,
      currency: 'EUR',
      side_income: 0,
      declared_debt: 0,
      salary_source: 'European Parliament MEP salary',
      notes: appendSalarySource(null),
    }));
    for (let offset = 0; offset < rowsToUpsert.length; offset += PAGE_SIZE) {
      const chunk = rowsToUpsert.slice(offset, offset + PAGE_SIZE);
      const { data, error } = await supabase
        .from('politician_finances')
        .upsert(chunk, { onConflict: 'politician_id,declaration_year', ignoreDuplicates: true })
        .select('id');
      if (error) throw error;
      inserted += data?.length ?? 0;
    }
  }

  console.log(JSON.stringify({ ...planned, updated, inserted }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
