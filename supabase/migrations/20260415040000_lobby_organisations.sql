-- Lobby organisations canonical table (EU Transparency Register).
-- One row per registered lobbyist/NGO/consultancy/corp.

CREATE TABLE IF NOT EXISTS public.lobby_organisations (
  id                    uuid primary key default gen_random_uuid(),
  transparency_id       text unique not null,
  name                  text not null,
  legal_name            text,
  category              text,
  subcategory           text,
  country_of_hq         text,
  website               text,
  registered_at         date,
  last_updated_tr       date,
  accreditation_count   integer,
  data_source           text not null default 'transparency_register',
  source_url            text,
  fetched_at            timestamptz not null default now(),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

CREATE INDEX IF NOT EXISTS lobby_organisations_name_idx ON public.lobby_organisations (lower(name));
CREATE INDEX IF NOT EXISTS lobby_organisations_category_idx ON public.lobby_organisations (category);

ALTER TABLE public.lobby_organisations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Lobby organisations are viewable by everyone"
  ON public.lobby_organisations
  FOR SELECT
  USING (true);

CREATE TRIGGER update_lobby_organisations_updated_at
  BEFORE UPDATE ON public.lobby_organisations
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
