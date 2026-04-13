import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { createClient } from '@supabase/supabase-js';
import { buildEstimatedPoliticalPosition, type PoliticalPositionLike } from '../src/lib/political-positioning.ts';

const DEFAULT_BATCH_SIZE = 250;
const REPAIRABLE_SOURCES = new Set([
  'party_family_mapping',
  'party_mapping',
  'party_profile_estimate',
  'unclassified_party_profile',
  null,
  undefined,
  '',
]);

const POSITION_FIELDS = [
  'economic_score',
  'social_score',
  'eu_integration_score',
  'environmental_score',
  'immigration_score',
  'education_priority',
  'science_priority',
  'healthcare_priority',
  'defense_priority',
  'economy_priority',
  'justice_priority',
  'social_welfare_priority',
  'environment_priority',
  'ideology_label',
  'key_positions',
  'data_source',
] as const;

type PositionField = (typeof POSITION_FIELDS)[number];

type PoliticianRow = {
  id: string;
  name: string | null;
  party_name: string | null;
  party_abbreviation: string | null;
  country_code: string | null;
};

type ExistingPositionRow = PoliticalPositionLike & {
  politician_id: string;
};

type PlannedMutation = {
  politician: PoliticianRow;
  existing: ExistingPositionRow | null;
  desired: ExistingPositionRow;
  action: 'insert' | 'update';
  changedFields: PositionField[];
};

type Args = {
  apply: boolean;
  batchSize: number;
  expectProjectRef: string | null;
  limit: number | null;
  overwriteAll: boolean;
};

function parseArgs(argv: string[]): Args {
  const args: Args = {
    apply: false,
    batchSize: DEFAULT_BATCH_SIZE,
    expectProjectRef: null,
    limit: null,
    overwriteAll: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];

    if (token === '--apply') {
      args.apply = true;
      continue;
    }

    if (token === '--overwrite-all') {
      args.overwriteAll = true;
      continue;
    }

    if (token === '--batch-size') {
      const next = argv[index + 1];
      if (!next) throw new Error('Missing value for --batch-size');
      const parsed = Number.parseInt(next, 10);
      if (!Number.isInteger(parsed) || parsed <= 0) {
        throw new Error(`Invalid --batch-size value: ${next}`);
      }
      args.batchSize = parsed;
      index += 1;
      continue;
    }

    if (token === '--expect-project-ref') {
      const next = argv[index + 1];
      if (!next) throw new Error('Missing value for --expect-project-ref');
      args.expectProjectRef = next.trim();
      index += 1;
      continue;
    }

    if (token === '--limit') {
      const next = argv[index + 1];
      if (!next) throw new Error('Missing value for --limit');
      const parsed = Number.parseInt(next, 10);
      if (!Number.isInteger(parsed) || parsed <= 0) {
        throw new Error(`Invalid --limit value: ${next}`);
      }
      args.limit = parsed;
      index += 1;
      continue;
    }

    if (token === '--help' || token === '-h') {
      printHelp();
      process.exit(0);
    }

    throw new Error(`Unknown argument: ${token}`);
  }

  return args;
}

function printHelp() {
  console.log(`Usage:
  node --experimental-strip-types scripts/backfill-politician-positions.ts [--apply] [--batch-size N] [--limit N] [--overwrite-all]

Behavior:
  Dry-run is the default. It inspects the configured Supabase project and reports the rows that would change.
  --apply writes the planned inserts/updates using SUPABASE_SERVICE_ROLE_KEY.
  By default, only missing rows and generated placeholder rows are updated.
  --overwrite-all also rewrites rows from non-placeholder sources.
  --expect-project-ref fails fast if the resolved project ref does not match.

Environment:
  Reads SUPABASE_URL or VITE_SUPABASE_URL.
  Reads SUPABASE_SERVICE_ROLE_KEY only when --apply is supplied.
  Reads VITE_SUPABASE_PUBLISHABLE_KEY for dry-run access when no service-role key is present.
`);
}

function loadEnvFile(filePath: string, shellEnvKeys: Set<string>, overwrite = false) {
  if (!fs.existsSync(filePath)) return;

  const content = fs.readFileSync(filePath, 'utf8');
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;

    const separatorIndex = line.indexOf('=');
    if (separatorIndex === -1) continue;

    const key = line.slice(0, separatorIndex).trim();
    let value = line.slice(separatorIndex + 1).trim();
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

function getRequiredEnv(key: string) {
  const value = process.env[key];
  if (!value) {
    if (key === 'SUPABASE_SERVICE_ROLE_KEY') {
      throw new Error(
        'Missing SUPABASE_SERVICE_ROLE_KEY. Export the service-role key from the target Supabase project API settings, then rerun with --apply.',
      );
    }
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

function getSupabaseClient(apply: boolean) {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  if (!url) throw new Error('Missing SUPABASE_URL or VITE_SUPABASE_URL');

  const key = apply
    ? getRequiredEnv('SUPABASE_SERVICE_ROLE_KEY')
    : process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY;

  if (!key) {
    throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY for apply or VITE_SUPABASE_PUBLISHABLE_KEY for dry-run');
  }

  return createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

function parseProjectRef(url: string) {
  try {
    const hostname = new URL(url).hostname;
    return hostname.split('.')[0] || null;
  } catch {
    return null;
  }
}

function buildUnclassifiedPositionRow(politicianId: string): ExistingPositionRow {
  return {
    politician_id: politicianId,
    economic_score: null,
    social_score: null,
    eu_integration_score: null,
    environmental_score: null,
    immigration_score: null,
    education_priority: null,
    science_priority: null,
    healthcare_priority: null,
    defense_priority: null,
    economy_priority: null,
    justice_priority: null,
    social_welfare_priority: null,
    environment_priority: null,
    ideology_label: 'Unclassified',
    key_positions: {},
    data_source: 'unclassified_party_profile',
  };
}

function normalizeJson(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return '{}';
  const entries = Object.entries(value as Record<string, unknown>).sort(([left], [right]) => left.localeCompare(right));
  return JSON.stringify(Object.fromEntries(entries));
}

function normalizeValue(field: PositionField, value: unknown) {
  if (field === 'key_positions') return normalizeJson(value);
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (value === undefined) return null;
  if (value === '') return null;
  return value ?? null;
}

function diffPositionFields(existing: ExistingPositionRow | null, desired: ExistingPositionRow) {
  const changedFields: PositionField[] = [];

  for (const field of POSITION_FIELDS) {
    const existingValue = normalizeValue(field, existing?.[field]);
    const desiredValue = normalizeValue(field, desired[field]);
    if (existingValue !== desiredValue) {
      changedFields.push(field);
    }
  }

  return changedFields;
}

function isRepairable(existing: ExistingPositionRow | null, overwriteAll: boolean) {
  if (!existing) return true;
  if (overwriteAll) return true;
  return REPAIRABLE_SOURCES.has(existing.data_source);
}

async function fetchPoliticians(
  client: ReturnType<typeof createClient>,
  offset: number,
  batchSize: number,
) {
  const { data, error } = await client
    .from('politicians')
    .select('id, name, party_name, party_abbreviation, country_code')
    .order('id', { ascending: true })
    .range(offset, offset + batchSize - 1);

  if (error) throw error;
  return (data ?? []) as PoliticianRow[];
}

async function fetchExistingPositions(
  client: ReturnType<typeof createClient>,
  politicianIds: string[],
) {
  if (politicianIds.length === 0) return new Map<string, ExistingPositionRow>();

  const { data, error } = await client
    .from('politician_positions')
    .select(`politician_id, ${POSITION_FIELDS.join(', ')}`)
    .in('politician_id', politicianIds);

  if (error) throw error;

  return new Map<string, ExistingPositionRow>(
    ((data ?? []) as ExistingPositionRow[]).map((row) => [row.politician_id, row]),
  );
}

function buildDesiredPosition(politician: PoliticianRow): ExistingPositionRow {
  const estimate = buildEstimatedPoliticalPosition(
    politician.party_name,
    politician.party_abbreviation,
    politician.country_code,
  );

  return estimate
    ? {
        politician_id: politician.id,
        ...estimate,
      }
    : buildUnclassifiedPositionRow(politician.id);
}

async function upsertMutations(
  client: ReturnType<typeof createClient>,
  mutations: PlannedMutation[],
  batchSize: number,
) {
  for (let offset = 0; offset < mutations.length; offset += batchSize) {
    const chunk = mutations.slice(offset, offset + batchSize).map((mutation) => mutation.desired);
    const { error } = await client
      .from('politician_positions')
      .upsert(chunk, { onConflict: 'politician_id' });

    if (error) throw error;
  }
}

async function main() {
  loadLocalEnv();
  const args = parseArgs(process.argv.slice(2));
  const targetUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  if (!targetUrl) throw new Error('Missing SUPABASE_URL or VITE_SUPABASE_URL');

  const targetProjectRef = parseProjectRef(targetUrl);
  const configuredProjectRef = args.expectProjectRef || process.env.VITE_SUPABASE_PROJECT_ID || null;
  if (configuredProjectRef && targetProjectRef && configuredProjectRef !== targetProjectRef) {
    throw new Error(
      `Target project mismatch: resolved ${targetProjectRef} from URL but expected ${configuredProjectRef}`,
    );
  }

  const client = getSupabaseClient(args.apply);

  const summary = {
    mode: args.apply ? 'apply' : 'dry-run',
    batchSize: args.batchSize,
    targetProjectRef,
    targetUrl,
    totalPoliticiansScanned: 0,
    existingRows: 0,
    missingRows: 0,
    repairableRows: 0,
    protectedRows: 0,
    plannedInserts: 0,
    plannedUpdates: 0,
    unchangedRepairableRows: 0,
    skippedProtectedRows: 0,
    appliedInserts: 0,
    appliedUpdates: 0,
    changedBySource: {} as Record<string, number>,
    sampleChanges: [] as Array<{
      politician: string;
      party: string | null;
      country: string | null;
      action: 'insert' | 'update';
      existingIdeology: string | null;
      desiredIdeology: string | null;
      existingSource: string | null;
      desiredSource: string | null;
      changedFields: PositionField[];
    }>,
  };

  const plannedMutations: PlannedMutation[] = [];

  for (let offset = 0; ; offset += args.batchSize) {
    const politicians = await fetchPoliticians(client, offset, args.batchSize);
    if (politicians.length === 0) break;

    const limitedBatch = args.limit === null
      ? politicians
      : politicians.slice(0, Math.max(args.limit - summary.totalPoliticiansScanned, 0));

    if (limitedBatch.length === 0) break;

    const existingByPoliticianId = await fetchExistingPositions(
      client,
      limitedBatch.map((politician) => politician.id),
    );

    for (const politician of limitedBatch) {
      summary.totalPoliticiansScanned += 1;

      const existing = existingByPoliticianId.get(politician.id) ?? null;
      const desired = buildDesiredPosition(politician);
      const changedFields = diffPositionFields(existing, desired);
      const repairable = isRepairable(existing, args.overwriteAll);

      if (existing) summary.existingRows += 1;
      else summary.missingRows += 1;

      if (repairable) summary.repairableRows += 1;
      else summary.protectedRows += 1;

      if (!repairable) {
        summary.skippedProtectedRows += 1;
        continue;
      }

      if (changedFields.length === 0) {
        summary.unchangedRepairableRows += 1;
        continue;
      }

      const action = existing ? 'update' : 'insert';
      if (action === 'insert') summary.plannedInserts += 1;
      else summary.plannedUpdates += 1;

      const sourceKey = desired.data_source || 'null';
      summary.changedBySource[sourceKey] = (summary.changedBySource[sourceKey] ?? 0) + 1;

      if (summary.sampleChanges.length < 8) {
        summary.sampleChanges.push({
          politician: politician.name || politician.id,
          party: politician.party_name || politician.party_abbreviation,
          country: politician.country_code,
          action,
          existingIdeology: existing?.ideology_label || null,
          desiredIdeology: desired.ideology_label || null,
          existingSource: existing?.data_source || null,
          desiredSource: desired.data_source || null,
          changedFields,
        });
      }

      plannedMutations.push({
        politician,
        existing,
        desired,
        action,
        changedFields,
      });
    }

    if (args.limit !== null && summary.totalPoliticiansScanned >= args.limit) {
      break;
    }
  }

  if (args.apply && plannedMutations.length > 0) {
    await upsertMutations(client, plannedMutations, args.batchSize);
    summary.appliedInserts = plannedMutations.filter((mutation) => mutation.action === 'insert').length;
    summary.appliedUpdates = plannedMutations.filter((mutation) => mutation.action === 'update').length;
  }

  console.log(JSON.stringify(summary, null, 2));
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exit(1);
});
