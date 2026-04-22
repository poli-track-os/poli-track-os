-- Typed directed relationships between entities, with bitemporal fields.
--
-- subject --predicate--> object
-- valid_from/valid_to describe when the relationship was TRUE in the world.
-- observed_at describes when we learned about it.
-- A NULL valid_to means "currently true, end unknown".
--
-- Predicates are free-form text (like `kind` on entities) so new edge types
-- can be added without DDL. A non-exhaustive check keeps the set sane.
--
-- The unique constraint on (subject_id, predicate, object_id, valid_from)
-- allows the same A→B edge to exist multiple times with different valid_from
-- windows (e.g. Jane was a member of Committee X during 2019-2024 and again
-- during 2025-present).

CREATE TABLE IF NOT EXISTS public.relationships (
  id           uuid primary key default gen_random_uuid(),
  subject_id   uuid not null references public.entities(id) on delete cascade,
  predicate    text not null,
  object_id    uuid not null references public.entities(id) on delete cascade,
  valid_from   timestamptz,
  valid_to     timestamptz,
  strength     numeric,
  role         text,
  context      text,
  data_source  text not null,
  source_url   text,
  trust_level  smallint check (trust_level between 1 and 4),
  observed_at  timestamptz not null default now(),
  CONSTRAINT relationships_not_self CHECK (subject_id <> object_id),
  UNIQUE (subject_id, predicate, object_id, valid_from)
);

CREATE INDEX IF NOT EXISTS relationships_subject_idx   ON public.relationships (subject_id, predicate);
CREATE INDEX IF NOT EXISTS relationships_object_idx    ON public.relationships (object_id, predicate);
CREATE INDEX IF NOT EXISTS relationships_predicate_idx ON public.relationships (predicate);
CREATE INDEX IF NOT EXISTS relationships_valid_idx     ON public.relationships (valid_from, valid_to);

ALTER TABLE public.relationships ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Relationships are viewable by everyone"
  ON public.relationships
  FOR SELECT
  USING (true);

COMMENT ON TABLE public.relationships IS
  'Typed directed graph edges between entities with bitemporal fields and provenance.';
