#!/usr/bin/env node
// Seed canonical graph tables (entities, entity_aliases, relationships,
// claims) from existing domain tables. Idempotent.
//
// What it does:
//   1. Project every row in `politicians` into entities (kind='person')
//      with aliases (wikidata, ep_mep, twitter handle, normalized name).
//   2. Project every distinct country in `politicians.country_code` into
//      entities (kind='country') with ISO 3166 alpha-2 alias.
//   3. Project every distinct party (politicians.party_name) into entities
//      (kind='party') with normalized name alias.
//   4. Project every row in `proposals` into entities (kind='proposal')
//      with source_url alias.
//   5. Project every row in `lobby_organisations` into entities
//      (kind='lobby_org') with transparency_register alias.
//   6. Backfill `politicians.entity_id` and `proposals.entity_id`.
//   7. Build `relationships` rows from `politician_associations`,
//      `political_events` (vote, sponsored, committee_join), and
//      `lobby_meetings`.
//   8. Build `claims` rows from `politicians` scalar fields (party_name,
//      birth_year, in_office_since, twitter_handle).
//
// Usage:
//   node --experimental-strip-types scripts/seed-graph.ts [--apply] [--steps entities,relationships,claims]

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { createClient } from '@supabase/supabase-js';

type Args = { apply: boolean; steps: Set<string> };

const ALL_STEPS = ['entities', 'relationships', 'claims'] as const;

function parseArgs(argv: string[]): Args {
  const args: Args = { apply: false, steps: new Set(ALL_STEPS) };
  for (let i = 0; i < argv.length; i += 1) {
    const t = argv[i];
    if (t === '--apply') { args.apply = true; continue; }
    if (t === '--steps') {
      const next = argv[++i];
      if (!next) throw new Error('Missing value for --steps');
      args.steps = new Set(next.split(',').map((s) => s.trim()).filter(Boolean));
      continue;
    }
    if (t === '--help' || t === '-h') {
      console.log('scripts/seed-graph.ts [--apply] [--steps entities,relationships,claims]');
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

function slugify(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

async function fetchAllPages<T>(loader: (from: number, to: number) => Promise<T[]>, pageSize = 1000): Promise<T[]> {
  const all: T[] = [];
  let from = 0;
  while (true) {
    const chunk = await loader(from, from + pageSize - 1);
    all.push(...chunk);
    if (chunk.length < pageSize) break;
    from += pageSize;
  }
  return all;
}

async function chunkedUpsert<T>(
  supabase: ReturnType<typeof createClient>,
  table: string,
  rows: T[],
  options: { onConflict: string; ignoreDuplicates?: boolean } = { onConflict: 'id' },
  chunkSize = 500,
): Promise<{ upserted: number; errors: string[] }> {
  let upserted = 0;
  const errors: string[] = [];
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    const { data, error } = await supabase.from(table).upsert(chunk, options).select('id');
    if (error) { errors.push(error.message); continue; }
    upserted += (data as unknown[] | null)?.length ?? 0;
  }
  return { upserted, errors };
}

interface PoliticianSlim {
  id: string;
  name: string;
  country_code: string | null;
  country_name: string | null;
  party_name: string | null;
  party_abbreviation: string | null;
  external_id: string | null;
  twitter_handle: string | null;
  wikipedia_url: string | null;
  birth_year: number | null;
  in_office_since: string | null;
  data_source: string | null;
  source_url: string | null;
  wikipedia_data: { wikidata_id?: string | null } | null;
  entity_id: string | null;
}

interface ProposalSlim {
  id: string;
  title: string;
  status: string;
  proposal_type: string;
  jurisdiction: string;
  country_code: string | null;
  country_name: string | null;
  submitted_date: string;
  source_url: string | null;
  entity_id: string | null;
}

async function seedEntities(supabase: ReturnType<typeof createClient>, apply: boolean) {
  console.error('==> seedEntities');

  // Load all politicians.
  const politicians = await fetchAllPages<PoliticianSlim>(async (from, to) => {
    const { data, error } = await supabase
      .from('politicians')
      .select('id, name, country_code, country_name, party_name, party_abbreviation, external_id, twitter_handle, wikipedia_url, birth_year, in_office_since, data_source, source_url, wikipedia_data, entity_id')
      .order('id', { ascending: true })
      .range(from, to);
    if (error) throw error;
    return (data || []) as PoliticianSlim[];
  });
  console.error(`  loaded ${politicians.length} politicians`);

  // Project person entities.
  const personEntities = politicians.map((p) => {
    const summary = `${p.name}${p.country_name ? ` · ${p.country_name}` : ''}${p.party_name ? ` (${p.party_name})` : ''}`;
    return {
      kind: 'person' as const,
      canonical_name: p.name,
      slug: `${slugify(p.name)}-${p.id.slice(0, 8)}`,
      summary,
    };
  });

  // Distinct countries.
  const countryMap = new Map<string, { code: string; name: string }>();
  for (const p of politicians) {
    if (p.country_code && p.country_name) countryMap.set(p.country_code, { code: p.country_code, name: p.country_name });
  }
  const countryEntities = [...countryMap.values()].map((c) => ({
    kind: 'country' as const,
    canonical_name: c.name,
    slug: c.code.toLowerCase(),
    summary: `${c.name} (${c.code})`,
  }));

  // Distinct parties (scoped by country to avoid global collisions).
  const partyMap = new Map<string, { country: string; party: string; abbr: string | null }>();
  for (const p of politicians) {
    if (!p.party_name || !p.country_code) continue;
    const key = `${p.country_code}|${p.party_name}`;
    if (!partyMap.has(key)) partyMap.set(key, { country: p.country_code, party: p.party_name, abbr: p.party_abbreviation });
  }
  const partyEntities = [...partyMap.values()].map((p) => ({
    kind: 'party' as const,
    canonical_name: p.party,
    slug: `${p.country.toLowerCase()}-${slugify(p.abbr || p.party)}`,
    summary: `${p.party}${p.abbr && p.abbr !== p.party ? ` (${p.abbr})` : ''}, ${p.country}`,
  }));

  // Proposals.
  const proposals = await fetchAllPages<ProposalSlim>(async (from, to) => {
    const { data, error } = await supabase
      .from('proposals')
      .select('id, title, status, proposal_type, jurisdiction, country_code, country_name, submitted_date, source_url, entity_id')
      .order('id', { ascending: true })
      .range(from, to);
    if (error) throw error;
    return (data || []) as ProposalSlim[];
  });
  console.error(`  loaded ${proposals.length} proposals`);
  const proposalEntities = proposals.map((p) => ({
    kind: 'proposal' as const,
    canonical_name: p.title || 'Untitled proposal',
    slug: `proposal-${p.id.slice(0, 12)}`,
    summary: `${(p.title || 'Untitled').slice(0, 200)}${p.country_code ? ` · ${p.country_code}` : ''}`,
  }));

  // Lobby organisations.
  const lobbyOrgs = await fetchAllPages<{ id: string; name: string; transparency_id: string; category: string | null; country_of_hq: string | null }>(async (from, to) => {
    const { data, error } = await supabase
      .from('lobby_organisations')
      .select('id, name, transparency_id, category, country_of_hq')
      .order('id', { ascending: true })
      .range(from, to);
    if (error) throw error;
    return (data || []) as { id: string; name: string; transparency_id: string; category: string | null; country_of_hq: string | null }[];
  });
  console.error(`  loaded ${lobbyOrgs.length} lobby orgs`);
  const lobbyEntities = lobbyOrgs.map((o) => ({
    kind: 'lobby_org' as const,
    canonical_name: o.name,
    slug: `lobby-${slugify(o.name).slice(0, 60)}-${o.transparency_id.slice(0, 12)}`,
    summary: [o.category, o.country_of_hq].filter(Boolean).join(' · '),
  }));

  const allEntities = [...personEntities, ...countryEntities, ...partyEntities, ...proposalEntities, ...lobbyEntities];
  const dedupedEntities = new Map<string, (typeof allEntities)[number]>();
  let duplicateEntitySeeds = 0;
  for (const entity of allEntities) {
    const key = `${entity.kind}|${entity.slug}`;
    if (dedupedEntities.has(key)) duplicateEntitySeeds += 1;
    dedupedEntities.set(key, entity);
  }
  console.error(`  total entities to upsert: ${allEntities.length} (${duplicateEntitySeeds} duplicate kind+slug seeds collapsed)`);

  if (!apply) {
    return { entities: allEntities.length, aliases: 0, backfilled: 0 };
  }

  const { upserted, errors } = await chunkedUpsert(supabase, 'entities', [...dedupedEntities.values()], { onConflict: 'kind,slug' });
  console.error(`  entities upserted: ${upserted}, errors: ${errors.length}${errors[0] ? ` (first: ${errors[0]})` : ''}`);

  // Now read back the entities with their ids so we can build aliases and
  // backfill FKs. Paginate explicitly to bypass Supabase's default 1000-row
  // cap, otherwise we'd only see the first page of entities.
  const storedEntities = await fetchAllPages<{ id: string; kind: string; slug: string }>(async (from, to) => {
    const { data, error } = await supabase
      .from('entities')
      .select('id, kind, slug')
      .order('id', { ascending: true })
      .range(from, to);
    if (error) throw error;
    return (data || []) as { id: string; kind: string; slug: string }[];
  });
  const entityByKindSlug = new Map<string, string>();
  for (const e of storedEntities) {
    entityByKindSlug.set(`${e.kind}|${e.slug}`, e.id);
  }
  console.error(`  re-read ${entityByKindSlug.size} entities`);

  // Build aliases.
  const aliases: Array<{ entity_id: string; scheme: string; value: string; source: string | null; trust_level: number }> = [];

  for (const p of politicians) {
    const entityId = entityByKindSlug.get(`person|${slugify(p.name)}-${p.id.slice(0, 8)}`);
    if (!entityId) continue;
    if (p.external_id) aliases.push({ entity_id: entityId, scheme: p.data_source === 'eu_parliament' ? 'ep_mep' : 'external_id', value: p.external_id, source: p.data_source, trust_level: 1 });
    if (p.wikipedia_data?.wikidata_id) aliases.push({ entity_id: entityId, scheme: 'wikidata', value: p.wikipedia_data.wikidata_id, source: 'wikipedia', trust_level: 2 });
    if (p.twitter_handle) aliases.push({ entity_id: entityId, scheme: 'twitter_handle', value: p.twitter_handle.replace(/^@/, '').toLowerCase(), source: 'wikipedia', trust_level: 3 });
    aliases.push({ entity_id: entityId, scheme: 'name', value: p.name.toLowerCase(), source: 'projection', trust_level: 4 });
  }

  for (const c of countryMap.values()) {
    const entityId = entityByKindSlug.get(`country|${c.code.toLowerCase()}`);
    if (entityId) {
      aliases.push({ entity_id: entityId, scheme: 'iso3166_1_a2', value: c.code, source: 'projection', trust_level: 1 });
      aliases.push({ entity_id: entityId, scheme: 'name', value: c.name.toLowerCase(), source: 'projection', trust_level: 4 });
    }
  }

  for (const o of lobbyOrgs) {
    const entityId = entityByKindSlug.get(`lobby_org|lobby-${slugify(o.name).slice(0, 60)}-${o.transparency_id.slice(0, 12)}`);
    if (entityId) {
      aliases.push({ entity_id: entityId, scheme: 'transparency_register', value: o.transparency_id, source: 'lobbyfacts', trust_level: 1 });
      aliases.push({ entity_id: entityId, scheme: 'name', value: o.name.toLowerCase(), source: 'projection', trust_level: 4 });
    }
  }

  console.error(`  upserting ${aliases.length} aliases`);
  const aliasResult = await chunkedUpsert(supabase, 'entity_aliases', aliases, { onConflict: 'scheme,value', ignoreDuplicates: true });
  console.error(`  aliases upserted: ${aliasResult.upserted}, errors: ${aliasResult.errors.length}${aliasResult.errors[0] ? ` (first: ${aliasResult.errors[0]})` : ''}`);

  // Backfill politicians.entity_id and proposals.entity_id.
  const politicianBackfills: Array<Pick<PoliticianSlim, 'id' | 'name' | 'country_code' | 'country_name'> & { entity_id: string }> = [];
  for (const p of politicians) {
    if (p.entity_id) continue;
    const entityId = entityByKindSlug.get(`person|${slugify(p.name)}-${p.id.slice(0, 8)}`);
    if (!entityId) continue;
    politicianBackfills.push({
      id: p.id,
      name: p.name,
      country_code: p.country_code,
      country_name: p.country_name,
      entity_id: entityId,
    });
  }
  const proposalBackfills: Array<Pick<ProposalSlim, 'id' | 'title' | 'status' | 'proposal_type' | 'jurisdiction' | 'submitted_date'> & {
    country_code: string;
    country_name: string;
    entity_id: string;
  }> = [];
  for (const p of proposals) {
    if (p.entity_id) continue;
    const entityId = entityByKindSlug.get(`proposal|proposal-${p.id.slice(0, 12)}`);
    if (!entityId) continue;
    proposalBackfills.push({
      id: p.id,
      title: p.title,
      status: p.status,
      proposal_type: p.proposal_type,
      jurisdiction: p.jurisdiction,
      country_code: p.country_code || 'EU',
      country_name: p.country_name || 'European Union',
      submitted_date: p.submitted_date,
      entity_id: entityId,
    });
  }
  const politicianBackfillResult = await chunkedUpsert(
    supabase,
    'politicians',
    politicianBackfills,
    { onConflict: 'id' },
  );
  const proposalBackfillResult = await chunkedUpsert(
    supabase,
    'proposals',
    proposalBackfills,
    { onConflict: 'id' },
  );
  const backfilled = politicianBackfillResult.upserted + proposalBackfillResult.upserted;
  if (politicianBackfillResult.errors[0]) {
    console.error(`  politicians backfill errors: ${politicianBackfillResult.errors.length} (first: ${politicianBackfillResult.errors[0]})`);
  }
  if (proposalBackfillResult.errors[0]) {
    console.error(`  proposals backfill errors: ${proposalBackfillResult.errors.length} (first: ${proposalBackfillResult.errors[0]})`);
  }
  console.error(`  backfilled entity_id on ${backfilled} rows`);

  return { entities: upserted, aliases: aliasResult.upserted, backfilled };
}

async function seedRelationships(supabase: ReturnType<typeof createClient>, apply: boolean) {
  console.error('==> seedRelationships');
  if (!apply) {
    console.error('  dry-run: would project politician_associations + lobby_meetings into relationships');
    return { upserted: 0 };
  }

  // Build entity_id lookups (paginated to avoid the 1000-row cap).
  const politicians = await fetchAllPages<{ id: string; entity_id: string }>(async (from, to) => {
    const { data, error } = await supabase
      .from('politicians')
      .select('id, entity_id')
      .not('entity_id', 'is', null)
      .order('id', { ascending: true })
      .range(from, to);
    if (error) throw error;
    return (data || []) as { id: string; entity_id: string }[];
  });
  const polToEntity = new Map<string, string>();
  for (const p of politicians) polToEntity.set(p.id, p.entity_id);

  // Project politician_associations → relationships (paginated).
  const assocs = await fetchAllPages<{ politician_id: string; associate_id: string; relationship_type: string; strength: number | null; context: string | null; is_domestic: boolean | null }>(async (from, to) => {
    const { data, error } = await supabase
      .from('politician_associations')
      .select('politician_id, associate_id, relationship_type, strength, context, is_domestic')
      .order('id', { ascending: true })
      .range(from, to);
    if (error) throw error;
    return (data || []) as Array<{ politician_id: string; associate_id: string; relationship_type: string; strength: number | null; context: string | null; is_domestic: boolean | null }>;
  });
  const relationshipRows: Array<Record<string, unknown>> = [];
  for (const a of assocs) {
    const subjectId = polToEntity.get(a.politician_id);
    const objectId = polToEntity.get(a.associate_id);
    if (!subjectId || !objectId || subjectId === objectId) continue;
    relationshipRows.push({
      subject_id: subjectId,
      predicate: a.relationship_type,
      object_id: objectId,
      strength: a.strength,
      context: a.context,
      data_source: 'projection',
      trust_level: 2,
    });
  }
  console.error(`  built ${relationshipRows.length} relationships from politician_associations`);

  // Project lobby_meetings → met_with relationships.
  const { data: meetings } = await supabase
    .from('lobby_meetings')
    .select('politician_id, lobby_id, meeting_date, subject');
  for (const m of (meetings || []) as Array<{ politician_id: string | null; lobby_id: string | null; meeting_date: string; subject: string | null }>) {
    if (!m.politician_id || !m.lobby_id) continue;
    const subjectId = polToEntity.get(m.politician_id);
    if (!subjectId) continue;
    // For lobby_id we need to look up the lobby_org's entity_id. We'll do it
    // via a join here for simplicity.
    const { data: orgRow } = await supabase
      .from('lobby_organisations')
      .select('name, transparency_id')
      .eq('id', m.lobby_id)
      .maybeSingle();
    if (!orgRow) continue;
    const lobbySlug = `lobby-${slugify((orgRow as { name: string }).name).slice(0, 60)}-${(orgRow as { transparency_id: string }).transparency_id.slice(0, 12)}`;
    const { data: lobbyEntity } = await supabase
      .from('entities')
      .select('id')
      .eq('kind', 'lobby_org')
      .eq('slug', lobbySlug)
      .maybeSingle();
    if (!lobbyEntity) continue;
    relationshipRows.push({
      subject_id: subjectId,
      predicate: 'met_with',
      object_id: (lobbyEntity as { id: string }).id,
      valid_from: `${m.meeting_date}T00:00:00Z`,
      valid_to: `${m.meeting_date}T23:59:59Z`,
      context: m.subject,
      data_source: 'transparency_register',
      trust_level: 1,
    });
  }
  console.error(`  built ${relationshipRows.length} total relationships`);

  const { upserted, errors } = await chunkedUpsert(supabase, 'relationships', relationshipRows, {
    onConflict: 'subject_id,predicate,object_id,valid_from',
    ignoreDuplicates: true,
  });
  console.error(`  relationships upserted: ${upserted}, errors: ${errors.length}`);
  return { upserted };
}

async function seedClaims(supabase: ReturnType<typeof createClient>, apply: boolean) {
  console.error('==> seedClaims');
  if (!apply) {
    console.error('  dry-run: would project politicians scalar fields into claims');
    return { upserted: 0 };
  }

  const politicians = await fetchAllPages<PoliticianSlim>(async (from, to) => {
    const { data, error } = await supabase
      .from('politicians')
      .select('id, name, country_code, country_name, party_name, party_abbreviation, external_id, twitter_handle, wikipedia_url, birth_year, in_office_since, data_source, source_url, wikipedia_data, entity_id')
      .not('entity_id', 'is', null)
      .order('id', { ascending: true })
      .range(from, to);
    if (error) throw error;
    return (data || []) as PoliticianSlim[];
  });

  const claims: Array<Record<string, unknown>> = [];
  for (const p of politicians) {
    if (!p.entity_id) continue;
    const baseSource = p.data_source || 'projection';
    if (p.party_name) {
      claims.push({
        entity_id: p.entity_id,
        key: 'party',
        value: { s: p.party_name },
        value_type: 'string',
        valid_from: p.in_office_since ? `${p.in_office_since}T00:00:00Z` : null,
        valid_to: null,
        data_source: baseSource,
        source_url: p.source_url,
        trust_level: 1,
      });
    }
    if (p.birth_year) {
      claims.push({
        entity_id: p.entity_id,
        key: 'birth_year',
        value: { n: p.birth_year },
        value_type: 'number',
        valid_from: null,
        valid_to: null,
        data_source: baseSource,
        source_url: p.source_url,
        trust_level: 2,
      });
    }
    if (p.in_office_since) {
      claims.push({
        entity_id: p.entity_id,
        key: 'in_office_since',
        value: { d: p.in_office_since },
        value_type: 'date',
        valid_from: `${p.in_office_since}T00:00:00Z`,
        valid_to: null,
        data_source: baseSource,
        source_url: p.source_url,
        trust_level: 1,
      });
    }
    if (p.twitter_handle) {
      claims.push({
        entity_id: p.entity_id,
        key: 'twitter_handle',
        value: { s: p.twitter_handle.replace(/^@/, '') },
        value_type: 'string',
        valid_from: null,
        valid_to: null,
        data_source: 'wikipedia',
        source_url: p.wikipedia_url,
        trust_level: 3,
      });
    }
  }
  console.error(`  built ${claims.length} claims`);

  const { upserted, errors } = await chunkedUpsert(supabase, 'claims', claims, {
    onConflict: 'entity_id,key,valid_from,data_source',
    ignoreDuplicates: true,
  });
  console.error(`  claims upserted: ${upserted}, errors: ${errors.length}`);
  return { upserted };
}

async function main() {
  loadLocalEnv();
  const args = parseArgs(process.argv.slice(2));
  const supabase = getSupabaseClient(args.apply);

  const summary: Record<string, unknown> = { apply: args.apply };
  if (args.steps.has('entities')) summary.entities = await seedEntities(supabase, args.apply);
  if (args.steps.has('relationships')) summary.relationships = await seedRelationships(supabase, args.apply);
  if (args.steps.has('claims')) summary.claims = await seedClaims(supabase, args.apply);
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((err) => { console.error(err); process.exit(1); });
