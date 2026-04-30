-- Public office compensation history.
-- Stores role-level base-pay records separately from politician financial
-- declarations so official salary scales can be shown for every matching
-- officeholder without pretending they are personal asset disclosures.

CREATE TABLE IF NOT EXISTS public.public_office_compensation (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  country_code TEXT NOT NULL,
  country_name TEXT NOT NULL,
  jurisdiction TEXT NOT NULL DEFAULT 'federal',
  chamber_id TEXT,
  office_type TEXT NOT NULL,
  office_title TEXT NOT NULL,
  role_patterns TEXT[] NOT NULL DEFAULT '{}',
  year INTEGER NOT NULL CHECK (year >= 1800 AND year <= 2200),
  effective_date DATE NOT NULL,
  date_to DATE,
  period TEXT NOT NULL DEFAULT 'annual',
  amount NUMERIC NOT NULL,
  annual_amount NUMERIC NOT NULL,
  currency TEXT NOT NULL,
  annual_amount_eur NUMERIC,
  source_url TEXT NOT NULL,
  source_label TEXT NOT NULL,
  source_type TEXT NOT NULL DEFAULT 'official',
  trust_level INTEGER NOT NULL DEFAULT 1 CHECK (trust_level BETWEEN 1 AND 4),
  notes TEXT,
  raw_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(country_code, jurisdiction, office_type, office_title, year, effective_date, source_url)
);

ALTER TABLE public.public_office_compensation ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Office compensation is publicly readable" ON public.public_office_compensation;
CREATE POLICY "Office compensation is publicly readable"
  ON public.public_office_compensation
  FOR SELECT
  USING (true);

CREATE INDEX IF NOT EXISTS idx_public_office_comp_country_year
  ON public.public_office_compensation(country_code, year DESC);

CREATE INDEX IF NOT EXISTS idx_public_office_comp_office_type
  ON public.public_office_compensation(office_type, year DESC);

CREATE INDEX IF NOT EXISTS idx_public_office_comp_role_patterns
  ON public.public_office_compensation USING gin(role_patterns);

DROP TRIGGER IF EXISTS update_public_office_compensation_updated_at ON public.public_office_compensation;
CREATE TRIGGER update_public_office_compensation_updated_at
  BEFORE UPDATE ON public.public_office_compensation
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE VIEW public.public_current_office_compensation
WITH (security_invoker = true) AS
SELECT DISTINCT ON (country_code, jurisdiction, office_type, office_title)
  *
FROM public.public_office_compensation
WHERE date_to IS NULL OR date_to >= CURRENT_DATE
ORDER BY country_code, jurisdiction, office_type, office_title, year DESC, effective_date DESC;

CREATE OR REPLACE VIEW public.politician_current_office_compensation
WITH (security_invoker = true) AS
SELECT
  p.id AS politician_id,
  p.name AS politician_name,
  p.role AS politician_role,
  p.country_code AS politician_country_code,
  p.jurisdiction AS politician_jurisdiction,
  c.*
FROM public.politicians p
JOIN public.public_current_office_compensation c
  ON upper(p.country_code) = upper(c.country_code)
 AND (
   lower(coalesce(p.jurisdiction, 'federal')) = lower(c.jurisdiction)
   OR c.jurisdiction = 'eu'
 )
 AND (
   EXISTS (
     SELECT 1
     FROM unnest(c.role_patterns) AS pattern
     WHERE lower(coalesce(p.role, '')) = lower(pattern)
   )
   OR (
     c.office_type = 'member_of_european_parliament'
     AND lower(coalesce(p.role, '')) LIKE '%european parliament%'
   )
   OR (
     c.office_type = 'member_of_parliament'
     AND (
       lower(coalesce(p.role, '')) LIKE '%member of parliament%'
       OR lower(coalesce(p.role, '')) LIKE '%member of bundestag%'
       OR lower(coalesce(p.role, '')) LIKE '%deputy%'
     )
   )
   OR (
     c.office_type = 'senator'
     AND (
       lower(coalesce(p.role, '')) LIKE '%senator%'
       OR lower(coalesce(p.role, '')) LIKE '%senate%'
     )
   )
   OR (
     c.office_type = 'head_of_government'
     AND lower(coalesce(p.role, '')) = 'head of government'
   )
   OR (
     c.office_type = 'head_of_state'
     AND lower(coalesce(p.role, '')) = 'head of state'
   )
 );
