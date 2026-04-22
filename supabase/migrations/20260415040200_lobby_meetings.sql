-- Lobby meetings between lobby organisations and politicians.
--
-- Source: EU Commission publishes cabinet meetings since 2014. Individual MEP
-- meetings are declared voluntarily since 2019 for rapporteurs/shadows on
-- specific files. Parltrack has parsed both.
--
-- (lobby_id, politician_id, meeting_date, subject) is the idempotency key.
-- politician_id can be NULL for cabinet-level meetings that are attributed
-- to a Commissioner, Director-General, or full cabinet rather than an MEP
-- we track.

CREATE TABLE IF NOT EXISTS public.lobby_meetings (
  id                    uuid primary key default gen_random_uuid(),
  lobby_id              uuid references public.lobby_organisations(id) on delete set null,
  politician_id         uuid references public.politicians(id) on delete set null,
  meeting_date          date not null,
  subject               text,
  commissioner_org      text,
  role_of_politician    text,
  data_source           text not null,
  source_url            text,
  fetched_at            timestamptz not null default now(),
  created_at            timestamptz not null default now(),
  UNIQUE (lobby_id, politician_id, meeting_date, subject)
);

CREATE INDEX IF NOT EXISTS lobby_meetings_politician_idx ON public.lobby_meetings (politician_id);
CREATE INDEX IF NOT EXISTS lobby_meetings_lobby_idx      ON public.lobby_meetings (lobby_id);
CREATE INDEX IF NOT EXISTS lobby_meetings_date_idx       ON public.lobby_meetings (meeting_date);

ALTER TABLE public.lobby_meetings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Lobby meetings are viewable by everyone"
  ON public.lobby_meetings
  FOR SELECT
  USING (true);
