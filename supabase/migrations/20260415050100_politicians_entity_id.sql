-- Add entity_id FK to politicians. Populated by the seed-entities function
-- in Phase 3. Until then, NULL is allowed so existing rows don't break.

ALTER TABLE public.politicians
  ADD COLUMN IF NOT EXISTS entity_id uuid REFERENCES public.entities(id);

CREATE UNIQUE INDEX IF NOT EXISTS politicians_entity_id_uidx
  ON public.politicians (entity_id)
  WHERE entity_id IS NOT NULL;
