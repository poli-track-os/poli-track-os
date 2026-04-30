#!/usr/bin/env node

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import readline from 'node:readline';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import { pathToFileURL } from 'node:url';
import {
  emptyInfluenceBundle,
  normalizeInfluenceName,
  type InfluenceActorInput,
  type InfluenceBundle,
  type InfluenceClientInput,
} from '../src/lib/influence-ingest.ts';
import {
  isConservativeFecBulkReceipt,
  parseFecBulkDate,
  parseFecBulkLine,
} from '../src/lib/public-record-influence-parser.ts';
import {
  applyInfluenceBundle,
  getSupabaseClient,
  loadLocalEnv,
  summarizeBundle,
} from './influence-sync-helpers.ts';

const TODAY = new Date().toISOString().slice(0, 10);
const DEFAULT_OUTPUT_DIR = path.join('data', 'influence', 'public-records', 'live', `${TODAY}-fec-bulk`);
const USER_AGENT = 'poli-track-os FEC bulk collector (contact: research@poli-track-os.local)';
const DATA_SOURCE = 'us_fec_bulk_contribution';

type Args = {
  apply: boolean;
  cycle: number;
  limit: number;
  outputDir: string;
};

const COMMITTEE_HEADERS = [
  'CMTE_ID',
  'CMTE_NM',
  'TRES_NM',
  'CMTE_ST1',
  'CMTE_ST2',
  'CMTE_CITY',
  'CMTE_ST',
  'CMTE_ZIP',
  'CMTE_DSGN',
  'CMTE_TP',
  'CMTE_PTY_AFFILIATION',
  'CMTE_FILING_FREQ',
  'ORG_TP',
  'CONNECTED_ORG_NM',
  'CAND_ID',
];

function printHelp() {
  console.log(`Usage:
  npx tsx scripts/collect-fec-bulk-contributions.ts [--apply]

Options:
  --cycle YEAR       FEC two-year cycle. Default: 2026
  --limit N          Top conservative non-individual receipts to keep. Default: 40
  --output-dir DIR   Artifact directory. Default: ${DEFAULT_OUTPUT_DIR}
`);
}

function parseArgs(argv: string[]): Args {
  const args: Args = {
    apply: false,
    cycle: 2026,
    limit: 40,
    outputDir: DEFAULT_OUTPUT_DIR,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    const next = () => {
      const value = argv[++index];
      if (!value) throw new Error(`Missing value for ${token}`);
      return value;
    };

    if (token === '--apply') args.apply = true;
    else if (token === '--cycle') args.cycle = Number.parseInt(next(), 10);
    else if (token === '--limit') args.limit = Number.parseInt(next(), 10);
    else if (token === '--output-dir') args.outputDir = next();
    else if (token === '--help' || token === '-h') {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${token}`);
    }
  }

  if (!Number.isFinite(args.cycle) || args.cycle < 1978) throw new Error(`Invalid cycle: ${args.cycle}`);
  if (!Number.isFinite(args.limit) || args.limit < 0) throw new Error(`Invalid limit: ${args.limit}`);
  return args;
}

function cycleSuffix(cycle: number) {
  return String(cycle).slice(-2);
}

function fecBulkUrl(cycle: number, file: 'cm' | 'oth') {
  const suffix = cycleSuffix(cycle);
  return `https://www.fec.gov/files/bulk-downloads/${cycle}/${file}${suffix}.zip`;
}

function stableId(value: unknown) {
  const text = JSON.stringify(value);
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = (hash + ((hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24))) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

async function downloadFile(url: string, filePath: string) {
  if (fs.existsSync(filePath) && fs.statSync(filePath).size > 0) return;
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const response = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT },
    signal: AbortSignal.timeout(180_000),
  });
  if (!response.ok || !response.body) throw new Error(`${response.status} ${response.statusText} for ${url}`);
  await pipeline(Readable.fromWeb(response.body), fs.createWriteStream(filePath));
}

async function forEachZipLine(zipPath: string, onLine: (line: string) => void | Promise<void>) {
  const child = spawn('unzip', ['-p', zipPath], { stdio: ['ignore', 'pipe', 'pipe'] });
  let stderr = '';
  child.stderr.on('data', (chunk) => {
    stderr += String(chunk);
  });

  const lines = readline.createInterface({ input: child.stdout });
  for await (const line of lines) {
    await onLine(String(line));
  }

  const exitCode = await new Promise<number | null>((resolve) => {
    child.on('close', resolve);
  });
  if (exitCode !== 0) throw new Error(`unzip -p ${zipPath} failed with ${exitCode}: ${stderr.slice(0, 500)}`);
}

async function loadCommitteeNames(zipPath: string) {
  const committees = new Map<string, string>();
  await forEachZipLine(zipPath, (line) => {
    if (!line.trim()) return;
    const row = parseFecBulkLine(line, COMMITTEE_HEADERS);
    if (row.CMTE_ID && row.CMTE_NM) committees.set(row.CMTE_ID, row.CMTE_NM);
  });
  return committees;
}

function amount(row: Record<string, string>) {
  const parsed = Number(row.TRANSACTION_AMT);
  return Number.isFinite(parsed) ? parsed : 0;
}

async function selectTopReceipts(zipPath: string, limit: number) {
  const selected: Array<Record<string, string>> = [];
  let scanned = 0;
  let matched = 0;

  await forEachZipLine(zipPath, (line) => {
    if (!line.trim()) return;
    scanned += 1;
    const row = parseFecBulkLine(line);
    if (!isConservativeFecBulkReceipt(row)) return;
    matched += 1;
    selected.push(row);
    selected.sort((left, right) => amount(right) - amount(left));
    if (selected.length > limit) selected.pop();
  });

  return { selected, scanned, matched };
}

function addUniqueActor(bundle: InfluenceBundle, actor: InfluenceActorInput) {
  const external = actor.external_id || `${actor.data_source}:${normalizeInfluenceName(actor.name)}`;
  if (bundle.actors.some((row) => row.external_id === external && row.data_source === actor.data_source)) return;
  bundle.actors.push({ ...actor, external_id: external });
}

function addUniqueClient(bundle: InfluenceBundle, client: InfluenceClientInput) {
  const external = client.external_client_id || `${client.data_source}:${normalizeInfluenceName(client.name)}`;
  if (bundle.clients.some((row) => row.external_client_id === external && row.data_source === client.data_source)) return;
  bundle.clients.push({ ...client, external_client_id: external });
}

function buildBundle(rows: Array<Record<string, string>>, committeeNames: Map<string, string>, sourceUrl: string, cycle: number) {
  const bundle = emptyInfluenceBundle();

  for (const row of rows) {
    const contributorName = row.NAME?.trim();
    const committeeId = row.CMTE_ID?.trim();
    if (!contributorName || !committeeId) continue;

    const committeeName = committeeNames.get(committeeId) || committeeId;
    const contributorKind = row.ENTITY_TP === 'COM' ? 'company' : 'organisation';
    const contributorExternal = `fec:bulk_contributor:${row.ENTITY_TP.toLowerCase()}:${normalizeInfluenceName(contributorName)}`;
    const committeeExternal = `fec:committee:${committeeId}`;
    const date = parseFecBulkDate(row.TRANSACTION_DT);
    const transactionAmount = amount(row);
    const filingId = `fec:bulk_oth:${committeeId}:${row.TRAN_ID || row.SUB_ID || stableId(row)}`;

    addUniqueActor(bundle, {
      actor_kind: 'organisation',
      name: committeeName,
      country_code: 'US',
      jurisdiction: 'US federal elections',
      sector: 'campaign_committee',
      external_id: committeeExternal,
      data_source: DATA_SOURCE,
      source_url: `https://www.fec.gov/data/committee/${committeeId}/?cycle=${cycle}`,
      trust_level: 1,
      raw_data: { committee_id: committeeId, committee_name: committeeName },
    });
    addUniqueActor(bundle, {
      actor_kind: contributorKind,
      name: contributorName,
      country_code: row.STATE ? 'US' : null,
      jurisdiction: row.STATE || 'US campaign finance disclosure',
      sector: row.ENTITY_TP,
      external_id: contributorExternal,
      data_source: DATA_SOURCE,
      source_url: sourceUrl,
      trust_level: 1,
      raw_data: row,
    });
    addUniqueClient(bundle, {
      external_client_id: contributorExternal,
      name: contributorName,
      client_kind: contributorKind,
      country_code: row.STATE ? 'US' : null,
      sector: row.ENTITY_TP,
      data_source: DATA_SOURCE,
      source_url: sourceUrl,
      trust_level: 1,
      raw_data: row,
    });
    bundle.filings.push({
      filing_id: filingId,
      filing_type: 'other',
      registrant_actor_external_id: committeeExternal,
      registrant_name: committeeName,
      client_external_id: contributorExternal,
      client_name: contributorName,
      principal_country_code: 'US',
      year: cycle,
      period_start: date,
      period_end: date,
      issue_areas: ['campaign_finance_bulk_receipt', row.ENTITY_TP, row.TRANSACTION_TP].filter(Boolean),
      target_institutions: ['Federal Election Commission'],
      amount_reported: transactionAmount,
      amount_low: transactionAmount,
      amount_high: transactionAmount,
      currency: 'USD',
      description: `FEC bulk non-individual receipt from ${contributorName} to ${committeeName}`,
      source_url: sourceUrl,
      data_source: DATA_SOURCE,
      trust_level: 1,
      raw_data: row,
    });
    bundle.money.push({
      filing_external_id: filingId,
      payer_client_external_id: contributorExternal,
      recipient_actor_external_id: committeeExternal,
      money_type: 'donation',
      amount_exact: transactionAmount,
      currency: 'USD',
      period_start: date,
      period_end: date,
      description: `FEC bulk non-individual contribution from ${contributorName} to ${committeeName}`,
      source_url: sourceUrl,
      data_source: DATA_SOURCE,
      trust_level: 1,
      raw_data: row,
    });
  }

  return bundle;
}

function writeJson(filePath: string, value: unknown) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

async function main() {
  loadLocalEnv();
  const args = parseArgs(process.argv.slice(2));
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'poli-track-fec-bulk-'));
  process.once('exit', () => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });
  const rawDir = path.join(args.outputDir, 'raw');
  const normalizedDir = path.join(args.outputDir, 'normalized');
  const summaryDir = path.join(args.outputDir, 'summaries');
  const cmUrl = fecBulkUrl(args.cycle, 'cm');
  const othUrl = fecBulkUrl(args.cycle, 'oth');
  const cmZip = path.join(tempDir, `cm${cycleSuffix(args.cycle)}.zip`);
  const othZip = path.join(tempDir, `oth${cycleSuffix(args.cycle)}.zip`);

  await downloadFile(cmUrl, cmZip);
  await downloadFile(othUrl, othZip);

  const committeeNames = await loadCommitteeNames(cmZip);
  const { selected, scanned, matched } = await selectTopReceipts(othZip, args.limit);
  const bundle = buildBundle(selected, committeeNames, othUrl, args.cycle);
  const summary = summarizeBundle(bundle);

  const rawPath = path.join(rawDir, 'fec-bulk-selected-receipts.json');
  const bundlePath = path.join(normalizedDir, 'fec-bulk-influence-bundle.json');
  const reportPath = path.join(summaryDir, 'fec-bulk-collection-report.json');
  writeJson(rawPath, { cycle: args.cycle, cmUrl, othUrl, scanned, matched, selected });
  writeJson(bundlePath, bundle);

  let applied: ReturnType<typeof summarizeBundle> | null = null;
  if (args.apply) {
    applied = await applyInfluenceBundle(getSupabaseClient(true), bundle);
  }

  const report = {
    generated_at: new Date().toISOString(),
    apply: args.apply,
    args,
    scanned,
    matched,
    summary,
    applied,
    artifacts: { rawPath, bundlePath, reportPath },
  };
  writeJson(reportPath, report);
  console.log(JSON.stringify(report, null, 2));
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
