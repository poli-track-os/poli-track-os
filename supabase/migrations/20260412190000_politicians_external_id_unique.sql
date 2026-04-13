-- Partial unique index on politicians.external_id.
--
-- Required by scrape-eu-parliament, which upserts on this column to
-- make reruns idempotent. Without a unique index Postgres rejects
-- `upsert(..., { onConflict: "external_id" })` with HTTP 500.
--
-- Partial (WHERE NOT NULL) because national-parliament rows leave
-- external_id NULL until enrich-wikipedia fills it with a Wikidata ID.
-- Multiple NULLs must still be allowed.
CREATE UNIQUE INDEX IF NOT EXISTS politicians_external_id_unique
  ON public.politicians (external_id)
  WHERE external_id IS NOT NULL;
