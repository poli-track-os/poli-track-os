import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { createClient } from '@supabase/supabase-js';

type Args = {
  apply: boolean;
  batchSize: number;
  concurrency: number;
  expectProjectRef: string | null;
  limit: number | null;
};

type PoliticianRow = {
  id: string;
  name: string;
  source_url: string | null;
  wikipedia_url: string | null;
  wikipedia_summary: string | null;
  biography: string | null;
  wikipedia_image_url: string | null;
  wikipedia_data: Record<string, unknown> | null;
  enriched_at: string | null;
  photo_url: string | null;
  source_attribution: Record<string, unknown> | null;
};

type HydrationPlan = {
  politicianId: string;
  name: string;
  wikipediaUrl: string;
  changedFields: string[];
  payload: Record<string, unknown>;
};

type WikiSummary = {
  title?: string;
  extract?: string;
  description?: string;
  originalimage?: { source?: string };
  thumbnail?: { source?: string };
  content_urls?: { desktop?: { page?: string } };
};

const DEFAULT_BATCH_SIZE = 500;
const DEFAULT_CONCURRENCY = 6;
const SOURCE_TYPE = 'wikipedia';
const SOURCE_LABEL = 'Wikipedia REST summary';
let nextAllowedAt = 0;
let throttleChain = Promise.resolve();

function printHelp() {
  console.log(`Usage:
  node --experimental-strip-types scripts/backfill-wikipedia-links.ts [--apply] [--batch-size N] [--concurrency N] [--limit N] [--expect-project-ref ref]

Behavior:
  Dry-run is the default. The script finds politicians that already have a Wikipedia URL
  but are missing local summary/biography enrichment, fetches the Wikipedia REST summary,
  and reports the updates it would write.
  --apply writes those updates directly to Supabase using SUPABASE_SERVICE_ROLE_KEY.

Environment:
  Reads SUPABASE_URL or VITE_SUPABASE_URL.
  Reads SUPABASE_SERVICE_ROLE_KEY only when --apply is supplied.
`);
}

function parseArgs(argv: string[]): Args {
  const args: Args = {
    apply: false,
    batchSize: DEFAULT_BATCH_SIZE,
    concurrency: DEFAULT_CONCURRENCY,
    expectProjectRef: null,
    limit: null,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];

    if (token === '--apply') {
      args.apply = true;
      continue;
    }

    if (token === '--batch-size') {
      const next = argv[index + 1];
      if (!next) throw new Error('Missing value for --batch-size');
      const parsed = Number.parseInt(next, 10);
      if (!Number.isInteger(parsed) || parsed <= 0) throw new Error(`Invalid --batch-size value: ${next}`);
      args.batchSize = parsed;
      index += 1;
      continue;
    }

    if (token === '--concurrency') {
      const next = argv[index + 1];
      if (!next) throw new Error('Missing value for --concurrency');
      const parsed = Number.parseInt(next, 10);
      if (!Number.isInteger(parsed) || parsed <= 0 || parsed > 20) throw new Error(`Invalid --concurrency value: ${next}`);
      args.concurrency = parsed;
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
      if (!Number.isInteger(parsed) || parsed <= 0) throw new Error(`Invalid --limit value: ${next}`);
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

function extractWikipediaUrl(row: PoliticianRow) {
  const candidate = row.wikipedia_url || row.source_url;
  if (!candidate || !candidate.includes('wikipedia.org/wiki/')) return null;
  return candidate;
}

function extractWikipediaTitle(wikipediaUrl: string) {
  try {
    const parsed = new URL(wikipediaUrl);
    const marker = '/wiki/';
    const index = parsed.pathname.indexOf(marker);
    if (index === -1) return null;
    const encodedTitle = parsed.pathname.slice(index + marker.length);
    if (!encodedTitle) return null;
    return decodeURIComponent(encodedTitle);
  } catch {
    return null;
  }
}

function needsHydration(row: PoliticianRow) {
  const wikipediaUrl = extractWikipediaUrl(row);
  if (!wikipediaUrl) return false;
  return !row.enriched_at || !row.wikipedia_summary || !row.biography;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForThrottle() {
  const scheduled = throttleChain.then(async () => {
    const now = Date.now();
    if (now < nextAllowedAt) {
      await sleep(nextAllowedAt - now);
    }
    nextAllowedAt = Date.now() + 150;
  });

  throttleChain = scheduled.catch(() => {});
  await scheduled;
}

async function fetchWikipediaSummary(title: string) {
  const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title.replace(/ /g, '_'))}`;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    await waitForThrottle();

    let response: Response;
    try {
      response = await fetch(url, {
        headers: {
          'User-Agent': 'poli-track wikipedia link backfill',
        },
        signal: AbortSignal.timeout(10000),
      });
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      const waitMs = 1000 * (attempt + 1);
      nextAllowedAt = Date.now() + waitMs;
      await sleep(waitMs);
      if (attempt === 3) {
        return { url, error: `Fetch failed: ${reason}` } as const;
      }
      continue;
    }

    if (response.ok) {
      const data = (await response.json()) as WikiSummary;
      return { url, data };
    }

    if (response.status === 404) {
      return { url, error: '404 Not Found' } as const;
    }

    if ([429, 502, 503, 504].includes(response.status)) {
      const retryAfter = response.headers.get('Retry-After');
      const waitMs = retryAfter ? Number.parseInt(retryAfter, 10) * 1000 : 1000 * (attempt + 1);
      nextAllowedAt = Date.now() + waitMs;
      await sleep(waitMs);
      continue;
    }

    return { url, error: `${response.status} ${response.statusText}` } as const;
  }

  return { url, error: 'Retry limit exceeded' } as const;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function buildSourceAttribution(
  existing: Record<string, unknown> | null | undefined,
  wikipediaUrl: string,
  datasetUrl: string,
  title: string,
  fieldNames: string[],
) {
  const next: Record<string, unknown> = isRecord(existing) ? structuredClone(existing) : {};
  const fetchedAt = new Date().toISOString();
  const sourceMeta = {
    source_type: SOURCE_TYPE,
    source_label: SOURCE_LABEL,
    source_url: wikipediaUrl,
    dataset_url: datasetUrl,
    record_id: `wikipedia:${title}`,
    fetched_at: fetchedAt,
  };

  next._wikipedia_summary = {
    ...sourceMeta,
    title,
  };

  for (const fieldName of fieldNames) {
    next[fieldName] = sourceMeta;
  }

  return next;
}

function buildHydrationPlan(
  row: PoliticianRow,
  wikipediaUrl: string,
  datasetUrl: string,
  title: string,
  summary: WikiSummary,
): HydrationPlan | null {
  const payload: Record<string, unknown> = {};
  const changedFields: string[] = [];
  const canonicalUrl = summary.content_urls?.desktop?.page || wikipediaUrl;
  const imageUrl = summary.originalimage?.source || summary.thumbnail?.source || null;
  const extract = summary.extract?.trim() || null;
  const description = summary.description?.trim() || null;

  const assignIfDifferent = (field: keyof PoliticianRow | 'wikipedia_data', nextValue: unknown) => {
    if (nextValue === null || nextValue === undefined || nextValue === '') return;
    const currentValue = field === 'wikipedia_data' ? row.wikipedia_data : row[field];
    if (JSON.stringify(currentValue ?? null) !== JSON.stringify(nextValue)) {
      payload[field] = nextValue;
      changedFields.push(field);
    }
  };

  assignIfDifferent('wikipedia_url', canonicalUrl);
  if (!row.wikipedia_summary && extract) assignIfDifferent('wikipedia_summary', extract);
  if (!row.biography && extract) assignIfDifferent('biography', extract);
  if (!row.wikipedia_image_url && imageUrl) assignIfDifferent('wikipedia_image_url', imageUrl);
  if (!row.photo_url && imageUrl) assignIfDifferent('photo_url', imageUrl);

  const nextWikipediaData = {
    ...(isRecord(row.wikipedia_data) ? row.wikipedia_data : {}),
    title: summary.title || title,
    description,
    last_fetched: new Date().toISOString(),
  };
  assignIfDifferent('wikipedia_data', nextWikipediaData);

  if (!row.enriched_at) {
    payload.enriched_at = new Date().toISOString();
    changedFields.push('enriched_at');
  }

  if (changedFields.length === 0) return null;

  payload.source_attribution = buildSourceAttribution(
    row.source_attribution,
    canonicalUrl,
    datasetUrl,
    title,
    [...changedFields, 'source_attribution'],
  );
  changedFields.push('source_attribution');

  return {
    politicianId: row.id,
    name: row.name,
    wikipediaUrl: canonicalUrl,
    changedFields,
    payload,
  };
}

async function ensureRunLog(supabase: ReturnType<typeof createClient>) {
  const { data, error } = await supabase
    .from('scrape_runs')
    .insert({
      source_type: SOURCE_TYPE,
      status: 'running',
    })
    .select('id')
    .single();

  if (error) throw error;
  return data.id as string;
}

async function updateRunLog(
  supabase: ReturnType<typeof createClient>,
  runId: string,
  payload: {
    status: 'completed' | 'failed';
    records_fetched: number;
    records_updated?: number;
    error_message?: string | null;
  },
) {
  const { error } = await supabase
    .from('scrape_runs')
    .update({
      ...payload,
      completed_at: new Date().toISOString(),
    })
    .eq('id', runId);

  if (error) throw error;
}

async function loadCandidates(
  supabase: ReturnType<typeof createClient>,
  batchSize: number,
  limit: number | null,
) {
  const filtered: PoliticianRow[] = [];
  const pageSize = Math.max(batchSize, 250);

  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await supabase
      .from('politicians')
      .select('id, name, source_url, wikipedia_url, wikipedia_summary, biography, wikipedia_image_url, wikipedia_data, enriched_at, photo_url, source_attribution')
      .order('id', { ascending: true })
      .range(offset, offset + pageSize - 1);

    if (error) throw error;

    const chunk = (data || []) as PoliticianRow[];
    for (const row of chunk) {
      if (needsHydration(row)) filtered.push(row);
      if (limit && filtered.length >= limit) {
        return filtered.slice(0, limit);
      }
    }

    if (chunk.length < pageSize) break;
  }

  return filtered;
}

async function processBatch(rows: PoliticianRow[]) {
  const plans: HydrationPlan[] = [];
  const failures: Array<{ id: string; name: string; reason: string }> = [];

  await Promise.all(
    rows.map(async (row) => {
      const wikipediaUrl = extractWikipediaUrl(row);
      if (!wikipediaUrl) return;

      const title = extractWikipediaTitle(wikipediaUrl);
      if (!title) {
        failures.push({ id: row.id, name: row.name, reason: 'Could not derive Wikipedia title from URL' });
        return;
      }

      const summaryResult = await fetchWikipediaSummary(title);
      if (!summaryResult?.data) {
        failures.push({ id: row.id, name: row.name, reason: summaryResult?.error || 'Wikipedia summary request failed' });
        return;
      }

      const plan = buildHydrationPlan(row, wikipediaUrl, summaryResult.url, title, summaryResult.data);
      if (plan) plans.push(plan);
    }),
  );

  return { plans, failures };
}

async function applyPlans(supabase: ReturnType<typeof createClient>, plans: HydrationPlan[]) {
  let updated = 0;

  for (const plan of plans) {
    const { error } = await supabase
      .from('politicians')
      .update(plan.payload)
      .eq('id', plan.politicianId);
    if (error) throw error;
    updated += 1;
  }

  return updated;
}

async function main() {
  loadLocalEnv();
  const args = parseArgs(process.argv.slice(2));
  const supabase = getSupabaseClient(args.apply);
  const projectRef = parseProjectRef(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '');

  if (args.expectProjectRef && projectRef !== args.expectProjectRef) {
    throw new Error(`Resolved project ref ${projectRef ?? 'unknown'} does not match expected ${args.expectProjectRef}`);
  }

  const runId = await ensureRunLog(supabase);

  try {
    const candidates = await loadCandidates(supabase, args.batchSize, args.limit);
    const candidateCount = candidates.length;
    const plans: HydrationPlan[] = [];
    const failures: Array<{ id: string; name: string; reason: string }> = [];
    let processed = 0;

    for (let index = 0; index < candidates.length; index += args.concurrency) {
      const chunk = candidates.slice(index, index + args.concurrency);
      const result = await processBatch(chunk);
      plans.push(...result.plans);
      failures.push(...result.failures);

      if (args.apply && result.plans.length > 0) {
        await applyPlans(supabase, result.plans);
      }

      processed += chunk.length;
      if (processed % 50 === 0 || processed === candidateCount) {
        console.log(JSON.stringify({
          phase: 'progress',
          apply: args.apply,
          processed,
          total: candidateCount,
          plannedUpdates: plans.length,
          appliedUpdates: args.apply ? plans.length : 0,
          failed: failures.length,
        }));
      }
    }

    const applied = args.apply ? plans.length : 0;
    if (applied > 0) {
      await supabase.rpc('increment_total_records', {
        p_source_type: SOURCE_TYPE,
        p_delta: applied,
      });
    }

    await updateRunLog(supabase, runId, {
      status: 'completed',
      records_fetched: candidateCount,
      records_updated: args.apply ? applied : plans.length,
      error_message: failures.length > 0 ? `${failures.length} summary fetch failures` : null,
    });

    console.log(JSON.stringify({
      apply: args.apply,
      projectRef,
      candidates: candidateCount,
      plannedUpdates: plans.length,
      appliedUpdates: applied,
      failed: failures.length,
      samples: plans.slice(0, 12).map((plan) => ({
        id: plan.politicianId,
        name: plan.name,
        wikipediaUrl: plan.wikipediaUrl,
        changedFields: plan.changedFields,
      })),
      failures: failures.slice(0, 12),
    }, null, 2));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await updateRunLog(supabase, runId, {
      status: 'failed',
      records_fetched: 0,
      error_message: message,
    });
    throw error;
  }
}

main()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
