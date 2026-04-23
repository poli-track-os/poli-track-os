#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { createClient } from '@supabase/supabase-js';
import {
  candidateMatchesPolitician,
  extractWikipediaTitleFromUrl,
} from '../supabase/functions/enrich-wikipedia/parsers.ts';

type Args = {
  apply: boolean;
  countries: string[] | null;
  expectProjectRef: string | null;
};

type PoliticianRow = {
  id: string;
  name: string;
  country_code: string;
  country_name: string;
  wikipedia_url: string | null;
  wikipedia_data: Record<string, unknown> | null;
  photo_url: string | null;
  source_attribution: Record<string, unknown> | null;
};

function parseArgs(argv: string[]): Args {
  const args: Args = { apply: false, countries: null, expectProjectRef: null };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === '--apply') {
      args.apply = true;
      continue;
    }
    if (token === '--countries') {
      const next = argv[index + 1];
      if (!next) throw new Error('Missing value for --countries');
      args.countries = next.split(',').map((value) => value.trim().toUpperCase()).filter(Boolean);
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
  if (!value) throw new Error(`Missing required environment variable: ${key}`);
  return value;
}

function parseProjectRef(url: string) {
  try {
    return new URL(url).hostname.split('.')[0] || null;
  } catch {
    return null;
  }
}

function getOfficialCandidateNames(row: PoliticianRow) {
  const officialBlock = row.source_attribution?._official_record;
  const alternateNames = typeof officialBlock === 'object' && officialBlock !== null && Array.isArray((officialBlock as Record<string, unknown>).alternate_names)
    ? (officialBlock as Record<string, unknown>).alternate_names.filter((value): value is string => typeof value === 'string')
    : [];
  return [...new Set([row.name, ...alternateNames].map((value) => value.trim()).filter(Boolean))];
}

function getWikipediaCategories(row: PoliticianRow) {
  const raw = row.wikipedia_data?.categories;
  if (!Array.isArray(raw)) return [];
  return raw.filter((value): value is string => typeof value === 'string');
}

function isWikipediaHostedImage(url: string | null) {
  if (!url) return false;
  return /wikipedia\.org|wikimedia\.org/i.test(url);
}

async function loadRows(supabase: ReturnType<typeof createClient>, countries: string[] | null) {
  const pageSize = 1000;
  const rows: PoliticianRow[] = [];

  for (let offset = 0; ; offset += pageSize) {
    let query = supabase
      .from('politicians')
      .select('id, name, country_code, country_name, wikipedia_url, wikipedia_data, photo_url, source_attribution')
      .eq('data_source', 'official_record')
      .not('wikipedia_url', 'is', null)
      .order('id', { ascending: true })
      .range(offset, offset + pageSize - 1);

    if (countries && countries.length > 0) {
      query = query.in('country_code', countries);
    }

    const { data, error } = await query;
    if (error) throw error;
    const batch = (data || []) as PoliticianRow[];
    rows.push(...batch);
    if (batch.length < pageSize) break;
  }

  return rows;
}

async function main() {
  loadLocalEnv();
  const args = parseArgs(process.argv.slice(2));
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  if (!supabaseUrl) throw new Error('Missing SUPABASE_URL or VITE_SUPABASE_URL');
  const key = args.apply
    ? getRequiredEnv('SUPABASE_SERVICE_ROLE_KEY')
    : process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  if (!key) throw new Error('Missing credentials');

  const projectRef = parseProjectRef(supabaseUrl);
  if (args.expectProjectRef && projectRef !== args.expectProjectRef) {
    throw new Error(`Ref mismatch: expected ${args.expectProjectRef}, got ${projectRef}`);
  }

  const supabase = createClient(supabaseUrl, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const rows = await loadRows(supabase, args.countries);
  const mismatches = rows
    .map((row) => {
      const wikiTitle = extractWikipediaTitleFromUrl(row.wikipedia_url);
      if (!wikiTitle) return null;
      const categories = getWikipediaCategories(row);
      const candidateNames = getOfficialCandidateNames(row);
      const isValid = candidateNames.some((name) =>
        candidateMatchesPolitician(wikiTitle, categories, name, row.country_name),
      );
      if (isValid) return null;
      return {
        id: row.id,
        name: row.name,
        countryCode: row.country_code,
        wikipediaUrl: row.wikipedia_url,
        wikiTitle,
        candidateNames,
        clearPhoto: isWikipediaHostedImage(row.photo_url),
      };
    })
    .filter((row): row is NonNullable<typeof row> => Boolean(row));

  const summary = {
    apply: args.apply,
    scanned: rows.length,
    mismatches: mismatches.length,
    sample: mismatches.slice(0, 20),
  };

  if (!args.apply) {
    console.log(JSON.stringify(summary, null, 2));
    return;
  }

  for (const row of mismatches) {
    const payload: Record<string, unknown> = {
      wikipedia_url: null,
      wikipedia_summary: null,
      wikipedia_image_url: null,
      wikipedia_data: null,
      enriched_at: null,
    };
    if (row.clearPhoto) payload.photo_url = null;

    const { error } = await supabase
      .from('politicians')
      .update(payload)
      .eq('id', row.id);
    if (error) throw error;
  }

  console.log(JSON.stringify(summary, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
