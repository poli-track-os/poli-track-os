
CREATE TABLE public.proposals (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  official_title TEXT,
  status TEXT NOT NULL DEFAULT 'committee',
  proposal_type TEXT NOT NULL DEFAULT 'bill',
  jurisdiction TEXT NOT NULL DEFAULT 'federal',
  country_code TEXT NOT NULL DEFAULT 'EU',
  country_name TEXT NOT NULL DEFAULT 'European Union',
  vote_date DATE,
  submitted_date DATE NOT NULL DEFAULT CURRENT_DATE,
  sponsors TEXT[] DEFAULT '{}',
  affected_laws TEXT[] DEFAULT '{}',
  evidence_count INTEGER DEFAULT 0,
  summary TEXT,
  policy_area TEXT,
  source_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.proposals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Proposals are publicly readable"
ON public.proposals
FOR SELECT
TO public
USING (true);

CREATE INDEX idx_proposals_country ON public.proposals(country_code);
CREATE INDEX idx_proposals_status ON public.proposals(status);
CREATE INDEX idx_proposals_policy_area ON public.proposals(policy_area);

CREATE TRIGGER update_proposals_updated_at
BEFORE UPDATE ON public.proposals
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
