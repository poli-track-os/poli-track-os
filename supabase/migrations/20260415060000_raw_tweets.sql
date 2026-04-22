-- Raw archived tweets from MEP and national politician accounts.
--
-- Populated by scripts/import-archive-twitter.ts from (in priority order):
--   1. Internet Archive Wayback snapshots of twitter.com/{handle} pages
--   2. Archive Team Twitter Stream Grab (archive.org) filtered by known handle
--   3. Academic corpora on Zenodo, manually ingested
--
-- LLM extraction (scripts/llm-extract-events.ts) reads from this table and
-- writes to political_events with data_source='llm_extraction'. The raw
-- tweet stays here forever as provenance.

CREATE TABLE IF NOT EXISTS public.raw_tweets (
  id             uuid primary key default gen_random_uuid(),
  politician_id  uuid references public.politicians(id) on delete set null,
  handle         text not null,
  tweet_id       text not null,
  posted_at      timestamptz,
  body           text not null,
  lang           text,
  in_reply_to    text,
  retweet_of     text,
  archive_source text not null,
  source_url     text,
  fetched_at     timestamptz not null default now(),
  processed_at   timestamptz,
  UNIQUE (handle, tweet_id)
);

CREATE INDEX IF NOT EXISTS raw_tweets_politician_idx ON public.raw_tweets (politician_id);
CREATE INDEX IF NOT EXISTS raw_tweets_handle_idx     ON public.raw_tweets (handle);
CREATE INDEX IF NOT EXISTS raw_tweets_processed_idx  ON public.raw_tweets (processed_at);
CREATE INDEX IF NOT EXISTS raw_tweets_posted_idx     ON public.raw_tweets (posted_at);

ALTER TABLE public.raw_tweets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Raw tweets are viewable by everyone"
  ON public.raw_tweets
  FOR SELECT
  USING (true);
