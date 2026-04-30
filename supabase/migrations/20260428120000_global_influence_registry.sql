-- Global influence registry v1.
--
-- This adds a normalized influence layer beside the older EU-only
-- lobby_organisations/lobby_spend/lobby_meetings tables. The model is source
-- centric: every row carries provenance and raw payloads so source-specific
-- ingesters can stay simple and reversible.

ALTER TYPE public.data_source_type ADD VALUE IF NOT EXISTS 'us_lda';
ALTER TYPE public.data_source_type ADD VALUE IF NOT EXISTS 'us_fara';
ALTER TYPE public.data_source_type ADD VALUE IF NOT EXISTS 'eu_transparency_register';
ALTER TYPE public.data_source_type ADD VALUE IF NOT EXISTS 'opensanctions';
ALTER TYPE public.data_source_type ADD VALUE IF NOT EXISTS 'wikidata_affiliation';
ALTER TYPE public.data_source_type ADD VALUE IF NOT EXISTS 'curated_influence_media';

ALTER TABLE public.entities
  DROP CONSTRAINT IF EXISTS entities_kind_check;

ALTER TABLE public.entities
  ADD CONSTRAINT entities_kind_check CHECK (kind IN (
    'person', 'party', 'country', 'committee', 'proposal',
    'lobby_org', 'gov_agency', 'budget_function', 'media_outlet',
    'event', 'document', 'company', 'business_person',
    'foreign_principal', 'religious_org', 'unknown'
  ));

CREATE TABLE IF NOT EXISTS public.influence_actors (
  id                    uuid primary key default gen_random_uuid(),
  entity_id             uuid references public.entities(id) on delete set null,
  actor_kind            text not null CHECK (actor_kind IN (
                          'person', 'organisation', 'company', 'foreign_principal',
                          'state_body', 'religious_org', 'media', 'other'
                        )),
  name                  text not null,
  normalized_name       text not null,
  country_code          text,
  country_name          text,
  jurisdiction          text,
  sector                text,
  description           text,
  website               text,
  is_pep                boolean not null default false,
  is_state_linked       boolean not null default false,
  external_id           text,
  data_source           text not null,
  source_url            text,
  trust_level           smallint check (trust_level between 1 and 4),
  raw_data              jsonb not null default '{}'::jsonb,
  fetched_at            timestamptz not null default now(),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  UNIQUE (data_source, external_id)
);

CREATE INDEX IF NOT EXISTS influence_actors_name_idx ON public.influence_actors (lower(name));
CREATE INDEX IF NOT EXISTS influence_actors_kind_idx ON public.influence_actors (actor_kind);
CREATE INDEX IF NOT EXISTS influence_actors_country_idx ON public.influence_actors (country_code);
CREATE INDEX IF NOT EXISTS influence_actors_entity_idx ON public.influence_actors (entity_id);

ALTER TABLE public.influence_actors ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Influence actors are viewable by everyone"
  ON public.influence_actors
  FOR SELECT
  USING (true);

CREATE TRIGGER update_influence_actors_updated_at
  BEFORE UPDATE ON public.influence_actors
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.companies (
  id                    uuid primary key default gen_random_uuid(),
  entity_id             uuid references public.entities(id) on delete set null,
  name                  text not null,
  normalized_name       text not null,
  dedupe_key            text not null,
  registry              text not null,
  jurisdiction_code     text,
  company_number        text,
  legal_form            text,
  status                text,
  sector                text,
  incorporation_date    date,
  dissolution_date      date,
  website               text,
  source_url            text,
  data_source           text not null default 'opencorporates',
  raw_data              jsonb not null default '{}'::jsonb,
  fetched_at            timestamptz not null default now(),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  UNIQUE (registry, jurisdiction_code, company_number),
  UNIQUE (registry, jurisdiction_code, dedupe_key)
);

CREATE INDEX IF NOT EXISTS companies_name_idx ON public.companies (lower(name));
CREATE INDEX IF NOT EXISTS companies_jurisdiction_idx ON public.companies (jurisdiction_code);
CREATE INDEX IF NOT EXISTS companies_entity_idx ON public.companies (entity_id);

ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Companies are viewable by everyone"
  ON public.companies
  FOR SELECT
  USING (true);

CREATE TRIGGER update_companies_updated_at
  BEFORE UPDATE ON public.companies
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.company_officers (
  id                    uuid primary key default gen_random_uuid(),
  company_id            uuid not null references public.companies(id) on delete cascade,
  actor_id              uuid references public.influence_actors(id) on delete set null,
  name                  text not null,
  role                  text not null,
  start_date            date,
  end_date              date,
  source_url            text,
  data_source           text not null,
  content_hash          text not null default '',
  raw_data              jsonb not null default '{}'::jsonb,
  fetched_at            timestamptz not null default now(),
  created_at            timestamptz not null default now(),
  UNIQUE (company_id, name, role, start_date, data_source),
  UNIQUE (data_source, content_hash)
);

CREATE INDEX IF NOT EXISTS company_officers_company_idx ON public.company_officers (company_id);
CREATE INDEX IF NOT EXISTS company_officers_actor_idx ON public.company_officers (actor_id);
CREATE INDEX IF NOT EXISTS company_officers_name_idx ON public.company_officers (lower(name));

ALTER TABLE public.company_officers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Company officers are viewable by everyone"
  ON public.company_officers
  FOR SELECT
  USING (true);

CREATE TABLE IF NOT EXISTS public.beneficial_ownership (
  id                    uuid primary key default gen_random_uuid(),
  owned_company_id      uuid not null references public.companies(id) on delete cascade,
  owner_actor_id        uuid references public.influence_actors(id) on delete set null,
  owner_company_id      uuid references public.companies(id) on delete set null,
  ownership_percent     numeric,
  control_type          text,
  valid_from            date,
  valid_to              date,
  source_url            text,
  data_source           text not null,
  trust_level           smallint check (trust_level between 1 and 4),
  content_hash          text not null default '',
  raw_data              jsonb not null default '{}'::jsonb,
  fetched_at            timestamptz not null default now(),
  created_at            timestamptz not null default now(),
  CHECK (owner_actor_id IS NOT NULL OR owner_company_id IS NOT NULL),
  UNIQUE (data_source, content_hash)
);

CREATE INDEX IF NOT EXISTS beneficial_ownership_owned_company_idx ON public.beneficial_ownership (owned_company_id);
CREATE INDEX IF NOT EXISTS beneficial_ownership_owner_actor_idx ON public.beneficial_ownership (owner_actor_id);
CREATE INDEX IF NOT EXISTS beneficial_ownership_owner_company_idx ON public.beneficial_ownership (owner_company_id);

ALTER TABLE public.beneficial_ownership ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Beneficial ownership is viewable by everyone"
  ON public.beneficial_ownership
  FOR SELECT
  USING (true);

CREATE TABLE IF NOT EXISTS public.influence_clients (
  id                    uuid primary key default gen_random_uuid(),
  entity_id             uuid references public.entities(id) on delete set null,
  actor_id              uuid references public.influence_actors(id) on delete set null,
  company_id            uuid references public.companies(id) on delete set null,
  external_client_id    text,
  name                  text not null,
  normalized_name       text not null,
  client_kind           text not null default 'organisation',
  country_code          text,
  country_name          text,
  principal_country_code text,
  principal_country_name text,
  sector                text,
  is_foreign_principal  boolean not null default false,
  data_source           text not null,
  source_url            text,
  trust_level           smallint check (trust_level between 1 and 4),
  raw_data              jsonb not null default '{}'::jsonb,
  fetched_at            timestamptz not null default now(),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  UNIQUE (data_source, external_client_id)
);

CREATE INDEX IF NOT EXISTS influence_clients_name_idx ON public.influence_clients (lower(name));
CREATE INDEX IF NOT EXISTS influence_clients_country_idx ON public.influence_clients (country_code);
CREATE INDEX IF NOT EXISTS influence_clients_principal_country_idx ON public.influence_clients (principal_country_code);
CREATE INDEX IF NOT EXISTS influence_clients_actor_idx ON public.influence_clients (actor_id);
CREATE INDEX IF NOT EXISTS influence_clients_company_idx ON public.influence_clients (company_id);

ALTER TABLE public.influence_clients ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Influence clients are viewable by everyone"
  ON public.influence_clients
  FOR SELECT
  USING (true);

CREATE TRIGGER update_influence_clients_updated_at
  BEFORE UPDATE ON public.influence_clients
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.influence_filings (
  id                    uuid primary key default gen_random_uuid(),
  filing_id             text not null,
  filing_type           text not null CHECK (filing_type IN (
                          'us_lda', 'us_fara', 'eu_transparency',
                          'opencorporates', 'opensanctions', 'curated_media',
                          'other'
                        )),
  registrant_actor_id   uuid references public.influence_actors(id) on delete set null,
  registrant_name       text,
  client_id             uuid references public.influence_clients(id) on delete set null,
  client_name           text,
  principal_country_code text,
  principal_country_name text,
  year                  integer,
  quarter               integer,
  period_start          date,
  period_end            date,
  issue_areas           text[] not null default '{}',
  target_institutions   text[] not null default '{}',
  amount_reported       numeric,
  amount_low            numeric,
  amount_high           numeric,
  currency              text not null default 'USD',
  description           text,
  source_url            text,
  data_source           text not null,
  trust_level           smallint check (trust_level between 1 and 4),
  raw_data              jsonb not null default '{}'::jsonb,
  fetched_at            timestamptz not null default now(),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  UNIQUE (data_source, filing_id)
);

CREATE INDEX IF NOT EXISTS influence_filings_type_idx ON public.influence_filings (filing_type);
CREATE INDEX IF NOT EXISTS influence_filings_client_idx ON public.influence_filings (client_id);
CREATE INDEX IF NOT EXISTS influence_filings_registrant_idx ON public.influence_filings (registrant_actor_id);
CREATE INDEX IF NOT EXISTS influence_filings_principal_country_idx ON public.influence_filings (principal_country_code);
CREATE INDEX IF NOT EXISTS influence_filings_year_idx ON public.influence_filings (year);

ALTER TABLE public.influence_filings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Influence filings are viewable by everyone"
  ON public.influence_filings
  FOR SELECT
  USING (true);

CREATE TRIGGER update_influence_filings_updated_at
  BEFORE UPDATE ON public.influence_filings
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.influence_contacts (
  id                    uuid primary key default gen_random_uuid(),
  filing_id             uuid references public.influence_filings(id) on delete set null,
  lobby_actor_id        uuid references public.influence_actors(id) on delete set null,
  client_id             uuid references public.influence_clients(id) on delete set null,
  target_politician_id  uuid references public.politicians(id) on delete set null,
  target_actor_id       uuid references public.influence_actors(id) on delete set null,
  target_name           text,
  target_institution    text,
  target_country_code   text,
  contact_date          date,
  contact_type          text not null default 'unknown',
  subject               text,
  location              text,
  source_url            text,
  data_source           text not null,
  trust_level           smallint check (trust_level between 1 and 4),
  content_hash          text not null default '',
  raw_data              jsonb not null default '{}'::jsonb,
  fetched_at            timestamptz not null default now(),
  created_at            timestamptz not null default now(),
  UNIQUE (data_source, content_hash)
);

CREATE INDEX IF NOT EXISTS influence_contacts_filing_idx ON public.influence_contacts (filing_id);
CREATE INDEX IF NOT EXISTS influence_contacts_lobby_actor_idx ON public.influence_contacts (lobby_actor_id);
CREATE INDEX IF NOT EXISTS influence_contacts_target_politician_idx ON public.influence_contacts (target_politician_id);
CREATE INDEX IF NOT EXISTS influence_contacts_target_actor_idx ON public.influence_contacts (target_actor_id);
CREATE INDEX IF NOT EXISTS influence_contacts_country_idx ON public.influence_contacts (target_country_code);
CREATE INDEX IF NOT EXISTS influence_contacts_institution_idx ON public.influence_contacts (target_institution);
CREATE INDEX IF NOT EXISTS influence_contacts_date_idx ON public.influence_contacts (contact_date);

ALTER TABLE public.influence_contacts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Influence contacts are viewable by everyone"
  ON public.influence_contacts
  FOR SELECT
  USING (true);

CREATE TABLE IF NOT EXISTS public.influence_money (
  id                    uuid primary key default gen_random_uuid(),
  filing_id             uuid references public.influence_filings(id) on delete set null,
  payer_client_id       uuid references public.influence_clients(id) on delete set null,
  payer_actor_id        uuid references public.influence_actors(id) on delete set null,
  recipient_actor_id    uuid references public.influence_actors(id) on delete set null,
  recipient_company_id  uuid references public.companies(id) on delete set null,
  money_type            text not null CHECK (money_type IN (
                          'spend', 'payment', 'income', 'expense', 'contract', 'donation', 'other'
                        )),
  amount_low            numeric,
  amount_high           numeric,
  amount_exact          numeric,
  currency              text not null default 'USD',
  period_start          date,
  period_end            date,
  description           text,
  source_url            text,
  data_source           text not null,
  trust_level           smallint check (trust_level between 1 and 4),
  content_hash          text not null default '',
  raw_data              jsonb not null default '{}'::jsonb,
  fetched_at            timestamptz not null default now(),
  created_at            timestamptz not null default now(),
  UNIQUE (data_source, content_hash)
);

CREATE INDEX IF NOT EXISTS influence_money_filing_idx ON public.influence_money (filing_id);
CREATE INDEX IF NOT EXISTS influence_money_payer_client_idx ON public.influence_money (payer_client_id);
CREATE INDEX IF NOT EXISTS influence_money_recipient_actor_idx ON public.influence_money (recipient_actor_id);
CREATE INDEX IF NOT EXISTS influence_money_type_idx ON public.influence_money (money_type);
CREATE INDEX IF NOT EXISTS influence_money_period_idx ON public.influence_money (period_start, period_end);

ALTER TABLE public.influence_money ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Influence money is viewable by everyone"
  ON public.influence_money
  FOR SELECT
  USING (true);

CREATE TABLE IF NOT EXISTS public.public_affiliations (
  id                    uuid primary key default gen_random_uuid(),
  subject_politician_id uuid references public.politicians(id) on delete cascade,
  subject_actor_id      uuid references public.influence_actors(id) on delete cascade,
  affiliation_type      text not null CHECK (affiliation_type IN (
                          'religion', 'sect', 'denomination', 'religious_org', 'other'
                        )),
  affiliation_label     text not null,
  affiliation_entity_id uuid references public.entities(id) on delete set null,
  affiliation_actor_id  uuid references public.influence_actors(id) on delete set null,
  claim_text            text,
  review_status         text not null default 'pending' CHECK (review_status IN (
                          'pending', 'approved', 'rejected'
                        )),
  visible               boolean not null default false,
  data_source           text not null,
  source_url            text not null,
  source_title          text,
  trust_level           smallint check (trust_level between 1 and 4),
  confidence            numeric CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1)),
  reviewed_by           text,
  reviewed_at           timestamptz,
  content_hash          text not null default '',
  raw_data              jsonb not null default '{}'::jsonb,
  fetched_at            timestamptz not null default now(),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  CHECK (subject_politician_id IS NOT NULL OR subject_actor_id IS NOT NULL),
  UNIQUE (data_source, content_hash)
);

CREATE INDEX IF NOT EXISTS public_affiliations_subject_politician_idx ON public.public_affiliations (subject_politician_id);
CREATE INDEX IF NOT EXISTS public_affiliations_subject_actor_idx ON public.public_affiliations (subject_actor_id);
CREATE INDEX IF NOT EXISTS public_affiliations_status_idx ON public.public_affiliations (review_status, visible);

ALTER TABLE public.public_affiliations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Only approved visible affiliations are public"
  ON public.public_affiliations
  FOR SELECT
  USING (visible = true AND review_status = 'approved');

CREATE TRIGGER update_public_affiliations_updated_at
  BEFORE UPDATE ON public.public_affiliations
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE VIEW public.influence_registry_overview AS
SELECT
  (SELECT count(*) FROM public.influence_filings) AS filings_total,
  (SELECT count(*) FROM public.influence_clients) AS clients_total,
  (SELECT count(*) FROM public.influence_actors) AS actors_total,
  (SELECT count(*) FROM public.companies) AS companies_total,
  (SELECT count(*) FROM public.influence_contacts) AS contacts_total,
  (SELECT count(*) FROM public.influence_money) AS money_rows_total,
  (SELECT coalesce(sum(coalesce(amount_exact, amount_high, amount_low)), 0) FROM public.influence_money) AS recorded_amount_total;

CREATE OR REPLACE VIEW public.public_affiliations_visible AS
SELECT *
FROM public.public_affiliations
WHERE visible = true
  AND review_status = 'approved';

GRANT SELECT ON public.influence_registry_overview TO anon, authenticated, service_role;
GRANT SELECT ON public.public_affiliations_visible TO anon, authenticated, service_role;

COMMENT ON TABLE public.public_affiliations IS
  'Publicly sourced sensitive affiliation claims. Rows are hidden by default and only approved visible claims are readable through public roles.';
