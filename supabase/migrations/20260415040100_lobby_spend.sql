-- Lobby spending time series (Transparency Register self-declared + LobbyFacts).
--
-- Transparency Register publishes spend as bands (e.g. 100000-199999). We
-- model as low/high numerics. LobbyFacts sometimes has exact numbers from
-- annual reports — when it does, low == high.

CREATE TABLE IF NOT EXISTS public.lobby_spend (
  id                        uuid primary key default gen_random_uuid(),
  lobby_id                  uuid not null references public.lobby_organisations(id) on delete cascade,
  year                      integer not null,
  declared_amount_eur_low   numeric,
  declared_amount_eur_high  numeric,
  full_time_equivalents     numeric,
  category_breakdown        jsonb,
  data_source               text not null,
  source_url                text,
  fetched_at                timestamptz not null default now(),
  created_at                timestamptz not null default now(),
  UNIQUE (lobby_id, year, data_source)
);

CREATE INDEX IF NOT EXISTS lobby_spend_lobby_year_idx ON public.lobby_spend (lobby_id, year);
CREATE INDEX IF NOT EXISTS lobby_spend_year_idx       ON public.lobby_spend (year);

ALTER TABLE public.lobby_spend ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Lobby spend is viewable by everyone"
  ON public.lobby_spend
  FOR SELECT
  USING (true);
