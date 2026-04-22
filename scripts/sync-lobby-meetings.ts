#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { createClient } from '@supabase/supabase-js';
import { parseLobbyfactsMeetingsCsv } from '../src/lib/lobbyfacts-helpers.ts';

const BASE = 'https://www.lobbyfacts.eu';
const USER_AGENT = 'poli-track lobby-meetings-sync (https://github.com/poli-track-os/poli-track-os)';

type Args = {
  apply: boolean;
  maxOrgs: number;
};

function parseArgs(argv: string[]): Args {
  const args: Args = { apply: false, maxOrgs: 200 };
  for (let i = 0; i < argv.length; i += 1) {
    const t = argv[i];
    if (t === '--apply') { args.apply = true; continue; }
    if (t === '--max-orgs') {
      const next = argv[++i];
      if (!next) throw new Error('Missing value for --max-orgs');
      args.maxOrgs = parseInt(next, 10);
      continue;
    }
    if (t === '--help' || t === '-h') {
      console.log('scripts/sync-lobby-meetings.ts [--apply] [--max-orgs 200]');
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

async function ensureRunLog(supabase: ReturnType<typeof createClient>): Promise<string | null> {
  const { data, error } = await supabase
    .from('scrape_runs')
    .insert({ source_type: 'lobbyfacts', status: 'running' })
    .select('id')
    .single();
  if (error) { console.error('ensureRunLog failed:', error.message); return null; }
  return (data as { id: string }).id;
}

async function updateRunLog(
  supabase: ReturnType<typeof createClient>,
  runId: string | null,
  payload: { status: 'completed' | 'failed'; records_fetched: number; records_created?: number; error_message?: string | null },
) {
  if (!runId) return;
  await supabase.from('scrape_runs').update({ ...payload, completed_at: new Date().toISOString() }).eq('id', runId);
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function normalizeName(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseAttendingPersonNames(attending: string | null): string[] {
  if (!attending) return [];
  const names = attending
    .split(/[;,]/)
    .map((part) => part.replace(/\([^)]*\)/g, '').trim())
    .filter(Boolean);
  return [...new Set(names)];
}

function tokenizeName(value: string): string[] {
  return value.split(/\s+/).map((token) => token.trim()).filter((token) => token.length > 0);
}

type IndexedPolitician = {
  id: string;
  normalizedName: string;
  tokens: string[];
  firstToken: string;
  lastToken: string;
  firstInitial: string;
};

function buildPoliticianIndex(rows: Array<{ id: string; name: string }>) {
  const byExactName = new Map<string, string[]>();
  const byLastToken = new Map<string, IndexedPolitician[]>();

  for (const row of rows) {
    const normalizedName = normalizeName(row.name);
    const tokens = tokenizeName(normalizedName);
    if (tokens.length === 0) continue;
    const firstToken = tokens[0];
    const lastToken = tokens[tokens.length - 1];
    const firstInitial = firstToken.slice(0, 1);
    const indexed: IndexedPolitician = {
      id: row.id,
      normalizedName,
      tokens,
      firstToken,
      lastToken,
      firstInitial,
    };
    const exact = byExactName.get(normalizedName) ?? [];
    exact.push(row.id);
    byExactName.set(normalizedName, exact);

    const last = byLastToken.get(lastToken) ?? [];
    last.push(indexed);
    byLastToken.set(lastToken, last);
  }

  return { byExactName, byLastToken };
}

function scoreCandidate(attendingTokens: string[], candidate: IndexedPolitician): number {
  const attendingSet = new Set(attendingTokens);
  let overlap = 0;
  for (const token of candidate.tokens) {
    if (attendingSet.has(token)) overlap += 1;
  }
  const base = overlap / Math.max(attendingTokens.length, candidate.tokens.length);
  const lastNameBonus = attendingTokens.includes(candidate.lastToken) ? 0.25 : 0;
  const firstNameBonus = attendingTokens.includes(candidate.firstToken) ? 0.15 : 0;
  const firstInitialBonus = attendingTokens.some((token) => token.length === 1 && token === candidate.firstInitial) ? 0.1 : 0;
  return base + lastNameBonus + firstNameBonus + firstInitialBonus;
}

function resolvePoliticianId(
  attendingName: string,
  index: ReturnType<typeof buildPoliticianIndex>,
): string | null {
  const normalized = normalizeName(attendingName);
  if (!normalized) return null;

  const exact = index.byExactName.get(normalized);
  if (exact && exact.length === 1) return exact[0];

  const parts = tokenizeName(normalized);
  if (parts.length === 2) {
    const swapped = `${parts[1]} ${parts[0]}`;
    const swappedExact = index.byExactName.get(swapped);
    if (swappedExact && swappedExact.length === 1) return swappedExact[0];
  }
  if (parts.length < 2) return null;

  const lastToken = parts[parts.length - 1];
  const candidates = index.byLastToken.get(lastToken) ?? [];
  if (candidates.length === 0) return null;

  const scored = candidates
    .map((candidate) => ({ id: candidate.id, score: scoreCandidate(parts, candidate) }))
    .sort((a, b) => b.score - a.score);

  if (scored.length === 0) return null;
  const best = scored[0];
  const second = scored[1];
  if (best.score < 0.85) return null;
  if (second && best.score - second.score < 0.15) return null;
  return best.id;
}

async function main() {
  loadLocalEnv();
  const args = parseArgs(process.argv.slice(2));
  const supabase = getSupabaseClient(args.apply);
  const runId = args.apply ? await ensureRunLog(supabase) : null;

  let totalFetched = 0;
  let totalCreated = 0;

  try {
    const { data: orgs, error: orgErr } = await supabase
      .from('lobby_organisations')
      .select('id, transparency_id')
      .order('updated_at', { ascending: false })
      .limit(args.maxOrgs);
    if (orgErr) throw orgErr;
    const orgRows = (orgs ?? []) as Array<{ id: string; transparency_id: string }>;
    if (orgRows.length === 0) {
      console.log(JSON.stringify({ apply: args.apply, orgs: 0, meetings_fetched: 0, meetings_created: 0 }, null, 2));
      return;
    }

    const { data: politicians, error: polErr } = await supabase
      .from('politicians')
      .select('id, name');
    if (polErr) throw polErr;

    const politicianIndex = buildPoliticianIndex((politicians ?? []) as Array<{ id: string; name: string }>);

    if (args.apply) {
      const orgIds = orgRows.map((org) => org.id);
      await supabase.from('lobby_meetings').delete().eq('data_source', 'lobbyfacts').in('lobby_id', orgIds);
    }

    const meetingRows: Array<{
      lobby_id: string;
      politician_id: string | null;
      meeting_date: string;
      subject: string | null;
      commissioner_org: string | null;
      role_of_politician: string | null;
      data_source: string;
      source_url: string;
    }> = [];

    for (const org of orgRows) {
      const csvUrl = `${BASE}/csv_export_meetings/${encodeURIComponent(org.transparency_id)}`;
      const res = await fetch(csvUrl, { headers: { 'User-Agent': USER_AGENT }, signal: AbortSignal.timeout(20_000) });
      if (!res.ok) {
        await sleep(100);
        continue;
      }
      const csvText = await res.text();
      const meetings = parseLobbyfactsMeetingsCsv(csvText);
      totalFetched += meetings.length;

      for (const meeting of meetings) {
        const attendingNames = parseAttendingPersonNames(meeting.attendingFromCommission);
        let matchedPoliticianId: string | null = null;
        for (const name of attendingNames) {
          const id = resolvePoliticianId(name, politicianIndex);
          if (id) {
            matchedPoliticianId = id;
            break;
          }
        }
        meetingRows.push({
          lobby_id: org.id,
          politician_id: matchedPoliticianId,
          meeting_date: meeting.meetingDate,
          subject: meeting.subject,
          commissioner_org: meeting.commissionerOrg || meeting.cabinet,
          role_of_politician: meeting.attendingFromCommission,
          data_source: 'lobbyfacts',
          source_url: csvUrl,
        });
      }
      await sleep(100);
    }

    if (args.apply && meetingRows.length > 0) {
      for (let i = 0; i < meetingRows.length; i += 500) {
        const chunk = meetingRows.slice(i, i + 500);
        const { data, error } = await supabase.from('lobby_meetings').insert(chunk).select('id');
        if (error) throw error;
        totalCreated += (data as unknown[] | null)?.length ?? 0;
      }
      await supabase.rpc('increment_total_records', { p_source_type: 'lobbyfacts', p_delta: totalCreated });
      await updateRunLog(supabase, runId, { status: 'completed', records_fetched: totalFetched, records_created: totalCreated });
    }

    console.log(JSON.stringify({
      apply: args.apply,
      orgs: orgRows.length,
      meetings_fetched: totalFetched,
      meetings_created: totalCreated,
      matched_to_politicians: meetingRows.filter((row) => row.politician_id !== null).length,
      unmatched: meetingRows.filter((row) => row.politician_id === null).length,
    }, null, 2));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await updateRunLog(supabase, runId, { status: 'failed', records_fetched: totalFetched, error_message: msg });
    throw err;
  }
}

main().catch((err) => { console.error(err); process.exit(1); });
