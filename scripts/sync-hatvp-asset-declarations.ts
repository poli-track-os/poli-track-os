#!/usr/bin/env node
// Sync official French HATVP financial-interest and public asset declarations.

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { XMLParser } from 'fast-xml-parser';
import { getSupabaseClient } from './influence-sync-helpers.ts';
import {
  parseHatvpAssetDeclaration,
  parseHatvpInterestDeclaration,
  type HatvpAssetItem,
  type HatvpFinancialInterest,
} from '../src/lib/hatvp-asset-parser.ts';

const LIST_URL = 'https://www.hatvp.fr/livraison/opendata/liste.csv';
const MERGED_XML_URL = 'https://www.hatvp.fr/livraison/merge/declarations.xml';
const DOSSIER_BASE_URL = 'https://www.hatvp.fr/livraison/dossiers';
const DEFAULT_OUTPUT_DIR = path.join('data', 'asset-declarations', 'live', new Date().toISOString().slice(0, 10));
const USER_AGENT = 'poli-track hatvp-asset-sync (official public disclosures)';

type Args = {
  apply: boolean;
  country: string;
  limit: number | null;
  outputDir: string;
  forceDownload: boolean;
};

type Politician = {
  id: string;
  name: string;
  country_code: string | null;
  role: string | null;
};

type FinanceRow = {
  id: string;
  politician_id: string;
  declaration_year: number | null;
  annual_salary: number | null;
  currency: string | null;
  side_income: number | null;
  declared_assets: number | null;
  property_value: number | null;
  declared_debt: number | null;
  salary_source: string | null;
  notes: string | null;
};

type InvestmentRow = {
  politician_id: string;
  company_name: string;
  investment_type: string;
  notes: string | null;
};

type HatvpListRow = {
  civilite: string;
  prenom: string;
  nom: string;
  classement: string;
  type_mandat: string;
  qualite: string;
  type_document: string;
  departement: string;
  date_publication: string;
  date_depot: string;
  nom_fichier: string;
  url_dossier: string;
  open_data: string;
  statut_publication: string;
  id_origine: string;
  url_photo: string;
};

type FinancePatch = {
  politician: Politician;
  year: number;
  sourceUrl: string;
  sourceLabel: string;
  sideIncome?: number;
  declaredAssets?: number;
  propertyValue?: number;
  declaredDebt?: number;
};

function parseArgs(argv: string[]): Args {
  const args: Args = {
    apply: false,
    country: 'FR',
    limit: null,
    outputDir: DEFAULT_OUTPUT_DIR,
    forceDownload: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === '--apply') {
      args.apply = true;
      continue;
    }
    if (token === '--country') {
      args.country = (argv[++index] || '').toUpperCase();
      if (!args.country) throw new Error('Missing value for --country');
      continue;
    }
    if (token === '--limit') {
      const raw = argv[++index];
      if (!raw) throw new Error('Missing value for --limit');
      args.limit = raw === 'all' ? null : Number.parseInt(raw, 10);
      continue;
    }
    if (token === '--output-dir') {
      args.outputDir = argv[++index] || '';
      if (!args.outputDir) throw new Error('Missing value for --output-dir');
      continue;
    }
    if (token === '--force-download') {
      args.forceDownload = true;
      continue;
    }
    if (token === '--help' || token === '-h') {
      console.log('sync-hatvp-asset-declarations.ts [--apply] [--country FR] [--limit N|all] [--output-dir path] [--force-download]');
      process.exit(0);
    }
    throw new Error(`Unknown argument: ${token}`);
  }

  if (args.limit !== null && (!Number.isFinite(args.limit) || args.limit < 1)) throw new Error('Invalid --limit');
  return args;
}

function normalizeName(value: string) {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/['’.-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function fullHatvpName(row: Pick<HatvpListRow, 'prenom' | 'nom'>) {
  return `${row.prenom} ${row.nom}`.replace(/\s+/g, ' ').trim();
}

function parseCsv(text: string): HatvpListRow[] {
  const parseLine = (line: string) => {
    const cells: string[] = [];
    let current = '';
    let quoted = false;
    for (let index = 0; index < line.length; index += 1) {
      const char = line[index];
      const next = line[index + 1];
      if (char === '"' && quoted && next === '"') {
        current += '"';
        index += 1;
        continue;
      }
      if (char === '"') {
        quoted = !quoted;
        continue;
      }
      if (char === ';' && !quoted) {
        cells.push(current);
        current = '';
        continue;
      }
      current += char;
    }
    cells.push(current);
    return cells;
  };

  const lines = text.split(/\r?\n/).filter(Boolean);
  const header = parseLine(lines.shift() || '');
  return lines.map((line) => {
    const cells = parseLine(line);
    return Object.fromEntries(header.map((key, index) => [key, cells[index] || ''])) as HatvpListRow;
  });
}

async function fetchText(url: string) {
  const response = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT },
    signal: AbortSignal.timeout(120_000),
  });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText} for ${url}`);
  return response.text();
}

async function cachedFetch(url: string, filePath: string, force: boolean) {
  if (!force && fs.existsSync(filePath) && fs.statSync(filePath).size > 0) return fs.readFileSync(filePath, 'utf8');
  const text = await fetchText(url);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, text);
  return text;
}

async function maybeDownloadXml(fileName: string, outputDir: string, force: boolean) {
  const url = `${DOSSIER_BASE_URL}/${fileName}`;
  const target = path.join(outputDir, 'raw', fileName);
  if (!force && fs.existsSync(target) && fs.statSync(target).size > 0) {
    const cached = fs.readFileSync(target, 'utf8');
    return cached.trimStart().startsWith('<?xml') ? { url, text: cached } : null;
  }

  try {
    const text = await fetchText(url);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, text);
    return text.trimStart().startsWith('<?xml') ? { url, text } : null;
  } catch {
    return null;
  }
}

function parseXmlDeclaration(text: string) {
  const parser = new XMLParser({ ignoreAttributes: false, trimValues: true });
  const parsed = parser.parse(text);
  return parsed.declaration as Record<string, unknown>;
}

function parseMergedXml(text: string) {
  const parser = new XMLParser({ ignoreAttributes: false, trimValues: true });
  const parsed = parser.parse(text);
  const declarations = parsed.declarations?.declaration;
  return (Array.isArray(declarations) ? declarations : [declarations])
    .filter(Boolean) as Array<Record<string, unknown>>;
}

function declarationPersonName(declaration: Record<string, unknown>) {
  const general = declaration.general as any;
  const declarant = general?.declarant || {};
  return `${declarant.prenom || ''} ${declarant.nom || ''}`.replace(/\s+/g, ' ').trim();
}

function declarationType(declaration: Record<string, unknown>) {
  const general = declaration.general as any;
  return String(general?.typeDeclaration?.id || '').toUpperCase();
}

function isAssetDeclaration(declaration: Record<string, unknown>) {
  return declarationType(declaration).startsWith('DSP');
}

function listRowsByPerson(rows: HatvpListRow[]) {
  const byName = new Map<string, HatvpListRow[]>();
  for (const row of rows) {
    const key = normalizeName(fullHatvpName(row));
    if (!byName.has(key)) byName.set(key, []);
    byName.get(key)!.push(row);
  }
  return byName;
}

function latestRows(rows: HatvpListRow[], typeDocuments: string[]) {
  return rows
    .filter((row) => typeDocuments.includes(row.type_document.toLowerCase()))
    .filter((row) => row.statut_publication === 'Livrée' && row.open_data)
    .sort((left, right) => String(right.date_depot).localeCompare(String(left.date_depot)));
}

function investmentKey(row: Pick<InvestmentRow, 'politician_id' | 'company_name' | 'investment_type'>, sourceUrl: string) {
  return `${row.politician_id}|${row.company_name.trim().toLowerCase()}|${row.investment_type}|${sourceUrl}`;
}

function financeNote(sourceLabel: string, sourceUrl: string) {
  return `HATVP official disclosure sync: ${sourceLabel}. Source: ${sourceUrl}`;
}

function interestNote(interest: HatvpFinancialInterest, sourceUrl: string, disclosureDate: string | null) {
  return [
    'HATVP financial participation declaration.',
    disclosureDate ? `Disclosure date: ${disclosureDate}.` : null,
    interest.capitalHeld !== null ? `Capital held: ${interest.capitalHeld}.` : null,
    interest.shareCount !== null ? `Shares/parts: ${interest.shareCount}.` : null,
    interest.remuneration ? `Remuneration: ${interest.remuneration}.` : null,
    `Source: ${sourceUrl}`,
    `Raw: ${JSON.stringify(interest.rawData).slice(0, 1200)}`,
  ].filter(Boolean).join('\n');
}

function assetNote(item: HatvpAssetItem, sourceUrl: string, disclosureDate: string | null) {
  return [
    'HATVP public asset declaration item.',
    disclosureDate ? `Disclosure date: ${disclosureDate}.` : null,
    item.isLiability ? 'Liability/debt item.' : 'Asset item.',
    `Source category: ${item.sourceCategory}.`,
    `Source: ${sourceUrl}`,
    `Raw: ${JSON.stringify(item.rawData).slice(0, 1200)}`,
  ].filter(Boolean).join('\n');
}

async function fetchPoliticians(supabase: ReturnType<typeof getSupabaseClient>, country: string, limit: number | null) {
  let query = supabase
    .from('politicians')
    .select('id, name, country_code, role')
    .eq('country_code', country)
    .order('name', { ascending: true });
  if (limit !== null) query = query.limit(limit);
  const { data, error } = await query;
  if (error) throw error;
  return (data || []) as Politician[];
}

async function fetchExistingFinance(supabase: ReturnType<typeof getSupabaseClient>, politicianIds: string[]) {
  if (politicianIds.length === 0) return new Map<string, FinanceRow>();
  const { data, error } = await supabase
    .from('politician_finances')
    .select('id, politician_id, declaration_year, annual_salary, currency, side_income, declared_assets, property_value, declared_debt, salary_source, notes')
    .in('politician_id', politicianIds);
  if (error) throw error;
  return new Map((data || []).map((row) => [`${row.politician_id}:${row.declaration_year}`, row as FinanceRow]));
}

async function fetchExistingInvestments(supabase: ReturnType<typeof getSupabaseClient>) {
  const { data, error } = await supabase
    .from('politician_investments')
    .select('politician_id, company_name, investment_type, notes')
    .limit(50_000);
  if (error) throw error;
  return (data || []) as InvestmentRow[];
}

function mergePatch(acc: Map<string, FinancePatch>, patch: FinancePatch) {
  const key = `${patch.politician.id}:${patch.year}`;
  const existing = acc.get(key);
  if (!existing) {
    acc.set(key, patch);
    return;
  }
  acc.set(key, {
    ...existing,
    sideIncome: patch.sideIncome ?? existing.sideIncome,
    declaredAssets: patch.declaredAssets ?? existing.declaredAssets,
    propertyValue: patch.propertyValue ?? existing.propertyValue,
    declaredDebt: patch.declaredDebt ?? existing.declaredDebt,
    sourceUrl: existing.sourceUrl === patch.sourceUrl ? existing.sourceUrl : `${existing.sourceUrl} ${patch.sourceUrl}`,
    sourceLabel: existing.sourceLabel === patch.sourceLabel ? existing.sourceLabel : `${existing.sourceLabel}; ${patch.sourceLabel}`,
  });
}

function updateNotes(existing: string | null, nextNote: string) {
  if (existing?.includes(nextNote)) return existing;
  return [existing, nextNote].filter(Boolean).join('\n');
}

async function applyFinancePatches(
  supabase: ReturnType<typeof getSupabaseClient>,
  patches: FinancePatch[],
  existingFinance: Map<string, FinanceRow>,
) {
  let inserted = 0;
  let updated = 0;
  for (const patch of patches) {
    const key = `${patch.politician.id}:${patch.year}`;
    const existing = existingFinance.get(key);
    const payload = {
      side_income: patch.sideIncome,
      declared_assets: patch.declaredAssets,
      property_value: patch.propertyValue,
      declared_debt: patch.declaredDebt,
      notes: financeNote(patch.sourceLabel, patch.sourceUrl),
    };
    const cleanedPayload = Object.fromEntries(Object.entries(payload).filter(([, value]) => value !== undefined));

    if (existing) {
      const { error } = await supabase
        .from('politician_finances')
        .update({
          ...cleanedPayload,
          notes: updateNotes(existing.notes, cleanedPayload.notes as string),
        })
        .eq('id', existing.id);
      if (error) throw error;
      updated += 1;
    } else {
      const { error } = await supabase
        .from('politician_finances')
        .insert({
          politician_id: patch.politician.id,
          declaration_year: patch.year,
          currency: 'EUR',
          side_income: patch.sideIncome ?? 0,
          declared_assets: patch.declaredAssets,
          property_value: patch.propertyValue,
          declared_debt: patch.declaredDebt ?? 0,
          notes: cleanedPayload.notes as string,
        });
      if (error) throw error;
      inserted += 1;
    }
  }
  return { inserted, updated };
}

async function insertInvestments(supabase: ReturnType<typeof getSupabaseClient>, rows: Array<Record<string, unknown>>) {
  let inserted = 0;
  for (let offset = 0; offset < rows.length; offset += 500) {
    const chunk = rows.slice(offset, offset + 500);
    const { data, error } = await supabase.from('politician_investments').insert(chunk).select('id');
    if (error) throw error;
    inserted += data?.length || 0;
  }
  return inserted;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  fs.mkdirSync(args.outputDir, { recursive: true });

  const supabase = getSupabaseClient(args.apply);
  const politicians = await fetchPoliticians(supabase, args.country, args.limit);
  const politicianByName = new Map(politicians.map((politician) => [normalizeName(politician.name), politician]));

  const listText = await cachedFetch(LIST_URL, path.join(args.outputDir, 'raw', 'hatvp-liste.csv'), args.forceDownload);
  const listRows = parseCsv(listText);
  const rowsByPerson = listRowsByPerson(listRows);
  const mergedText = await cachedFetch(MERGED_XML_URL, path.join(args.outputDir, 'raw', 'hatvp-declarations.xml'), args.forceDownload);
  const mergedDeclarations = parseMergedXml(mergedText);

  const existingFinance = await fetchExistingFinance(supabase, politicians.map((politician) => politician.id));
  const existingInvestments = await fetchExistingInvestments(supabase);
  const existingInvestmentKeys = new Set(existingInvestments.map((investment) => {
    const sourceUrl = investment.notes?.match(/Source: (https?:\/\/\S+)/)?.[1] || '';
    return investmentKey(investment, sourceUrl);
  }));

  const financePatches = new Map<string, FinancePatch>();
  const investmentRows: Array<Record<string, unknown>> = [];
  const matchedPoliticians = new Set<string>();
  const publicAssetPoliticians = new Set<string>();
  const unavailablePatrimony: Array<Record<string, string>> = [];
  const downloadedInterestFiles: string[] = [];
  const parsedAssetDeclarations: Array<Record<string, unknown>> = [];

  for (const politician of politicians) {
    const personRows = rowsByPerson.get(normalizeName(politician.name)) || [];
    if (personRows.length > 0) matchedPoliticians.add(politician.id);

    const latestInterest = latestRows(personRows, ['di', 'dim'])[0];
    if (latestInterest) {
      const downloaded = await maybeDownloadXml(latestInterest.open_data, args.outputDir, args.forceDownload);
      if (downloaded) {
        downloadedInterestFiles.push(latestInterest.open_data);
        const declaration = parseXmlDeclaration(downloaded.text);
        const parsed = parseHatvpInterestDeclaration(declaration);
        for (const [yearText, amount] of Object.entries(parsed.sideIncomeByYear)) {
          mergePatch(financePatches, {
            politician,
            year: Number(yearText),
            sideIncome: amount,
            sourceUrl: downloaded.url,
            sourceLabel: `HATVP ${parsed.declarationType} side-income declaration`,
          });
        }

        for (const interest of parsed.financialInterests) {
          const row = {
            politician_id: politician.id,
            company_name: interest.companyName.slice(0, 300),
            sector: 'Financial participation',
            investment_type: 'financial_participation',
            estimated_value: interest.value,
            currency: 'EUR',
            is_active: true,
            disclosure_date: parsed.declarationDate,
            notes: interestNote(interest, downloaded.url, parsed.declarationDate),
          };
          const key = investmentKey(row, downloaded.url);
          if (existingInvestmentKeys.has(key)) continue;
          existingInvestmentKeys.add(key);
          investmentRows.push(row);
        }
      }
    }
  }

  for (const declaration of mergedDeclarations.filter(isAssetDeclaration)) {
    const politician = politicianByName.get(normalizeName(declarationPersonName(declaration)));
    if (!politician) continue;
    matchedPoliticians.add(politician.id);
    const parsed = parseHatvpAssetDeclaration(declaration);
    if (!parsed.declarationYear) continue;
    const sourceUrl = MERGED_XML_URL;
    publicAssetPoliticians.add(politician.id);
    mergePatch(financePatches, {
      politician,
      year: parsed.declarationYear,
      declaredAssets: parsed.declaredAssets,
      propertyValue: parsed.propertyValue,
      declaredDebt: parsed.declaredDebt,
      sourceUrl,
      sourceLabel: `HATVP ${parsed.declarationType} public asset declaration`,
    });
    parsedAssetDeclarations.push({
      politician: politician.name,
      declarationType: parsed.declarationType,
      declarationDate: parsed.declarationDate,
      declaredAssets: parsed.declaredAssets,
      declaredDebt: parsed.declaredDebt,
      netWorth: parsed.netWorth,
      itemCount: parsed.items.length,
    });

    for (const item of parsed.items) {
      if (item.value === null && item.isLiability) continue;
      const row = {
        politician_id: politician.id,
        company_name: item.label.slice(0, 300),
        sector: item.sector,
        investment_type: item.itemKind,
        estimated_value: item.value,
        currency: item.currency,
        is_active: !item.isLiability,
        disclosure_date: parsed.declarationDate,
        notes: assetNote(item, sourceUrl, parsed.declarationDate),
      };
      const key = investmentKey(row, sourceUrl);
      if (existingInvestmentKeys.has(key)) continue;
      existingInvestmentKeys.add(key);
      investmentRows.push(row);
    }
  }

  for (const politician of politicians) {
    if (publicAssetPoliticians.has(politician.id)) continue;
    const personRows = rowsByPerson.get(normalizeName(politician.name)) || [];
    for (const assetRow of latestRows(personRows, ['dsp', 'dspm', 'dspfm'])) {
      unavailablePatrimony.push({
        politician: politician.name,
        type_document: assetRow.type_document,
        date_depot: assetRow.date_depot,
        status: assetRow.statut_publication,
        note: 'HATVP lists a patrimony declaration, but no downloadable public XML appeared in the official merged public asset feed for this person.',
      });
    }
  }

  const unmatchedPoliticians = politicians
    .filter((politician) => !matchedPoliticians.has(politician.id))
    .map((politician) => ({ id: politician.id, name: politician.name, role: politician.role }));
  const patches = [...financePatches.values()].sort((left, right) => left.politician.name.localeCompare(right.politician.name) || left.year - right.year);

  let financeApplyResult = { inserted: 0, updated: 0 };
  let investmentsInserted = 0;
  if (args.apply) {
    financeApplyResult = await applyFinancePatches(supabase, patches, existingFinance);
    investmentsInserted = await insertInvestments(supabase, investmentRows);
  }

  const report = {
    apply: args.apply,
    country: args.country,
    outputDir: args.outputDir,
    politiciansConsidered: politicians.length,
    matchedPoliticians: matchedPoliticians.size,
    unmatchedPoliticians,
    interestFilesDownloaded: downloadedInterestFiles.length,
    financePatches: patches.length,
    financeInserted: financeApplyResult.inserted,
    financeUpdated: financeApplyResult.updated,
    investmentRowsPrepared: investmentRows.length,
    investmentsInserted,
    publicAssetDeclarationsMatched: parsedAssetDeclarations,
    unavailablePatrimony: unavailablePatrimony.slice(0, 250),
    sources: {
      list: LIST_URL,
      mergedXml: MERGED_XML_URL,
      dossierBase: DOSSIER_BASE_URL,
    },
    generatedAt: new Date().toISOString(),
  };

  const reportPath = path.join(args.outputDir, 'hatvp-asset-report.json');
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
