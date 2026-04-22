#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { createClient } from '@supabase/supabase-js';
import { buildProposalFromSenatoDdlRow, type SenatoDdlRow } from '../src/lib/senato-ddl-helpers.ts';
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
const SPONSOR_BATCH_SIZE = 50;
const MIN_QUERY_INTERVAL_MS = 1200;
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
      console.log('scripts/sync-senato-ddl.ts [--apply] [--legislatures 19,18] [--page-size 500] [--max-pages-per-legislature 2]');
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
    .insert({ source_type: 'senato_ddl', status: 'running' })
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
  const url = `https://dati.senato.it/sparql?query=${encodeURIComponent(query)}&format=${encodeURIComponent('application/sparql-results+json')}`;
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const waitMs = Math.max(0, MIN_QUERY_INTERVAL_MS - (Date.now() - lastQueryStartedAt));
    if (waitMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, waitMs));
    }
    lastQueryStartedAt = Date.now();

    const response = await fetch(url, {
      headers: {
        'Accept': 'application/sparql-results+json',
        'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36',
      },
      signal: AbortSignal.timeout(60000),
    });
    if (response.ok) {
      const json = (await response.json()) as SparqlResponse;
      return (json.results?.bindings ?? []).map((binding) =>
        Object.fromEntries(Object.entries(binding).map(([key, value]) => [key, value?.value ?? ''])),
      );
    }

    lastError = new Error(`dati.senato.it ${response.status} for SPARQL query`);
    if (response.status !== 403 && response.status < 500) {
      throw lastError;
    }
    const cooldownMs = response.status === 403 ? 60000 * (attempt + 1) : 5000 * (attempt + 1);
    await new Promise((resolve) => setTimeout(resolve, cooldownMs));
  }

  throw lastError ?? new Error('Unknown SPARQL failure');
}

function buildDdlPageQuery(legislature: string, limit: number, offset: number): string {
  return `
PREFIX osr: <http://dati.senato.it/osr/>
SELECT DISTINCT ?idFase ?legislatura ?ramo ?numeroFase ?titolo ?natura ?stato ?dataStato ?dataPresentazione
WHERE {
  ?ddl a osr:Ddl;
       osr:idFase ?idFase;
       osr:legislatura ${legislature};
       osr:legislatura ?legislatura;
       osr:ramo ?ramo;
       osr:numeroFase ?numeroFase;
       osr:titolo ?titolo;
       osr:statoDdl ?stato;
       osr:dataPresentazione ?dataPresentazione;
       osr:presentatoTrasmesso 'presentato'^^<http://www.w3.org/2001/XMLSchema#string>.
  OPTIONAL { ?ddl osr:natura ?natura. }
  OPTIONAL { ?ddl osr:dataStatoDdl ?dataStato. }
}
ORDER BY ?idFase
LIMIT ${limit}
OFFSET ${offset}
`.trim();
}

async function fetchDdlPage(legislature: string, pageSize: number, offset: number): Promise<SenatoDdlRow[]> {
  const rows = await querySparql(buildDdlPageQuery(legislature, pageSize, offset));
  return rows.map((row) => ({
    idFase: row.idFase ?? '',
    legislatura: row.legislatura ?? legislature,
    ramo: row.ramo ?? '',
    numeroFase: row.numeroFase ?? '',
    titolo: row.titolo ?? '',
    natura: row.natura ?? null,
    stato: row.stato ?? '',
    dataStato: row.dataStato ?? null,
    dataPresentazione: row.dataPresentazione ?? '',
  }));
}

function buildSponsorsQuery(idFaseValues: string[]): string {
  const values = idFaseValues.map((value) => value.trim()).filter(Boolean).join(', ');
  return `
PREFIX osr: <http://dati.senato.it/osr/>
SELECT DISTINCT ?idFase ?presentatore
WHERE {
  ?ddl a osr:Ddl;
       osr:idFase ?idFase;
       osr:iniziativa ?iniziativa.
  ?iniziativa osr:presentatore ?presentatore.
  FILTER(?idFase IN (${values}))
}
ORDER BY ?idFase
`.trim();
}

async function fetchPresentersByIdFase(idFaseValues: string[]): Promise<Map<string, string[]>> {
  const presentersById = new Map<string, string[]>();
  if (idFaseValues.length === 0) return presentersById;

  for (let index = 0; index < idFaseValues.length; index += SPONSOR_BATCH_SIZE) {
    const batch = idFaseValues.slice(index, index + SPONSOR_BATCH_SIZE);
    const rows = await querySparql(buildSponsorsQuery(batch));
    for (const row of rows) {
      const idFase = (row.idFase ?? '').trim();
      const presenter = (row.presentatore ?? '').trim();
      if (!idFase || !presenter) continue;
      const existing = presentersById.get(idFase) ?? [];
      existing.push(presenter);
      presentersById.set(idFase, existing);
    }
  }
  return presentersById;
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
  const scannedLegislatures: string[] = [];

  try {
    for (const legislature of args.legislatures) {
      scannedLegislatures.push(legislature);
      for (let pageIndex = 0; ; pageIndex += 1) {
        if (args.maxPagesPerLegislature && pageIndex >= args.maxPagesPerLegislature) break;
        const offset = pageIndex * args.pageSize;
        const rows = await fetchDdlPage(legislature, args.pageSize, offset);
        if (rows.length === 0) break;

        totalFetched += rows.length;
        const presentersById = await fetchPresentersByIdFase(rows.map((row) => row.idFase));
        const proposals = rows
          .map((row) => buildProposalFromSenatoDdlRow(row, presentersById.get(row.idFase) ?? []))
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

        if (rows.length < args.pageSize) break;
      }
    }

    if (args.apply) {
      await supabase.rpc('increment_total_records', { p_source_type: 'senato_ddl', p_delta: totalCreated + totalUpdated });
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
      legislatures: scannedLegislatures,
      pageSize: args.pageSize,
    }, null, 2));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await updateRunLog(supabase, runId, {
      status: 'failed',
      records_fetched: totalFetched,
      records_created: totalCreated,
      records_updated: totalUpdated,
      error_message: message,
    });
    throw error;
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
