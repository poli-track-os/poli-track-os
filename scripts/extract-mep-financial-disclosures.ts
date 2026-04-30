#!/usr/bin/env node
// Extract structured fields from public European Parliament DPI PDFs.

import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { getSupabaseClient } from './influence-sync-helpers.ts';
import { parseMepFinancialDisclosureText, type DpiEntry } from '../src/lib/mep-financial-disclosure-parser.ts';

const execFileAsync = promisify(execFile);
const DEFAULT_OUTPUT_DIR = path.join('data', 'financial-disclosures', 'live', new Date().toISOString().slice(0, 10));
const PAGE_SIZE = 500;
const STANDARD_SALARY_SOURCE = 'https://www.europarl.europa.eu/meps/en/about/meps';

type Args = {
  apply: boolean;
  limit: number | null;
  outputDir: string;
  forceDownload: boolean;
};

type FinanceRow = {
  id: string;
  politician_id: string;
  declaration_year: number | null;
  side_income: number | null;
  notes: string | null;
  politicians?: {
    name: string | null;
    country_code: string | null;
    external_id: string | null;
  } | null;
};

type ExistingInvestment = {
  politician_id: string;
  company_name: string;
  investment_type: string;
  notes: string | null;
};

type ParsedFinance = {
  row: FinanceRow;
  sourceUrl: string;
  textPath: string;
  pdfPath: string;
  parsed: ReturnType<typeof parseMepFinancialDisclosureText>;
};

function parseArgs(argv: string[]): Args {
  const args: Args = {
    apply: false,
    limit: 50,
    outputDir: DEFAULT_OUTPUT_DIR,
    forceDownload: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === '--apply') {
      args.apply = true;
      continue;
    }
    if (token === '--force-download') {
      args.forceDownload = true;
      continue;
    }
    if (token === '--limit') {
      const raw = argv[++i];
      if (!raw) throw new Error('Missing value for --limit');
      args.limit = raw === 'all' ? null : Number.parseInt(raw, 10);
      continue;
    }
    if (token === '--output-dir') {
      args.outputDir = argv[++i] || '';
      if (!args.outputDir) throw new Error('Missing value for --output-dir');
      continue;
    }
    if (token === '--help' || token === '-h') {
      console.log('extract-mep-financial-disclosures.ts [--apply] [--limit N|all] [--output-dir path] [--force-download]');
      process.exit(0);
    }
    throw new Error(`Unknown argument: ${token}`);
  }

  if (args.limit !== null && (!Number.isFinite(args.limit) || args.limit < 1)) throw new Error('Invalid --limit');
  return args;
}

function pdfUrlFromNotes(notes: string | null) {
  const match = notes?.match(/https?:\/\/\S+?\.pdf/i);
  return match?.[0] || null;
}

function stableFileStem(url: string) {
  return createHash('sha1').update(url).digest('hex').slice(0, 16);
}

async function downloadPdf(url: string, targetPath: string, force: boolean) {
  if (!force && fs.existsSync(targetPath) && fs.statSync(targetPath).size > 0) return;
  const response = await fetch(url, {
    headers: { 'User-Agent': 'poli-track mep-financial-disclosure-extractor (https://github.com/poli-track-os/poli-track-os)' },
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText} for ${url}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  fs.writeFileSync(targetPath, bytes);
}

async function extractText(pdfPath: string, textPath: string) {
  await execFileAsync('pdftotext', ['-layout', '-enc', 'UTF-8', pdfPath, textPath]);
  return fs.readFileSync(textPath, 'utf8');
}

async function fetchFinanceRows(supabase: ReturnType<typeof getSupabaseClient>, limit: number | null) {
  const rows: FinanceRow[] = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    if (limit !== null && rows.length >= limit) break;
    const remaining = limit === null ? PAGE_SIZE : Math.min(PAGE_SIZE, limit - rows.length);
    const { data, error } = await supabase
      .from('politician_finances')
      .select('id, politician_id, declaration_year, side_income, notes, politicians(name, country_code, external_id)')
      .not('notes', 'is', null)
      .order('id', { ascending: true })
      .range(offset, offset + remaining - 1);
    if (error) throw error;
    rows.push(...((data || []) as FinanceRow[]).filter((row) => Boolean(pdfUrlFromNotes(row.notes))));
    if (!data || data.length < remaining) break;
  }
  return rows;
}

async function fetchExistingInvestments(supabase: ReturnType<typeof getSupabaseClient>) {
  const { data, error } = await supabase
    .from('politician_investments')
    .select('politician_id, company_name, investment_type, notes')
    .limit(20_000);
  if (error) throw error;
  return (data || []) as ExistingInvestment[];
}

function investmentKey(row: Pick<ExistingInvestment, 'politician_id' | 'company_name' | 'investment_type'>, sourceUrl: string) {
  return `${row.politician_id}|${row.company_name.trim().toLowerCase()}|${row.investment_type}|${sourceUrl}`;
}

function entryNote(entry: DpiEntry, sourceUrl: string, declarationDate: string | null) {
  return [
    `Section ${entry.section} extracted from public MEP private-interest declaration.`,
    declarationDate ? `Declaration date: ${declarationDate}.` : null,
    `Source: ${sourceUrl}`,
    `Raw: ${entry.rawText}`,
  ].filter(Boolean).join('\n');
}

function financeNote(existing: string | null, parsed: ParsedFinance['parsed']) {
  const lines = existing ? [existing] : [];
  const extractionSummary = [
    'DPI extraction summary:',
    `declaration_date=${parsed.declarationDate || 'unknown'}`,
    `section_b_side_income_entries=${parsed.sideIncomeEntries.length}`,
    `section_d_holding_entries=${parsed.holdings.length}`,
    `side_income_by_currency=${JSON.stringify(parsed.sideIncomeByCurrency)}`,
  ].join(' ');
  if (!lines.some((line) => line.includes('DPI extraction summary:'))) lines.push(extractionSummary);
  return lines.join('\n');
}

function canSetSideIncome(parsed: ParsedFinance['parsed']) {
  const currencies = Object.keys(parsed.sideIncomeByCurrency).filter((currency) => parsed.sideIncomeByCurrency[currency] > 0);
  if (currencies.length !== 1) return null;
  if (currencies[0] !== 'EUR') return null;
  return parsed.sideIncomeByCurrency.EUR;
}

async function parseRows(args: Args) {
  const supabase = getSupabaseClient(args.apply);
  const rows = await fetchFinanceRows(supabase, args.limit);
  const pdfDir = path.join(args.outputDir, 'pdf');
  const textDir = path.join(args.outputDir, 'text');
  fs.mkdirSync(pdfDir, { recursive: true });
  fs.mkdirSync(textDir, { recursive: true });

  const parsedRows: ParsedFinance[] = [];
  const errors: Array<{ finance_id: string; source_url: string | null; error: string }> = [];

  for (const row of rows) {
    const sourceUrl = pdfUrlFromNotes(row.notes);
    if (!sourceUrl) continue;
    const stem = stableFileStem(sourceUrl);
    const pdfPath = path.join(pdfDir, `${stem}.pdf`);
    const textPath = path.join(textDir, `${stem}.txt`);
    try {
      await downloadPdf(sourceUrl, pdfPath, args.forceDownload);
      const text = await extractText(pdfPath, textPath);
      parsedRows.push({ row, sourceUrl, pdfPath, textPath, parsed: parseMepFinancialDisclosureText(text) });
    } catch (error) {
      errors.push({ finance_id: row.id, source_url: sourceUrl, error: error instanceof Error ? error.message : String(error) });
    }
  }

  return { supabase, rows, parsedRows, errors };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const { supabase, rows, parsedRows, errors } = await parseRows(args);
  const existingInvestments = await fetchExistingInvestments(supabase);
  const existingKeys = new Set(
    existingInvestments.map((investment) => {
      const sourceUrl = investment.notes?.match(/Source: (https?:\/\/\S+?\.pdf)/)?.[1] || '';
      return investmentKey(investment, sourceUrl);
    }),
  );

  let financeUpdates = 0;
  let sideIncomeUpdates = 0;
  let yearCorrections = 0;
  let investmentsInserted = 0;
  const investmentRows: Array<Record<string, unknown>> = [];

  for (const item of parsedRows) {
    const sideIncome = canSetSideIncome(item.parsed);
    const nextYear = item.parsed.declarationYear;
    const updatePayload: Record<string, unknown> = {};
    const nextNotes = financeNote(item.row.notes, item.parsed);
    if (nextNotes !== (item.row.notes || '')) updatePayload.notes = nextNotes;
    if (sideIncome !== null && Number(item.row.side_income || 0) !== sideIncome) {
      updatePayload.side_income = sideIncome;
      sideIncomeUpdates += 1;
    }
    if (nextYear && item.row.declaration_year !== nextYear) {
      updatePayload.declaration_year = nextYear;
      yearCorrections += 1;
    }
    if (Object.keys(updatePayload).length > 0) financeUpdates += 1;

    if (args.apply) {
      const { error } = await supabase.from('politician_finances').update(updatePayload).eq('id', item.row.id);
      if (error) throw error;
    }

    for (const entry of item.parsed.holdings) {
      const row = {
        politician_id: item.row.politician_id,
        company_name: entry.description.slice(0, 300),
        sector: null,
        investment_type: 'holding_or_partnership',
        estimated_value: null,
        currency: entry.currency || 'EUR',
        is_active: true,
        disclosure_date: item.parsed.declarationDate,
        notes: entryNote(entry, item.sourceUrl, item.parsed.declarationDate),
      };
      const key = investmentKey(row, item.sourceUrl);
      if (existingKeys.has(key)) continue;
      existingKeys.add(key);
      investmentRows.push(row);
    }
  }

  if (args.apply && investmentRows.length > 0) {
    for (let offset = 0; offset < investmentRows.length; offset += PAGE_SIZE) {
      const chunk = investmentRows.slice(offset, offset + PAGE_SIZE);
      const { data, error } = await supabase.from('politician_investments').insert(chunk).select('id');
      if (error) throw error;
      investmentsInserted += data?.length ?? 0;
    }
  }

  const report = {
    apply: args.apply,
    output_dir: args.outputDir,
    finance_rows_seen: rows.length,
    pdfs_parsed: parsedRows.length,
    pdf_errors: errors.length,
    finance_updates_planned: financeUpdates,
    side_income_updates_planned: sideIncomeUpdates,
    declaration_year_corrections_planned: yearCorrections,
    holdings_planned: investmentRows.length,
    investments_inserted: investmentsInserted,
    errors: errors.slice(0, 20),
  };

  fs.mkdirSync(args.outputDir, { recursive: true });
  fs.writeFileSync(path.join(args.outputDir, args.apply ? 'apply-report.json' : 'dry-run-report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  if (!args.apply && investmentRows.length > 0) {
    fs.writeFileSync(path.join(args.outputDir, 'planned-investments.json'), JSON.stringify(investmentRows.slice(0, 200), null, 2));
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
