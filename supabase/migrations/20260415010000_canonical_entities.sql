-- Canonical entity table. One row per thing we care about, regardless of kind.
-- Existing tables (politicians, proposals, country_metadata, ...) keep working as
-- domain-specific views, but every row in those tables now projects into one
-- entities row so the rest of the platform (relationships, claims, entity cards,
-- LLM navigation) can treat the world as a graph.
--
-- Design notes:
--   - `kind` is a text column, not an enum, so new kinds can be added without
--     a DDL migration. Enforcement is via indexed lookup + check constraint.
--   - (kind, slug) is the stable URL key for /entity/:kind/:slug routes.
--   - first_seen_at/last_seen_at track our OBSERVATION window; valid-time
--     semantics for facts ABOUT an entity live in `claims` and `relationships`.

CREATE TABLE IF NOT EXISTS public.entities (
  id             uuid primary key default gen_random_uuid(),
  kind           text not null,
  canonical_name text not null,
  slug           text not null,
  summary        text,
  first_seen_at  timestamptz not null default now(),
  last_seen_at   timestamptz not null default now(),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  CONSTRAINT entities_kind_check CHECK (kind IN (
    'person', 'party', 'country', 'committee', 'proposal',
    'lobby_org', 'gov_agency', 'budget_function', 'media_outlet',
    'event', 'document', 'unknown'
  )),
  UNIQUE (kind, slug)
);

CREATE INDEX IF NOT EXISTS entities_kind_idx ON public.entities (kind);
CREATE INDEX IF NOT EXISTS entities_slug_idx ON public.entities (slug);
CREATE INDEX IF NOT EXISTS entities_canonical_name_lower_idx ON public.entities (lower(canonical_name));

ALTER TABLE public.entities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Entities are viewable by everyone"
  ON public.entities
  FOR SELECT
  USING (true);

CREATE TRIGGER update_entities_updated_at
  BEFORE UPDATE ON public.entities
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

COMMENT ON TABLE public.entities IS
  'Canonical entities. Every tracked thing has exactly one row here, regardless of kind. Existing domain tables project into this via entity_id columns.';
