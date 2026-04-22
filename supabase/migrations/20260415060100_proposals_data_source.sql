-- down: ALTER TABLE public.proposals DROP COLUMN IF EXISTS data_source;
--       DROP INDEX IF EXISTS proposals_source_url_uidx;

ALTER TABLE public.proposals
  ADD COLUMN IF NOT EXISTS data_source TEXT NOT NULL DEFAULT 'eurlex';

-- Non-partial unique index. PostgreSQL treats NULLs as distinct so rows with
-- source_url IS NULL won't conflict.
CREATE UNIQUE INDEX IF NOT EXISTS proposals_source_url_uidx
  ON public.proposals (source_url);
