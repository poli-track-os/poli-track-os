-- P0.3: political_events idempotency.
-- A partial unique index on (politician_id, source_url, event_timestamp)
-- prevents rerun duplication from scrape-twitter / scrape-un-votes /
-- scrape-ep-reports etc. Events that lack a source_url are left alone
-- (there's no reliable dedupe key in that case).
CREATE UNIQUE INDEX IF NOT EXISTS political_events_dedupe_idx
  ON public.political_events (politician_id, source_url, event_timestamp)
  WHERE source_url IS NOT NULL;

-- P3.2: trust_level on political_events.
-- 1 = official primary (parliamentary_record, official_record)
-- 2 = authoritative secondary (news, financial_filing, lobby_register)
-- 3 = derived / heuristic (wikipedia, twitter RSS match)
-- 4 = low-confidence / inferred
ALTER TABLE public.political_events
  ADD COLUMN IF NOT EXISTS trust_level smallint
    CHECK (trust_level BETWEEN 1 AND 4);

-- P3.6: duration column on scrape_runs.
-- Computed as completed_at - started_at so it is always self-consistent.
ALTER TABLE public.scrape_runs
  ADD COLUMN IF NOT EXISTS duration_seconds integer
    GENERATED ALWAYS AS (
      CASE
        WHEN completed_at IS NULL THEN NULL
        ELSE EXTRACT(EPOCH FROM (completed_at - started_at))::int
      END
    ) STORED;

-- P3.7: parent_run_id so chained runs (eu-parliament → enrich-wikipedia)
-- can be linked to their parent.
ALTER TABLE public.scrape_runs
  ADD COLUMN IF NOT EXISTS parent_run_id uuid REFERENCES public.scrape_runs(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS scrape_runs_parent_idx
  ON public.scrape_runs (parent_run_id);

-- P2.5: cumulative total_records counter.
-- Replaces the current pattern of overwriting total_records with the
-- upstream list length on every batch. Call via:
--   await supabase.rpc('increment_total_records',
--     { p_source_type: 'eu_parliament', p_delta: 150 });
CREATE OR REPLACE FUNCTION public.increment_total_records(
  p_source_type public.data_source_type,
  p_delta integer
) RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.data_sources
  SET total_records = COALESCE(total_records, 0) + p_delta,
      last_synced_at = now()
  WHERE source_type = p_source_type;
$$;

GRANT EXECUTE ON FUNCTION public.increment_total_records(public.data_source_type, integer) TO service_role;

-- P3.1: retire columns that have no writer and no plausible source.
-- Dropping rather than leaving them as NULL forever because they mislead
-- consumers of the generated TypeScript types — every query currently
-- returns `net_worth | null`, `top_donors | null`, etc., which implies
-- the column *could* have a value.
ALTER TABLE public.politicians DROP COLUMN IF EXISTS city;
ALTER TABLE public.politicians DROP COLUMN IF EXISTS net_worth;
ALTER TABLE public.politicians DROP COLUMN IF EXISTS top_donors;
