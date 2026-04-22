-- COFOG reference table + seed. The 11 canonical function codes Eurostat
-- publishes for gov_10a_exp at the top level.
--
-- Source for labels: UN Classification of the Functions of Government,
-- 1999 revision (COFOG99). Labels match Eurostat dictionary at
-- https://ec.europa.eu/eurostat/web/products-manuals-and-guidelines/-/ks-ra-11-013

CREATE TABLE IF NOT EXISTS public.cofog_functions (
  code        text primary key,
  label       text not null,
  description text,
  icon        text,
  color       text,
  sort_order  smallint not null
);

ALTER TABLE public.cofog_functions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "COFOG functions are viewable by everyone"
  ON public.cofog_functions
  FOR SELECT
  USING (true);

INSERT INTO public.cofog_functions (code, label, description, icon, color, sort_order) VALUES
  ('GFTOT', 'Total expenditure',         'All general government expenditure.',                                     'Landmark',     'hsl(220, 20%, 35%)', 0),
  ('GF01',  'General public services',   'Executive, legislative, financial and fiscal affairs, external affairs.', 'Building2',    'hsl(215, 40%, 45%)', 1),
  ('GF02',  'Defence',                   'Military, civil defence, foreign military aid, R&D on defence.',          'Shield',       'hsl(0, 60%, 45%)',   2),
  ('GF03',  'Public order and safety',   'Police, fire, law courts, prisons.',                                      'Scale',        'hsl(25, 70%, 50%)',  3),
  ('GF04',  'Economic affairs',          'General economic, labour, agriculture, fuel, mining, transport, R&D.',    'TrendingUp',   'hsl(190, 55%, 45%)', 4),
  ('GF05',  'Environmental protection',  'Waste management, pollution abatement, biodiversity, R&D on env.',        'Leaf',         'hsl(130, 55%, 40%)', 5),
  ('GF06',  'Housing and community',     'Housing development, water supply, street lighting, community dev.',      'Home',         'hsl(280, 35%, 50%)', 6),
  ('GF07',  'Health',                    'Medical products, outpatient, hospital, public health services, R&D.',    'HeartPulse',   'hsl(340, 65%, 50%)', 7),
  ('GF08',  'Recreation, culture, religion', 'Recreational, sporting, cultural, broadcasting, religion.',           'Music',        'hsl(260, 55%, 55%)', 8),
  ('GF09',  'Education',                 'Pre-primary through tertiary, subsidiary services, R&D.',                 'GraduationCap','hsl(45, 80%, 50%)',  9),
  ('GF10',  'Social protection',         'Sickness, disability, old age, family, unemployment, housing, social exclusion.', 'Users', 'hsl(160, 50%, 45%)', 10)
ON CONFLICT (code) DO UPDATE SET
  label       = EXCLUDED.label,
  description = EXCLUDED.description,
  icon        = EXCLUDED.icon,
  color       = EXCLUDED.color,
  sort_order  = EXCLUDED.sort_order;
