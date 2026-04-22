-- Entity aliases: alternate names and cross-source identifiers.
--
-- Scheme examples:
--   'wikidata'              -> Q-id from Wikidata
--   'ep_mep'                -> numeric MEP id from europarl.europa.eu
--   'iso3166_1_a2'          -> ISO 3166-1 alpha-2 country code
--   'transparency_register' -> Transparency Register ID for a lobby org
--   'parltrack'             -> Parltrack's internal MEP or dossier id
--   'twitter_handle'        -> @handle without the @
--   'website_domain'        -> lobby/NGO homepage hostname
--   'opencorporates'        -> jurisdiction:company_number
--   'name'                  -> a normalized display name used for fuzzy lookup
--
-- (scheme, value) is globally unique: the Wikidata QID "Q2062" resolves to
-- exactly one entity regardless of kind. Multiple aliases per entity are
-- expected (a politician has a Wikidata id AND an EP MEP id AND a Twitter
-- handle). Aliases can carry their own valid_from/valid_to (a Twitter
-- handle might be valid only for 2019-2023).

CREATE TABLE IF NOT EXISTS public.entity_aliases (
  id          uuid primary key default gen_random_uuid(),
  entity_id   uuid not null references public.entities(id) on delete cascade,
  scheme      text not null,
  value       text not null,
  valid_from  date,
  valid_to    date,
  source      text,
  trust_level smallint check (trust_level between 1 and 4),
  created_at  timestamptz not null default now(),
  UNIQUE (scheme, value)
);

CREATE INDEX IF NOT EXISTS entity_aliases_entity_idx ON public.entity_aliases (entity_id);
CREATE INDEX IF NOT EXISTS entity_aliases_scheme_idx ON public.entity_aliases (scheme);

ALTER TABLE public.entity_aliases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Entity aliases are viewable by everyone"
  ON public.entity_aliases
  FOR SELECT
  USING (true);
