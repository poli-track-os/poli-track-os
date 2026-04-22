ALTER TABLE public.proposals
  ADD COLUMN IF NOT EXISTS entity_id uuid REFERENCES public.entities(id);

CREATE UNIQUE INDEX IF NOT EXISTS proposals_entity_id_uidx
  ON public.proposals (entity_id)
  WHERE entity_id IS NOT NULL;
