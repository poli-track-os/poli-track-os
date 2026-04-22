-- Country-year demographics backed by Eurostat (and other sources).
--
-- Retires the hardcoded EU_COUNTRY_DATA constant in src/pages/Data.tsx which
-- embeds population, GDP, and area as static literals. Once this table is
-- populated, Data.tsx reads from it via useCountryDemographics().

CREATE TABLE IF NOT EXISTS public.country_demographics (
  country_code    text not null,
  year            integer not null,
  population      bigint,
  gdp_million_eur numeric,
  gdp_per_capita_eur numeric,
  area_km2        numeric,
  data_source     text not null,
  source_url      text,
  fetched_at      timestamptz not null default now(),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  PRIMARY KEY (country_code, year)
);

CREATE INDEX IF NOT EXISTS country_demographics_year_idx ON public.country_demographics (year);

ALTER TABLE public.country_demographics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Country demographics are viewable by everyone"
  ON public.country_demographics
  FOR SELECT
  USING (true);

CREATE TRIGGER update_country_demographics_updated_at
  BEFORE UPDATE ON public.country_demographics
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
