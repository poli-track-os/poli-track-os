-- Seed data_sources rows that reference the 'wikipedia' enum value added
-- in 20260412170000_ingestion_truth.sql. Lives in its own migration so
-- the ALTER TYPE commit happens first — Postgres forbids using a newly
-- added enum value in the same transaction that introduced it.
INSERT INTO public.data_sources (name, source_type, base_url, description)
VALUES
  ('Wikipedia', 'wikipedia',
   'https://en.wikipedia.org/w/api.php',
   'Wikipedia enrichment for politician biographies and infobox fields — consumed by enrich-wikipedia'),
  ('National Parliament (via Wikipedia categories)', 'parliamentary_record',
   'https://en.wikipedia.org/w/api.php',
   'Wikipedia parliament-roster categories — consumed by scrape-national-parliament')
ON CONFLICT DO NOTHING;
