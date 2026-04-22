#!/usr/bin/env node
// LLM event extraction — operator tool, NEVER auto-run.
//
// Reads unprocessed `raw_tweets` and runs each through a Claude tool-use
// extraction call. Inserts the resulting structured events into
// `political_events` with data_source='llm_extraction', trust_level=4.
//
// Cost control:
//   - Hard ceiling via MAX_USD_PER_RUN env var (required, no default)
//   - Cost-per-million pricing baked in for haiku/sonnet (update if rates
//     change)
//   - Resume-from-checkpoint via raw_tweets.processed_at
//
// Usage:
//   ANTHROPIC_API_KEY=sk-... MAX_USD_PER_RUN=2.00 \
//     node --experimental-strip-types scripts/llm-extract-events.ts \
//       --apply --model claude-haiku-4-5-20251001 [--limit 100]

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { createClient } from '@supabase/supabase-js';

type Args = {
  apply: boolean;
  model: string;
  limit: number | null;
};

// Approximate USD per 1M tokens. Update if Anthropic changes pricing.
const PRICING: Record<string, { inputUsdPerMillion: number; outputUsdPerMillion: number }> = {
  'claude-haiku-4-5-20251001': { inputUsdPerMillion: 1.0, outputUsdPerMillion: 5.0 },
  'claude-sonnet-4-6': { inputUsdPerMillion: 3.0, outputUsdPerMillion: 15.0 },
  'claude-opus-4-6': { inputUsdPerMillion: 15.0, outputUsdPerMillion: 75.0 },
};

function parseArgs(argv: string[]): Args {
  const args: Args = { apply: false, model: 'claude-haiku-4-5-20251001', limit: 100 };
  for (let i = 0; i < argv.length; i += 1) {
    const t = argv[i];
    if (t === '--apply') { args.apply = true; continue; }
    if (t === '--model') { args.model = argv[++i] || args.model; continue; }
    if (t === '--limit') {
      const next = argv[++i];
      args.limit = next ? parseInt(next, 10) : null;
      continue;
    }
    if (t === '--help' || t === '-h') {
      console.log('scripts/llm-extract-events.ts [--apply] [--model X] [--limit N]\n\nRequires ANTHROPIC_API_KEY and MAX_USD_PER_RUN env vars.');
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

function getSupabase(apply: boolean) {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  if (!url) throw new Error('Missing SUPABASE_URL');
  const key = apply
    ? process.env.SUPABASE_SERVICE_ROLE_KEY
    : process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  if (!key) throw new Error('Missing credentials');
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

interface AnthropicResponse {
  content: Array<{
    type: string;
    input?: Record<string, unknown>;
    text?: string;
  }>;
  usage: { input_tokens: number; output_tokens: number };
}

async function callClaude(model: string, system: string, userText: string): Promise<AnthropicResponse> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY required');

  const body = {
    model,
    max_tokens: 1024,
    system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
    tools: [{
      name: 'emit_events',
      description: 'Emit structured events extracted from the input text.',
      input_schema: {
        type: 'object',
        properties: {
          events: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                event_type: { type: 'string' },
                summary: { type: 'string', maxLength: 200 },
                claimed_at: { type: 'string' },
                monetary_amount_eur: { type: ['number', 'null'] },
                location: { type: ['string', 'null'] },
                entities_mentioned: { type: 'array', items: { type: 'string' } },
                confidence: { type: 'number', minimum: 0, maximum: 1 },
              },
              required: ['event_type', 'summary', 'confidence'],
            },
          },
        },
        required: ['events'],
      },
    }],
    tool_choice: { type: 'tool', name: 'emit_events' },
    messages: [{ role: 'user', content: userText }],
  };

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Anthropic ${res.status}: ${await res.text().catch(() => '')}`);
  return res.json() as Promise<AnthropicResponse>;
}

interface ExtractedEvent {
  event_type: string;
  summary: string;
  claimed_at?: string;
  monetary_amount_eur?: number | null;
  location?: string | null;
  entities_mentioned?: string[];
  confidence: number;
}

function estimateCostUsd(model: string, inputTokens: number, outputTokens: number): number {
  const rate = PRICING[model];
  if (!rate) return 0;
  return (inputTokens / 1_000_000) * rate.inputUsdPerMillion + (outputTokens / 1_000_000) * rate.outputUsdPerMillion;
}

async function main() {
  loadLocalEnv();
  const args = parseArgs(process.argv.slice(2));

  const maxUsdRaw = process.env.MAX_USD_PER_RUN;
  if (!maxUsdRaw) {
    console.error('FATAL: MAX_USD_PER_RUN env var required. Set it to a number (e.g. 2.00) and re-run.');
    process.exit(1);
  }
  const maxUsd = Number.parseFloat(maxUsdRaw);
  if (!Number.isFinite(maxUsd) || maxUsd <= 0) {
    console.error('FATAL: MAX_USD_PER_RUN must be a positive number.');
    process.exit(1);
  }

  const supabase = getSupabase(args.apply);

  // Load the prompt template + hash it.
  const promptPath = path.join(process.cwd(), 'prompts', 'event-extraction-v1.md');
  const promptTemplate = fs.readFileSync(promptPath, 'utf8');
  const promptHash = crypto.createHash('sha256').update(promptTemplate).digest('hex').slice(0, 16);

  // Load unprocessed tweets joined with their politician.
  const { data: rawTweets, error } = await supabase
    .from('raw_tweets')
    .select('id, politician_id, handle, body, posted_at, politicians(id, name, role, country_name)')
    .is('processed_at', null)
    .not('politician_id', 'is', null)
    .order('posted_at', { ascending: false })
    .limit(args.limit ?? 100);
  if (error) throw error;

  const tweets = (rawTweets || []) as Array<{
    id: string;
    politician_id: string;
    handle: string;
    body: string;
    posted_at: string | null;
    politicians: { id: string; name: string; role: string | null; country_name: string | null } | null;
  }>;

  console.error(`loaded ${tweets.length} unprocessed raw_tweets`);
  if (tweets.length === 0) {
    console.log(JSON.stringify({ apply: args.apply, processed: 0, events_extracted: 0, cost_usd: 0 }));
    return;
  }

  let totalInput = 0;
  let totalOutput = 0;
  let totalEvents = 0;
  let processed = 0;

  for (const tweet of tweets) {
    if (!tweet.politicians) continue;
    const userText = JSON.stringify({
      politician_name: tweet.politicians.name,
      politician_role: tweet.politicians.role || 'Politician',
      politician_country: tweet.politicians.country_name || 'Unknown',
      text: tweet.body,
      text_posted_at: tweet.posted_at,
    });

    let response: AnthropicResponse;
    try {
      response = await callClaude(args.model, promptTemplate, userText);
    } catch (err) {
      console.error(`  tweet ${tweet.id} failed: ${err instanceof Error ? err.message : err}`);
      continue;
    }

    totalInput += response.usage.input_tokens;
    totalOutput += response.usage.output_tokens;

    // Cost ceiling check.
    const costSoFar = estimateCostUsd(args.model, totalInput, totalOutput);
    if (costSoFar > maxUsd) {
      console.error(`  cost ceiling reached: $${costSoFar.toFixed(4)} > $${maxUsd.toFixed(4)}`);
      break;
    }

    // Extract the tool-use block.
    const toolBlock = response.content.find((c) => c.type === 'tool_use');
    if (!toolBlock?.input) continue;
    const events = (toolBlock.input as { events?: ExtractedEvent[] }).events || [];

    if (args.apply && events.length > 0) {
      const rows = events
        .filter((e) => e.confidence >= 0.5)
        .map((e) => ({
          politician_id: tweet.politician_id,
          event_type: e.event_type,
          title: e.summary.slice(0, 240),
          description: `LLM-extracted from tweet ${tweet.handle}/${tweet.id}`,
          source: 'news' as const,
          source_url: `https://twitter.com/${tweet.handle}/status/${tweet.id}`,
          event_timestamp: e.claimed_at || tweet.posted_at || new Date().toISOString(),
          valid_from: e.claimed_at || tweet.posted_at || null,
          raw_data: { llm_event: e, tweet_id: tweet.id, prompt_hash: promptHash },
          evidence_count: 1,
          trust_level: 4,
          extraction_model: args.model,
          extraction_confidence: e.confidence,
        }));
      if (rows.length > 0) {
        const { data, error: upErr } = await supabase
          .from('political_events')
          .upsert(rows, { onConflict: 'politician_id,source_url,event_timestamp', ignoreDuplicates: true })
          .select('id');
        if (upErr) console.error(`  upsert error: ${upErr.message}`);
        else totalEvents += (data as unknown[] | null)?.length ?? 0;
      }
    }

    processed += 1;
    if (args.apply) {
      await supabase.from('raw_tweets').update({ processed_at: new Date().toISOString() }).eq('id', tweet.id);
    }
  }

  const cost = estimateCostUsd(args.model, totalInput, totalOutput);
  console.log(JSON.stringify({
    apply: args.apply,
    model: args.model,
    prompt_hash: promptHash,
    processed,
    events_extracted: totalEvents,
    input_tokens: totalInput,
    output_tokens: totalOutput,
    cost_usd: Number(cost.toFixed(4)),
    cost_ceiling_usd: maxUsd,
  }, null, 2));
}

main().catch((err) => { console.error(err); process.exit(1); });
