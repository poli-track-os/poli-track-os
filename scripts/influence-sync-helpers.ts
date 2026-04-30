import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { createClient } from '@supabase/supabase-js';
import {
  companyExternalKey,
  normalizeInfluenceName,
  type CompanyInput,
  type InfluenceActorInput,
  type InfluenceBundle,
  type InfluenceClientInput,
  type InfluenceContactInput,
  type InfluenceFilingInput,
  type InfluenceMoneyInput,
  type PublicAffiliationInput,
} from '../src/lib/influence-ingest.ts';

export type SyncArgs = {
  apply: boolean;
  input: string | null;
  url: string | null;
  limit: number | null;
};

export function parseCommonArgs(argv: string[], defaults: Partial<SyncArgs> = {}): SyncArgs {
  const args: SyncArgs = {
    apply: false,
    input: null,
    url: null,
    limit: null,
    ...defaults,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === '--apply') {
      args.apply = true;
      continue;
    }
    if (token === '--input') {
      args.input = argv[++i] || null;
      if (!args.input) throw new Error('Missing value for --input');
      continue;
    }
    if (token === '--url') {
      args.url = argv[++i] || null;
      if (!args.url) throw new Error('Missing value for --url');
      continue;
    }
    if (token === '--limit') {
      const raw = argv[++i];
      if (!raw) throw new Error('Missing value for --limit');
      args.limit = raw === 'all' ? null : Number.parseInt(raw, 10);
      continue;
    }
    if (token === '--help' || token === '-h') {
      console.log('Options: [--apply] [--input path] [--url https://...] [--limit N|all]');
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
    const sep = line.indexOf('=');
    if (sep === -1) continue;
    const key = line.slice(0, sep).trim();
    let value = line.slice(sep + 1).trim();
    if (!key) continue;
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    if (shellEnvKeys.has(key)) continue;
    if (!overwrite && process.env[key]) continue;
    process.env[key] = value;
  }
}

export function loadLocalEnv() {
  const root = process.cwd();
  const shellEnvKeys = new Set(Object.keys(process.env));
  loadEnvFile(path.join(root, '.env'), shellEnvKeys);
  loadEnvFile(path.join(root, '.env.local'), shellEnvKeys, true);
}

export function getSupabaseClient(apply: boolean) {
  loadLocalEnv();
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  if (!url) throw new Error('Missing SUPABASE_URL or VITE_SUPABASE_URL');
  const key = apply
    ? process.env.SUPABASE_SERVICE_ROLE_KEY
    : process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  if (!key) throw new Error('Missing Supabase credentials');
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export async function readInput(args: SyncArgs, userAgent: string): Promise<string> {
  if (args.input) return fs.readFileSync(args.input, 'utf8');
  if (!args.url) throw new Error('Use --input or --url. Live default downloads are intentionally not guessed.');
  const res = await fetch(args.url, {
    headers: { 'User-Agent': userAgent },
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${args.url}`);
  return res.text();
}

export function limitBundle(bundle: InfluenceBundle, limit: number | null): InfluenceBundle {
  if (!limit) return bundle;
  return {
    actors: bundle.actors.slice(0, limit),
    companies: bundle.companies.slice(0, limit),
    officers: bundle.officers.slice(0, limit),
    ownership: bundle.ownership.slice(0, limit),
    clients: bundle.clients.slice(0, limit),
    filings: bundle.filings.slice(0, limit),
    contacts: bundle.contacts.slice(0, limit),
    money: bundle.money.slice(0, limit),
    affiliations: bundle.affiliations.slice(0, limit),
  };
}

export function summarizeBundle(bundle: InfluenceBundle) {
  return {
    actors: bundle.actors.length,
    companies: bundle.companies.length,
    officers: bundle.officers.length,
    ownership: bundle.ownership.length,
    clients: bundle.clients.length,
    filings: bundle.filings.length,
    contacts: bundle.contacts.length,
    money: bundle.money.length,
    affiliations: bundle.affiliations.length,
  };
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map((item) => stableStringify(item)).join(',')}]`;
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, entryValue]) => entryValue !== undefined)
      .sort(([left], [right]) => left.localeCompare(right));
    return `{${entries.map(([key, entryValue]) => `${JSON.stringify(key)}:${stableStringify(entryValue)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function stableHash(value: unknown): string {
  const text = stableStringify(value);
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = (hash + ((hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24))) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

function actorRow(row: InfluenceActorInput) {
  const external_id = row.external_id || `${row.data_source}:${normalizeInfluenceName(row.name)}`;
  return {
    ...row,
    external_id,
    normalized_name: normalizeInfluenceName(row.name),
    is_pep: Boolean(row.is_pep),
    is_state_linked: Boolean(row.is_state_linked),
    raw_data: row.raw_data || {},
    trust_level: row.trust_level ?? 2,
  };
}

function clientRow(row: InfluenceClientInput) {
  const external_client_id = row.external_client_id || `${row.data_source}:${normalizeInfluenceName(row.name)}`;
  return {
    ...row,
    external_client_id,
    normalized_name: normalizeInfluenceName(row.name),
    client_kind: row.client_kind || 'organisation',
    is_foreign_principal: Boolean(row.is_foreign_principal),
    raw_data: row.raw_data || {},
    trust_level: row.trust_level ?? 2,
  };
}

function companyRow(row: CompanyInput) {
  return {
    ...row,
    normalized_name: normalizeInfluenceName(row.name),
    dedupe_key: row.company_number || normalizeInfluenceName(row.name),
    raw_data: row.raw_data || {},
  };
}

async function upsertRows<T extends Record<string, unknown>>(
  supabase: ReturnType<typeof createClient>,
  table: string,
  rows: T[],
  onConflict: string,
) {
  if (rows.length === 0) return [] as T[];
  const conflictFields = onConflict.split(',').map((field) => field.trim()).filter(Boolean);
  const uniqueRows = [...rows.reduce((acc, row) => {
    const key = conflictFields.map((field) => String(row[field] ?? '')).join('\u0000');
    acc.set(key, row);
    return acc;
  }, new Map<string, T>()).values()];
  const { data, error } = await supabase
    .from(table)
    .upsert(uniqueRows, { onConflict })
    .select('*');
  if (error) throw error;
  return (data || []) as T[];
}

export async function applyInfluenceBundle(
  supabase: ReturnType<typeof createClient>,
  bundle: InfluenceBundle,
) {
  const actorRows = bundle.actors.map(actorRow);
  const actors = await upsertRows(supabase, 'influence_actors', actorRows, 'data_source,external_id');
  const actorByExternal = new Map<string, string>();
  for (const actor of actors as Array<{ id: string; external_id: string | null }>) {
    if (actor.external_id) actorByExternal.set(actor.external_id, actor.id);
  }

  const companyInputs = bundle.companies.map(companyRow);
  const companies = await upsertRows(supabase, 'companies', companyInputs, 'registry,jurisdiction_code,dedupe_key');
  const companyByKey = new Map<string, string>();
  for (const company of companies as Array<CompanyInput & { id: string }>) {
    companyByKey.set(companyExternalKey(company), company.id);
  }

  const clientRows = bundle.clients.map(clientRow);
  const clients = await upsertRows(supabase, 'influence_clients', clientRows, 'data_source,external_client_id');
  const clientByExternal = new Map<string, string>();
  for (const client of clients as Array<{ id: string; external_client_id: string | null }>) {
    if (client.external_client_id) clientByExternal.set(client.external_client_id, client.id);
  }

  const filings = await upsertRows(
    supabase,
    'influence_filings',
    bundle.filings.map((row: InfluenceFilingInput) => {
      const { registrant_actor_external_id, client_external_id, ...dbRow } = row;
      return {
        ...dbRow,
        registrant_actor_id: row.registrant_actor_external_id ? actorByExternal.get(row.registrant_actor_external_id) || null : null,
        client_id: row.client_external_id ? clientByExternal.get(row.client_external_id) || null : null,
        issue_areas: row.issue_areas || [],
        target_institutions: row.target_institutions || [],
        currency: row.currency || 'USD',
        raw_data: row.raw_data || {},
        trust_level: row.trust_level ?? 2,
      };
    }),
    'data_source,filing_id',
  );
  const filingByExternal = new Map<string, string>();
  for (const filing of filings as Array<{ id: string; filing_id: string }>) filingByExternal.set(filing.filing_id, filing.id);

  await upsertRows(
    supabase,
    'company_officers',
    bundle.officers
      .map((row) => {
        const { company_external_key, actor_external_id, ...dbRow } = row;
        return {
          ...dbRow,
          company_id: companyByKey.get(row.company_external_key),
          actor_id: row.actor_external_id ? actorByExternal.get(row.actor_external_id) || null : null,
          content_hash: stableHash(row),
          raw_data: row.raw_data || {},
        };
      })
      .filter((row) => row.company_id),
    'data_source,content_hash',
  );

  if (bundle.ownership.length > 0) {
    const ownershipRows = bundle.ownership
      .map((row) => {
        const { owned_company_external_key, owner_actor_external_id, owner_company_external_key, ...dbRow } = row;
        return {
          ...dbRow,
          owned_company_id: companyByKey.get(row.owned_company_external_key),
          owner_actor_id: row.owner_actor_external_id ? actorByExternal.get(row.owner_actor_external_id) || null : null,
          owner_company_id: row.owner_company_external_key ? companyByKey.get(row.owner_company_external_key) || null : null,
          content_hash: stableHash(row),
          raw_data: row.raw_data || {},
          trust_level: row.trust_level ?? 2,
        };
      })
      .filter((row) => row.owned_company_id && (row.owner_actor_id || row.owner_company_id));
    if (ownershipRows.length > 0) {
      await upsertRows(supabase, 'beneficial_ownership', ownershipRows, 'data_source,content_hash');
    }
  }

  await upsertRows(
    supabase,
    'influence_contacts',
    bundle.contacts.map((row: InfluenceContactInput) => {
      const { filing_external_id, lobby_actor_external_id, client_external_id, ...dbRow } = row;
      return {
        ...dbRow,
        filing_id: row.filing_external_id ? filingByExternal.get(row.filing_external_id) || null : null,
        lobby_actor_id: row.lobby_actor_external_id ? actorByExternal.get(row.lobby_actor_external_id) || null : null,
        client_id: row.client_external_id ? clientByExternal.get(row.client_external_id) || null : null,
        contact_type: row.contact_type || 'unknown',
        content_hash: stableHash(row),
        raw_data: row.raw_data || {},
        trust_level: row.trust_level ?? 2,
      };
    }),
    'data_source,content_hash',
  );

  await upsertRows(
    supabase,
    'influence_money',
    bundle.money.map((row: InfluenceMoneyInput) => {
      const { filing_external_id, payer_client_external_id, recipient_actor_external_id, recipient_company_external_key, ...dbRow } = row;
      return {
        ...dbRow,
        filing_id: row.filing_external_id ? filingByExternal.get(row.filing_external_id) || null : null,
        payer_client_id: row.payer_client_external_id ? clientByExternal.get(row.payer_client_external_id) || null : null,
        recipient_actor_id: row.recipient_actor_external_id ? actorByExternal.get(row.recipient_actor_external_id) || null : null,
        recipient_company_id: row.recipient_company_external_key ? companyByKey.get(row.recipient_company_external_key) || null : null,
        currency: row.currency || 'USD',
        content_hash: stableHash(row),
        raw_data: row.raw_data || {},
        trust_level: row.trust_level ?? 2,
      };
    }),
    'data_source,content_hash',
  );

  const affiliationRows = bundle.affiliations
    .map((row: PublicAffiliationInput) => {
      const { subject_actor_external_id, subject_name, ...dbRow } = row;
      return {
        ...dbRow,
        subject_actor_id: row.subject_actor_external_id ? actorByExternal.get(row.subject_actor_external_id) || null : null,
        review_status: row.review_status || 'pending',
        visible: Boolean(row.visible && row.review_status === 'approved'),
        content_hash: stableHash(row),
        raw_data: row.raw_data || {},
        trust_level: row.trust_level ?? 2,
      };
    })
    .filter((row) => row.subject_actor_id);
  await upsertRows(supabase, 'public_affiliations', affiliationRows, 'data_source,content_hash');

  return summarizeBundle(bundle);
}

export async function ensureRunLog(supabase: ReturnType<typeof createClient>, sourceType: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('scrape_runs')
    .insert({ source_type: sourceType, status: 'running' })
    .select('id')
    .single();
  if (error) {
    console.error('ensureRunLog failed:', error.message);
    return null;
  }
  return (data as { id: string }).id;
}

export async function updateRunLog(
  supabase: ReturnType<typeof createClient>,
  runId: string | null,
  payload: { status: 'completed' | 'failed'; records_fetched: number; records_created?: number; error_message?: string | null },
) {
  if (!runId) return;
  await supabase.from('scrape_runs').update({ ...payload, completed_at: new Date().toISOString() }).eq('id', runId);
}
