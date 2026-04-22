#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { createClient } from '@supabase/supabase-js';
import { buildCameraActSourceUrl, buildProposalFromCameraActRow, type CameraActRow } from '../src/lib/camera-helpers.ts';
import { fetchExistingProposalIdsBySourceUrl } from '../src/lib/proposal-sync.ts';

type Args = {
  apply: boolean;
  legislatures: string[];
  pageSize: number;
  maxPagesPerLegislature: number | null;
  expectProjectRef: string | null;
};

type SparqlBinding = { value?: string };
type SparqlResponse = {
  results?: {
    bindings?: Array<Record<string, SparqlBinding>>;
  };
};

const DEFAULT_LEGISLATURES = Array.from({ length: 19 }, (_, index) => String(19 - index));
const QUERY_BATCH_SIZE = 20;
const MIN_QUERY_INTERVAL_MS = 500;
let lastQueryStartedAt = 0;

function parseArgs(argv: string[]): Args {
  const args: Args = {
    apply: false,
    legislatures: [...DEFAULT_LEGISLATURES],
    pageSize: 500,
    maxPagesPerLegislature: null,
    expectProjectRef: null,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === '--apply') {
      args.apply = true;
      continue;
    }
    if (token === '--legislatures') {
      const next = argv[++index];
      if (!next) throw new Error('Missing value for --legislatures');
      args.legislatures = next.split(',').map((value) => value.trim()).filter(Boolean);
      continue;
    }
    if (token === '--page-size') {
      const next = argv[++index];
      if (!next) throw new Error('Missing value for --page-size');
      args.pageSize = Math.max(1, parseInt(next, 10));
      continue;
    }
    if (token === '--max-pages-per-legislature') {
      const next = argv[++index];
      if (!next) throw new Error('Missing value for --max-pages-per-legislature');
      args.maxPagesPerLegislature = Math.max(1, parseInt(next, 10));
      continue;
    }
    if (token === '--expect-project-ref') {
      const next = argv[++index];
      if (!next) throw new Error('Missing value for --expect-project-ref');
      args.expectProjectRef = next.trim();
      continue;
    }
    if (token === '--help' || token === '-h') {
      console.log('scripts/sync-camera-atti.ts [--apply] [--legislatures 19,18] [--page-size 500] [--max-pages-per-legislature 2]');
      process.exit(0);
    }
    throw new Error(`Unknown argument: ${token}`);
  }

  return args;
}

function loadEnvFile(filePath: string, shellEnvKeys: Set<string>, overwrite = false) {
  if (!fs.existsSync(filePath)) return;
  const content = fs.readFileSync(filePath, 'utf8');
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const separator = line.indexOf('=');
    if (separator === -1) continue;
    const key = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();
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
  if (!url) throw new Error('Missing SUPABASE_URL or VITE_SUPABASE_URL');
  const key = apply
    ? process.env.SUPABASE_SERVICE_ROLE_KEY
    : process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  if (!key) throw new Error('Missing credentials');
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

async function ensureRunLog(supabase: ReturnType<typeof createClient>): Promise<string | null> {
  const { data, error } = await supabase
    .from('scrape_runs')
    .insert({ source_type: 'camera_atti', status: 'running' })
    .select('id')
    .single();
  if (error) {
    console.error('ensureRunLog failed:', error.message);
    return null;
  }
  return (data as { id: string }).id;
}

async function updateRunLog(
  supabase: ReturnType<typeof createClient>,
  runId: string | null,
  payload: {
    status: 'completed' | 'failed';
    records_fetched: number;
    records_created?: number;
    records_updated?: number;
    error_message?: string | null;
  },
) {
  if (!runId) return;
  await supabase.from('scrape_runs').update({ ...payload, completed_at: new Date().toISOString() }).eq('id', runId);
}

async function querySparql(query: string): Promise<Array<Record<string, string>>> {
  const waitMs = Math.max(0, MIN_QUERY_INTERVAL_MS - (Date.now() - lastQueryStartedAt));
  if (waitMs > 0) await new Promise((resolve) => setTimeout(resolve, waitMs));
  lastQueryStartedAt = Date.now();

  const url = `https://dati.camera.it/sparql?query=${encodeURIComponent(query)}&format=${encodeURIComponent('application/sparql-results+json')}`;
  const response = await fetch(url, {
    headers: {
      Accept: 'application/sparql-results+json',
      'User-Agent': 'Mozilla/5.0',
    },
    signal: AbortSignal.timeout(60000),
  });
  if (!response.ok) throw new Error(`dati.camera.it ${response.status} for SPARQL query`);
  const json = (await response.json()) as SparqlResponse;
  return (json.results?.bindings ?? []).map((binding) =>
    Object.fromEntries(Object.entries(binding).map(([key, value]) => [key, value?.value ?? ''])),
  );
}

function buildActsPageQuery(legislature: string, limit: number, offset: number): string {
  return `
PREFIX ocd: <http://dati.camera.it/ocd/>
PREFIX dc: <http://purl.org/dc/elements/1.1/>
SELECT DISTINCT ?attoUri ?identifier ?title ?initiativeType ?submittedDate ?description
WHERE {
  ?attoUri a ocd:atto;
           dc:identifier ?identifier;
           dc:title ?title;
           dc:type 'Progetto di Legge';
           ocd:rif_leg <http://dati.camera.it/ocd/legislatura.rdf/repubblica_${legislature}>;
           ocd:iniziativa ?initiativeType;
           dc:date ?submittedDate.
  OPTIONAL { ?attoUri dc:description ?description. }
}
ORDER BY xsd:integer(?identifier)
LIMIT ${limit}
OFFSET ${offset}
`.trim();
}

async function fetchActsPage(legislature: string, pageSize: number, offset: number): Promise<CameraActRow[]> {
  const rows = await querySparql(buildActsPageQuery(legislature, pageSize, offset));
  return rows.map((row) => ({
    attoUri: buildCameraActSourceUrl(legislature, row.identifier ?? ''),
    legislature,
    identifier: row.identifier ?? '',
    title: row.title ?? '',
    initiativeType: row.initiativeType ?? '',
    submittedDate: row.submittedDate ?? '',
    description: row.description ?? null,
  }));
}

function buildCreatorsQuery(attoUris: string[]): string {
  const values = attoUris.map((uri) => `<${uri}>`).join(' ');
  return `
PREFIX dc: <http://purl.org/dc/elements/1.1/>
SELECT DISTINCT ?attoUri ?creator
WHERE {
  VALUES ?attoUri { ${values} }
  ?attoUri dc:creator ?creator.
}
ORDER BY ?attoUri ?creator
`.trim();
}

async function fetchCreatorsByAttoUri(attoUris: string[]): Promise<Map<string, string[]>> {
  const creatorsByUri = new Map<string, string[]>();

  async function fetchBatch(batch: string[]): Promise<Array<Record<string, string>>> {
    try {
      return await querySparql(buildCreatorsQuery(batch));
    } catch (error) {
      if (batch.length === 1) {
        console.error(`camera_atti creators fallback ${batch[0]}: ${error instanceof Error ? error.message : String(error)}`);
        return [];
      }
      const midpoint = Math.floor(batch.length / 2);
      const left = await fetchBatch(batch.slice(0, midpoint));
      const right = await fetchBatch(batch.slice(midpoint));
      return [...left, ...right];
    }
  }

  for (let index = 0; index < attoUris.length; index += QUERY_BATCH_SIZE) {
    const batch = attoUris.slice(index, index + QUERY_BATCH_SIZE);
    const rows = await fetchBatch(batch);
    for (const row of rows) {
      const attoUri = (row.attoUri ?? '').trim();
      const creator = (row.creator ?? '').trim();
      if (!attoUri || !creator) continue;
      const existing = creatorsByUri.get(attoUri) ?? [];
      existing.push(creator);
      creatorsByUri.set(attoUri, existing);
    }
  }
  return creatorsByUri;
}

function buildStateLabelsQuery(attoUris: string[]): string {
  const values = attoUris.map((uri) => `<${uri}>`).join(' ');
  return `
PREFIX ocd: <http://dati.camera.it/ocd/>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
SELECT DISTINCT ?attoUri ?stateLabel
WHERE {
  VALUES ?attoUri { ${values} }
  ?attoUri ocd:rif_statoIter ?state .
  ?state rdfs:label ?stateLabel.
}
ORDER BY ?attoUri ?stateLabel
`.trim();
}

async function fetchStateLabelsByAttoUri(attoUris: string[]): Promise<Map<string, string[]>> {
  const labelsByUri = new Map<string, string[]>();

  async function fetchBatch(batch: string[]): Promise<Array<Record<string, string>>> {
    try {
      return await querySparql(buildStateLabelsQuery(batch));
    } catch (error) {
      if (batch.length === 1) {
        console.error(`camera_atti state fallback ${batch[0]}: ${error instanceof Error ? error.message : String(error)}`);
        return [];
      }
      const midpoint = Math.floor(batch.length / 2);
      const left = await fetchBatch(batch.slice(0, midpoint));
      const right = await fetchBatch(batch.slice(midpoint));
      return [...left, ...right];
    }
  }

  for (let index = 0; index < attoUris.length; index += QUERY_BATCH_SIZE) {
    const batch = attoUris.slice(index, index + QUERY_BATCH_SIZE);
    const rows = await fetchBatch(batch);
    for (const row of rows) {
      const attoUri = (row.attoUri ?? '').trim();
      const stateLabel = (row.stateLabel ?? '').trim();
      if (!attoUri || !stateLabel) continue;
      const existing = labelsByUri.get(attoUri) ?? [];
      existing.push(stateLabel);
      labelsByUri.set(attoUri, existing);
    }
  }
  return labelsByUri;
}

async function main() {
  loadLocalEnv();
  const args = parseArgs(process.argv.slice(2));
  const supabase = getSupabaseClient(args.apply);

  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
  const projectRef = (() => {
    try {
      return new URL(url).hostname.split('.')[0];
    } catch {
      return null;
    }
  })();
  if (args.expectProjectRef && projectRef !== args.expectProjectRef) {
    throw new Error(`Resolved project ref ${projectRef ?? 'unknown'} does not match expected ${args.expectProjectRef}`);
  }

  const runId = args.apply ? await ensureRunLog(supabase) : null;
  let totalFetched = 0;
  let totalPrepared = 0;
  let totalCreated = 0;
  let totalUpdated = 0;

  try {
    for (const legislature of args.legislatures) {
      for (let pageIndex = 0; ; pageIndex += 1) {
        if (args.maxPagesPerLegislature && pageIndex >= args.maxPagesPerLegislature) break;
        const offset = pageIndex * args.pageSize;
        const rows = await fetchActsPage(legislature, args.pageSize, offset);
        if (rows.length === 0) break;

        totalFetched += rows.length;
        const attoUris = rows.map((row) => row.attoUri).filter(Boolean);
        const creatorsByUri = await fetchCreatorsByAttoUri(attoUris);
        const stateLabelsByUri = await fetchStateLabelsByAttoUri(attoUris);
        const proposals = rows
          .map((row) => buildProposalFromCameraActRow(
            row,
            creatorsByUri.get(row.attoUri) ?? [],
            stateLabelsByUri.get(row.attoUri) ?? [],
          ))
          .filter((proposal): proposal is NonNullable<typeof proposal> => Boolean(proposal));
        totalPrepared += proposals.length;

        if (args.apply && proposals.length > 0) {
          const existingByUrl = await fetchExistingProposalIdsBySourceUrl(
            supabase,
            proposals.map((proposal) => proposal.source_url),
            50,
          );

          totalCreated += proposals.filter((proposal) => !existingByUrl.has(proposal.source_url)).length;
          totalUpdated += proposals.filter((proposal) => existingByUrl.has(proposal.source_url)).length;

          for (let index = 0; index < proposals.length; index += 250) {
            const chunk = proposals.slice(index, index + 250);
            const { error } = await supabase.from('proposals').upsert(chunk, { onConflict: 'source_url' });
            if (error) throw error;
          }
        }

        console.error(`camera_atti legislature ${legislature} page ${pageIndex + 1}: fetched=${rows.length} prepared=${proposals.length}`);
        if (rows.length < args.pageSize) break;
      }
    }

    if (args.apply) {
      await supabase.rpc('increment_total_records', { p_source_type: 'camera_atti', p_delta: totalCreated + totalUpdated });
      await updateRunLog(supabase, runId, {
        status: 'completed',
        records_fetched: totalFetched,
        records_created: totalCreated,
        records_updated: totalUpdated,
      });
    }

    console.log(JSON.stringify({
      apply: args.apply,
      fetched: totalFetched,
      prepared: totalPrepared,
      created: totalCreated,
      updated: totalUpdated,
      legislatures: args.legislatures,
      pageSize: args.pageSize,
    }, null, 2));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await updateRunLog(supabase, runId, { status: 'failed', records_fetched: totalFetched, error_message: message });
    throw error;
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
