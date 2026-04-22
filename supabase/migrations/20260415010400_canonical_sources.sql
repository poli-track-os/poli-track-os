-- Canonical source documents. One row per URL we've ever fetched.
-- Lets relationships and claims point at a *source document* rather than
-- just a URL string, so we can deduplicate and display provenance richly.

CREATE TABLE IF NOT EXISTS public.sources (
  id           uuid primary key default gen_random_uuid(),
  url          text not null,
  title        text,
  publisher    text,
  published_at timestamptz,
  fetched_at   timestamptz not null default now(),
  content_hash text,
  data_source  text not null,
  mime_type    text,
  UNIQUE (url)
);

CREATE INDEX IF NOT EXISTS sources_data_source_idx ON public.sources (data_source);
CREATE INDEX IF NOT EXISTS sources_fetched_at_idx  ON public.sources (fetched_at);

ALTER TABLE public.sources ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Sources are viewable by everyone"
  ON public.sources
  FOR SELECT
  USING (true);
