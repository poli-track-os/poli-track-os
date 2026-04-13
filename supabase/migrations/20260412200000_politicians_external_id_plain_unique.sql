-- Replace the partial unique index on politicians.external_id with a
-- plain unique index.
--
-- Why: Postgres's ON CONFLICT requires the INSERT to restate the
-- predicate of a partial index in order to match it. The Supabase JS
-- client's upsert({...}, { onConflict: "external_id" }) emits a plain
-- ON CONFLICT (external_id) with no WHERE clause, so the partial
-- index added in 20260412190000 is never matched and Postgres returns
-- 42P10 ("there is no unique or exclusion constraint matching the
-- ON CONFLICT specification").
--
-- A plain unique index still allows multiple NULL external_id rows
-- (Postgres does not consider two NULLs equal for index-equality),
-- which is what scrape-national-parliament relies on.
DROP INDEX IF EXISTS public.politicians_external_id_unique;

CREATE UNIQUE INDEX IF NOT EXISTS politicians_external_id_unique
  ON public.politicians (external_id);
