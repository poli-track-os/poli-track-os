-- Government expenditure by function (Eurostat COFOG gov_10a_exp).
--
-- One row per (country, year, cofog_code). For each row we store the three
-- units Eurostat publishes: absolute MIO_EUR, % of GDP, % of total
-- expenditure. `is_provisional` tracks Eurostat's `p` flag.
--
-- cofog_code is 'GF01'..'GF10' for the ten top-level functions, or 'GFTOT'
-- for the total. We keep the label denormalized for display since there are
-- only 11 distinct values.

CREATE TABLE IF NOT EXISTS public.government_expenditure (
  id                        uuid primary key default gen_random_uuid(),
  country_code              text not null,
  year                      integer not null,
  cofog_code                text not null,
  cofog_label               text not null,
  amount_million_eur        numeric,
  pct_of_gdp                numeric,
  pct_of_total_expenditure  numeric,
  sector                    text not null default 'S13',
  na_item                   text not null default 'TE',
  is_provisional            boolean not null default false,
  data_source               text not null default 'eurostat_cofog',
  source_url                text,
  fetched_at                timestamptz not null default now(),
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now(),
  UNIQUE (country_code, year, cofog_code)
);

CREATE INDEX IF NOT EXISTS government_expenditure_country_year_idx ON public.government_expenditure (country_code, year);
CREATE INDEX IF NOT EXISTS government_expenditure_cofog_idx        ON public.government_expenditure (cofog_code);

ALTER TABLE public.government_expenditure ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Government expenditure is viewable by everyone"
  ON public.government_expenditure
  FOR SELECT
  USING (true);

CREATE TRIGGER update_government_expenditure_updated_at
  BEFORE UPDATE ON public.government_expenditure
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
