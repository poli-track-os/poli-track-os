
CREATE TABLE public.politician_associations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  politician_id UUID NOT NULL REFERENCES public.politicians(id) ON DELETE CASCADE,
  associate_id UUID NOT NULL REFERENCES public.politicians(id) ON DELETE CASCADE,
  relationship_type TEXT NOT NULL DEFAULT 'party_ally',
  strength NUMERIC NOT NULL DEFAULT 5,
  context TEXT,
  is_domestic BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  
  UNIQUE(politician_id, associate_id)
);

CREATE INDEX idx_associations_politician ON public.politician_associations(politician_id);
CREATE INDEX idx_associations_associate ON public.politician_associations(associate_id);

ALTER TABLE public.politician_associations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Associations are publicly readable"
ON public.politician_associations
FOR SELECT
TO public
USING (true);
