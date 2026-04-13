CREATE TABLE IF NOT EXISTS public.country_metadata (
  country_code text PRIMARY KEY,
  country_name text NOT NULL,
  entity_id text,
  wikipedia_title text,
  wikipedia_url text,
  description text,
  summary text,
  capital text,
  head_of_state text,
  head_of_government text,
  population double precision,
  area_km2 double precision,
  coordinates jsonb,
  flag_emoji text NOT NULL,
  flag_image_url text,
  locator_map_url text,
  officeholders jsonb NOT NULL DEFAULT '[]'::jsonb,
  source_updated_at timestamp with time zone NOT NULL DEFAULT now(),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_country_metadata_name
  ON public.country_metadata (country_name);

ALTER TABLE public.country_metadata ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'country_metadata'
      AND policyname = 'Country metadata is publicly readable'
  ) THEN
    CREATE POLICY "Country metadata is publicly readable"
      ON public.country_metadata
      FOR SELECT
      USING (true);
  END IF;
END
$$;

DROP TRIGGER IF EXISTS update_country_metadata_updated_at
  ON public.country_metadata;

CREATE TRIGGER update_country_metadata_updated_at
  BEFORE UPDATE ON public.country_metadata
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
