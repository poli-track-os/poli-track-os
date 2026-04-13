-- Add the 'wikipedia' value to data_source_type so enrich-wikipedia can
-- log its own scrape_runs rows instead of masquerading as another source.
--
-- NOTE: Postgres forbids using a newly-added enum value in the same
-- transaction that adds it, and `supabase db push` wraps each migration
-- file in a single transaction. For that reason the INSERT that actually
-- references the new 'wikipedia' value lives in the companion migration
-- 20260412170100_ingestion_truth_seeds.sql, which commits separately.
ALTER TYPE public.data_source_type ADD VALUE IF NOT EXISTS 'wikipedia';

-- Refresh data_sources rows so that base_url matches what ingestion code
-- actually fetches (not the open-data API placeholders seeded in the
-- original migration). These UPDATEs only reference existing enum values,
-- so they're safe to run in the same transaction as the ALTER TYPE above.
UPDATE public.data_sources
SET base_url = 'https://www.europarl.europa.eu/meps/en/full-list/xml',
    description = 'European Parliament MEP directory (XML export) — consumed by scrape-eu-parliament'
WHERE source_type = 'eu_parliament';

UPDATE public.data_sources
SET name = 'EU Institutional Press RSS',
    base_url = 'https://ec.europa.eu/commission/presscorner/api/files/RSS',
    description = 'EU Commission + Parliament press release RSS feeds — consumed by scrape-twitter (no Twitter/X API calls)'
WHERE source_type = 'twitter';

UPDATE public.data_sources
SET base_url = 'https://digitallibrary.un.org/search?cc=Voting+Data',
    description = 'UN Digital Library General Assembly voting records — consumed by scrape-un-votes'
WHERE source_type = 'un_digital_library';
