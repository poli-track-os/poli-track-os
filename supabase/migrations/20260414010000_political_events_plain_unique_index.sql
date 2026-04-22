-- Bug fix: replace the PARTIAL unique index on political_events with a
-- PLAIN unique index so PostgREST upserts can target it.
--
-- Background: migration 20260412180000 created
--   CREATE UNIQUE INDEX political_events_idempotency_idx
--     ON public.political_events (politician_id, source_url, event_timestamp)
--     WHERE source_url IS NOT NULL;
--
-- Supabase JS `upsert(rows, { onConflict: "politician_id,source_url,event_timestamp" })`
-- emits `INSERT ... ON CONFLICT (politician_id, source_url, event_timestamp) DO NOTHING`
-- with NO WHERE clause in the inference. Postgres cannot match that
-- inference clause to a partial unique index whose predicate wasn't
-- supplied, so the upsert errors out. The calling functions
-- (scrape-mep-committees, scrape-mep-declarations, scrape-mep-reports,
-- scrape-twitter, scrape-un-votes) destructure `data` from the upsert
-- result but ignore `error`, so the error is swallowed and they report
-- "0 events inserted" with no visible failure.
--
-- This is the same bug migration 20260412200000 fixed for
-- politicians.external_id. The fix is identical: drop the partial index,
-- recreate as a plain unique index. Plain unique indexes on nullable
-- columns still allow multiple NULL rows (Postgres treats NULL as
-- distinct under unique constraints), so we don't lose the "NULL source_url
-- is allowed" semantics of the partial index.

DROP INDEX IF EXISTS public.political_events_idempotency_idx;

CREATE UNIQUE INDEX IF NOT EXISTS political_events_idempotency_idx
  ON public.political_events (politician_id, source_url, event_timestamp);
