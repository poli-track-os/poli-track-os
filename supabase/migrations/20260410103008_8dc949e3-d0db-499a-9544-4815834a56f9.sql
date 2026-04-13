
CREATE TABLE public.politician_positions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  politician_id UUID NOT NULL REFERENCES public.politicians(id) ON DELETE CASCADE,
  
  -- Political Compass axes (-10 to +10)
  economic_score NUMERIC DEFAULT 0,  -- -10 = far left, +10 = far right
  social_score NUMERIC DEFAULT 0,    -- -10 = libertarian, +10 = authoritarian
  
  -- Additional political axes (-10 to +10)
  eu_integration_score NUMERIC DEFAULT 0,  -- -10 = eurosceptic, +10 = pro-EU
  environmental_score NUMERIC DEFAULT 0,   -- -10 = anti-green, +10 = pro-green
  immigration_score NUMERIC DEFAULT 0,     -- -10 = restrictive, +10 = open

  -- Policy domain priorities (0-10 scale, how much they prioritize each)
  education_priority NUMERIC DEFAULT 5,
  science_priority NUMERIC DEFAULT 5,
  healthcare_priority NUMERIC DEFAULT 5,
  defense_priority NUMERIC DEFAULT 5,
  economy_priority NUMERIC DEFAULT 5,
  justice_priority NUMERIC DEFAULT 5,
  social_welfare_priority NUMERIC DEFAULT 5,
  environment_priority NUMERIC DEFAULT 5,

  -- Descriptive
  ideology_label TEXT,  -- e.g. "Social Democrat", "Green Liberal"
  key_positions JSONB DEFAULT '{}',  -- specific stances: {"minimum_wage": "pro", "nuclear_energy": "against", ...}
  data_source TEXT DEFAULT 'party_mapping',
  
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  
  UNIQUE(politician_id)
);

ALTER TABLE public.politician_positions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Positions are publicly readable"
ON public.politician_positions
FOR SELECT
TO public
USING (true);

CREATE TRIGGER update_politician_positions_updated_at
BEFORE UPDATE ON public.politician_positions
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
