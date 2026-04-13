ALTER TABLE public.politicians
  ADD COLUMN IF NOT EXISTS source_attribution jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.politicians.source_attribution IS
  'Field-level provenance for politician facts. Keys are field names; values describe the source label, URL, record id, and fetch timestamp used to fill or confirm that field.';
