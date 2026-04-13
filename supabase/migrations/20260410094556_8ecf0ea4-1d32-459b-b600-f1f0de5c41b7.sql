
ALTER TABLE public.politicians
  ADD COLUMN IF NOT EXISTS wikipedia_url text,
  ADD COLUMN IF NOT EXISTS wikipedia_summary text,
  ADD COLUMN IF NOT EXISTS biography text,
  ADD COLUMN IF NOT EXISTS wikipedia_image_url text,
  ADD COLUMN IF NOT EXISTS wikipedia_data jsonb,
  ADD COLUMN IF NOT EXISTS enriched_at timestamptz;
