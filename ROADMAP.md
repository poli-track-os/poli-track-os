# Poli-Track Roadmap — Unified Political Data Platform

> **Status**: planning doc, not yet executed.
> **Owner**: @poli-track-os maintainers.
> **Last revised**: 2026-04-15.

This is the canonical "where the platform is going" document. It replaces the ad-hoc fix lists that preceded it. Everything below is scoped, prioritized, and tagged with the work it depends on. When a task is done, move it to `CHANGELOG.md` with a one-line "how it was verified".

---

## 0. Vision

Poli-Track is a **unified, time-based, LLM-navigable knowledge layer over European political data**. Every fact we care about is one of three things:

1. **An entity** — a politician, party, country, committee, proposal, lobby organization, government agency, budget function, news outlet, etc.
2. **A relationship between entities** — valid over some time window, with a source and a confidence.
3. **A claim about an entity** — a key/value assertion, valid over some time window, with a source and a confidence.

The product is the frontend that lets a human or an LLM navigate those three things across sources that today live in 20 different silos: Eurostat, Transparency Register, LobbyFacts, Parltrack, Integrity Watch EU, the EP directory, Wikipedia/Wikidata, national rosters, GDELT, historical Twitter dumps, EUR-Lex, ministry-of-finance budget PDFs, and so on.

**The product thesis**: if you're a journalist, researcher, activist, or an LLM agent, you should be able to ask any of these questions and get a grounded answer in one place:

- "What is the legislative, financial, and public-communication record of MEP X since 2019?"
- "Which lobby organisations met with MEP Y most often, and what did Y vote on afterwards?"
- "How has country Z's health budget evolved, and which parties were in government at each turn?"
- "Show me every proposal that touched the word 'digital services act', who sponsored it, who lobbied on it, and how each member voted."
- "Give me a graph of every relationship between the 50 most-tracked politicians."

None of those are exotic; they're just currently impossible without a week of manual work.

---

## 1. Architectural principles

### 1.1 Time-based ontology — every fact has a valid-time and a tx-time

Every row in every table that represents a fact or a relationship carries **two time dimensions**:

- `valid_from`, `valid_to` — when the fact was TRUE in the world. `valid_to IS NULL` means "currently true, end unknown". Example: "Jane Doe was Minister of Health from 2020-01-01 to 2023-06-30".
- `observed_at` (or `created_at` — existing column) — when WE first recorded the fact. Gives us a bitemporal model without the machinery of a full bitemporal database.

This lets us:
- Reconstruct the state of the world at any date in the past ("who was minister of X on 2022-09-03?").
- Distinguish "we learned X today" from "X happened today".
- Detect when a source retroactively changes — the new record supersedes with a new `valid_from` / `valid_to`, we keep both.

### 1.2 Provenance-first — every fact carries a source

Every row points back to:
- `data_source` (enum of the systems we ingest from)
- `source_url` (the exact document/URL we pulled it from)
- `trust_level` (1–4 as already defined)
- For LLM-extracted claims: `extraction_model`, `extraction_prompt_hash`, `extraction_confidence`.

A fact without provenance is a bug. A fact with only the word "Wikipedia" is almost a bug — it should be a URL and a section.

### 1.3 Graph-ready — one canonical entity table, one canonical relationship table

Today we have `politicians`, `politician_associations`, `proposals`, `country_metadata`. That's fine for the current product but doesn't compose. We add:

- `entities` — one row per canonical thing regardless of kind
- `entity_aliases` — alternate names and IDs per entity (wikidata QID, MEP external_id, country ISO2, Transparency Register ID, Twitter handle, etc.)
- `relationships` — typed edges between entities with time and provenance
- `claims` — typed key/value facts about an entity with time and provenance
- `sources` — one row per document/URL we've ever fetched

Existing tables (`politicians`, `political_events`, `proposals`, ...) become **projections** over the canonical graph. They keep working for the current UI; we add new views and APIs that expose the graph directly.

### 1.4 LLM-navigable — every entity gets a Markdown "card"

For every entity, we provide a deterministic Markdown export: header, bio, current state, timeline, relationships, provenance. Short enough to fit in an LLM prompt, rich enough to answer most questions without follow-up. Generated from the graph, cached at the entity level, invalidated when any underlying claim changes.

### 1.5 Idempotent — everything re-runnable

Every ingestion job can be re-run any number of times without duplicating data. We've already learned this the hard way with the `political_events` partial-index bug; the principle is now load-bearing.

### 1.6 Additive migrations only

Destructive schema changes require a data backfill plan and an explicit migration sequence. No `DROP COLUMN` without an audit.

### 1.7 Separation of ingest from presentation

Ingest functions write rows. The frontend reads rows. There is no "frontend computes then writes back". When we need derived data (positions, associations, coverage stats), we write a seed function that materializes it into a table.

---

## 2. Data source inventory

Status legend:

- ✅ ingested today
- 🟡 partial / broken / outdated
- ⏳ planned
- ❌ investigated and abandoned (with reason)

| # | Source | Kind | Status | Priority | Notes |
|---|---|---|---|---|---|
| S-01 | EP MEP XML directory | politicians | ✅ | existing | 718 MEPs; `scrape-eu-parliament` |
| S-02 | Wikipedia summaries + infoboxes | politician enrichment | ✅ | existing | `enrich-wikipedia`; ~722 enriched |
| S-03 | Wikidata via Wikipedia pageprops | politicians | ✅ | existing | `enrich-wikipedia` writes `external_id` from Wikidata QID |
| S-04 | Bundestag MdB Stammdaten XML | politicians (DE) | ✅ | existing | `sync-official-rosters` |
| S-05 | Assembleia biografico JSON (PT) | politicians (PT) | ✅ | existing | `sync-official-rosters` |
| S-06 | Wikipedia "Members of ..." categories | politicians (28 EU states) | ✅ | existing | `scrape-national-parliament`; not yet run for non-PT/DE |
| S-07 | EUR-Lex CELEX sector 3 via SPARQL | proposals | ✅ | existing | `scrape-eu-legislation`; 300 rows today |
| S-08 | EP press corner + news RSS | events | 🟡 | existing | `scrape-twitter`; 0 matches on current headlines due to strict name match (correct) |
| S-09 | UN Digital Library | events (UN votes) | 🟡 | existing | `scrape-un-votes`; currently 0 resolutions — upstream search page behavior |
| S-10 | EP `/main-activities/reports` | events (rapporteur) | ❌ | retired | **Upstream URL moved** — EP now 303-redirects to `/home`. To be replaced by Parltrack (S-13). |
| S-11 | EP `/declarations` page | events (financial) | ✅ | existing | `scrape-mep-declarations`; **13,009 events** after partial-index fix |
| S-12 | EP per-MEP `/home` committees | politicians.committees[] | ✅ | existing | `scrape-mep-committees`; committees[] populated. Historical `committee_join` events not populated (by-design gap after re-run). |
| S-13 | **Parltrack nightly dumps** | MEP activities, votes, amendments, dossiers, declarations | ⏳ | **Tier 1** | https://parltrack.org/dumps — JSON + LZMA. Would replace S-10, enrich S-07, and backfill historical events. |
| S-14 | **EU Transparency Register** | lobby orgs, declared spend, meetings with MEPs | ⏳ | **Tier 1** | https://ec.europa.eu/transparencyregister/public/consultation/search.do ; also bulk exports. First-class monetary signal. |
| S-15 | **LobbyFacts.eu** | lobby spend time series, processed Transparency Register | ⏳ | **Tier 1** | https://www.lobbyfacts.eu/ CSV downloads. |
| S-16 | **Eurostat COFOG** `gov_10a_exp` | government expenditure by function, per country + year | ⏳ | **Tier 1** | Eurostat Dissemination API v1.0, JSON-stat. Verified live. |
| S-17 | Eurostat `nama_10_pc` | GDP per capita | ⏳ | Tier 1 | For normalization. Retires hard-coded `EU_COUNTRY_DATA` constant. |
| S-18 | Eurostat `tps00001` / `demo_pjan` | population | ⏳ | Tier 1 | Same as above. |
| S-19 | **Integrity Watch EU** | structured side-income / gifts from MEP DPIs | ⏳ | **Tier 2** | https://www.integritywatch.eu/ — page scraping per MEP. Enriches S-11. |
| S-20 | **GDELT v2** | news events mentioning politicians | ⏳ | **Tier 2** | https://www.gdeltproject.org/ — massive open dataset, BigQuery or direct fetch. |
| S-21 | **Hansard-equivalent / parliament speech texts** | events (speech) per MEP | ⏳ | Tier 2 | Parltrack has activity items including speeches. National parliaments vary; defer beyond EP. |
| S-22 | **Historical Twitter dumps** | politician tweets 2011–2022 | ⏳ | **Tier 3** | See §5.3. Internet Archive wayback + Archive Team stream grab + academic Zenodo dumps. Raw input for LLM extraction. |
| S-23 | **LLM event extraction pipeline** | derived events from free text (tweets, speeches, news) | ⏳ | **Tier 3** | See §7. |
| S-24 | OpenCorporates | directorships declared in DPI | ⏳ | Tier 3 | Free API, rate-limited. Enriches `politician_finances`. |
| S-25 | Transparency International CPI | country-level corruption index | ⏳ | Tier 3 | Annual snapshots, context for country pages. |
| S-26 | ECB / ESM datasets | country macro data | ⏳ | Tier 3 | For deeper economic context; might lean on Eurostat mostly. |
| S-27 | National finance ministry budget PDFs (proposed budgets) | proposed national budgets | ❌ | abandoned | 24 languages, PDF layouts unique per country, no harmonized format. Year-long project. Documented here so nobody asks again. |
| S-28 | MEP Twitter accounts via live fetching (post-2023) | events | ❌ | abandoned | Twitter/X API is paid and rate-limited. Historical dumps (S-22) are the only tractable path. |

---

## 3. Data model changes

### 3.1 New canonical graph tables

```sql
-- M-100: canonical entities
CREATE TABLE public.entities (
  id            uuid primary key default gen_random_uuid(),
  kind          text not null,                -- 'person' | 'party' | 'country' | 'committee' | 'proposal' | 'lobby_org' | 'gov_agency' | 'budget_function' | 'media_outlet' | 'event' ...
  canonical_name text not null,
  slug          text not null,                -- stable URL slug
  summary       text,                          -- 1-2 sentence description
  first_seen_at timestamptz not null default now(),
  last_seen_at  timestamptz not null default now(),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  UNIQUE (kind, slug)
);

CREATE INDEX entities_kind_idx ON public.entities (kind);
CREATE INDEX entities_slug_idx ON public.entities (slug);
-- RLS: public SELECT
```

```sql
-- M-101: aliases and cross-source identifiers
CREATE TABLE public.entity_aliases (
  id          uuid primary key default gen_random_uuid(),
  entity_id   uuid not null references public.entities(id) on delete cascade,
  scheme      text not null,   -- 'wikidata' | 'ep_mep' | 'iso3166_1_a2' | 'transparency_register' | 'parltrack' | 'twitter_handle' | 'website_domain' | 'opencorporates' | 'name'
  value       text not null,
  valid_from  date,
  valid_to    date,
  source      text,
  trust_level smallint check (trust_level between 1 and 4),
  created_at  timestamptz not null default now(),
  UNIQUE (scheme, value)
);

CREATE INDEX entity_aliases_entity_idx ON public.entity_aliases (entity_id);
```

```sql
-- M-102: typed directed relationships with time + provenance
CREATE TABLE public.relationships (
  id               uuid primary key default gen_random_uuid(),
  subject_id       uuid not null references public.entities(id) on delete cascade,
  predicate        text not null,    -- 'member_of' | 'chaired_by' | 'sponsored' | 'voted_on' | 'met_with' | 'donated_to' | 'lobbied' | 'allied_with' | 'succeeded' | 'holds_position' ...
  object_id        uuid not null references public.entities(id) on delete cascade,
  valid_from       timestamptz,
  valid_to         timestamptz,
  strength         numeric,          -- optional 0..10 scalar
  role             text,             -- e.g. 'chair' vs 'member', 'rapporteur' vs 'shadow'
  context          text,             -- free-text micro-description
  data_source      text not null,
  source_url       text,
  trust_level      smallint check (trust_level between 1 and 4),
  observed_at      timestamptz not null default now(),
  UNIQUE (subject_id, predicate, object_id, valid_from)
);

CREATE INDEX relationships_subject_idx   ON public.relationships (subject_id, predicate);
CREATE INDEX relationships_object_idx    ON public.relationships (object_id, predicate);
CREATE INDEX relationships_valid_idx     ON public.relationships (valid_from, valid_to);
-- RLS: public SELECT
```

```sql
-- M-103: key/value claims about a single entity, with time + provenance
CREATE TABLE public.claims (
  id                    uuid primary key default gen_random_uuid(),
  entity_id             uuid not null references public.entities(id) on delete cascade,
  key                   text not null,   -- 'birth_year' | 'party_name' | 'office' | 'declared_assets_eur' | 'salary_eur_annual' | 'twitter_handle' ...
  value                 jsonb not null,  -- unit-agnostic; numbers, strings, structured objects allowed
  value_type            text not null,   -- 'number' | 'string' | 'date' | 'range' | 'currency' | 'boolean' | 'url'
  valid_from            timestamptz,
  valid_to              timestamptz,
  data_source           text not null,
  source_url            text,
  trust_level           smallint check (trust_level between 1 and 4),
  extraction_model      text,     -- NULL unless derived by LLM
  extraction_confidence numeric,  -- 0..1, NULL for non-LLM
  observed_at           timestamptz not null default now(),
  superseded_by         uuid references public.claims(id),
  UNIQUE (entity_id, key, valid_from, data_source)
);

CREATE INDEX claims_entity_key_idx ON public.claims (entity_id, key);
CREATE INDEX claims_valid_idx      ON public.claims (valid_from, valid_to);
-- RLS: public SELECT
```

```sql
-- M-104: canonical source documents
CREATE TABLE public.sources (
  id           uuid primary key default gen_random_uuid(),
  url          text not null,
  title        text,
  publisher    text,
  published_at timestamptz,
  fetched_at   timestamptz not null default now(),
  content_hash text,                 -- sha256 of body for change detection
  data_source  text not null,        -- matches data_sources.source_type enum values where relevant
  mime_type    text,
  UNIQUE (url)
);

CREATE INDEX sources_data_source_idx ON public.sources (data_source);
```

### 3.2 New domain tables (still needed; not replaced by the graph overlay)

```sql
-- M-110: government expenditure by function (Eurostat COFOG gov_10a_exp)
CREATE TABLE public.government_expenditure (
  id                        uuid primary key default gen_random_uuid(),
  country_code              text not null,
  year                      integer not null,
  cofog_code                text not null,              -- 'GF01'..'GF10' or 'GFTOT'
  cofog_label               text not null,
  amount_million_eur        numeric,
  pct_of_gdp                numeric,
  pct_of_total_expenditure  numeric,
  sector                    text not null default 'S13',
  na_item                   text not null default 'TE',
  is_provisional            boolean not null default false,
  data_source               text not null default 'eurostat_cofog',
  source_url                text,
  fetched_at                timestamptz not null default now(),
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now(),
  UNIQUE (country_code, year, cofog_code)
);

CREATE INDEX government_expenditure_country_year_idx ON public.government_expenditure (country_code, year);
CREATE INDEX government_expenditure_cofog_idx        ON public.government_expenditure (cofog_code);
```

```sql
-- M-111: COFOG reference
CREATE TABLE public.cofog_functions (
  code        text primary key,    -- 'GF01'..'GF10' or 'GFTOT'
  label       text not null,
  description text,
  icon        text,                -- lucide icon name
  color       text                 -- hsl()
);
-- Seeded with 11 rows in the migration itself.
```

```sql
-- M-112: country demographics (retires hard-coded EU_COUNTRY_DATA)
CREATE TABLE public.country_demographics (
  country_code  text not null,
  year          integer not null,
  population    bigint,
  gdp_million_eur numeric,
  area_km2      numeric,
  data_source   text not null,
  source_url    text,
  fetched_at    timestamptz not null default now(),
  PRIMARY KEY (country_code, year)
);
```

```sql
-- M-120: lobby organisations (Transparency Register canonical rows)
CREATE TABLE public.lobby_organisations (
  id                    uuid primary key default gen_random_uuid(),
  transparency_id       text unique not null,        -- the TR registration number
  name                  text not null,
  legal_name            text,
  category              text,                        -- 'in_house' | 'consultancy' | 'ngo' | 'academic' | 'law_firm' | ...
  country_of_hq         text,
  website               text,
  registered_at         date,
  last_updated_tr       date,
  data_source           text not null default 'transparency_register',
  source_url            text,
  fetched_at            timestamptz not null default now()
);
```

```sql
-- M-121: lobby spend time series (LobbyFacts or TR self-declared)
CREATE TABLE public.lobby_spend (
  id                    uuid primary key default gen_random_uuid(),
  lobby_id              uuid not null references public.lobby_organisations(id) on delete cascade,
  year                  integer not null,
  declared_amount_eur_low  numeric,           -- TR gives ranges; model as low/high
  declared_amount_eur_high numeric,
  full_time_equivalents numeric,              -- lobbyists employed
  data_source           text not null,        -- 'transparency_register' | 'lobbyfacts'
  source_url            text,
  fetched_at            timestamptz not null default now(),
  UNIQUE (lobby_id, year, data_source)
);
```

```sql
-- M-122: lobby meetings (TR Commissioner/DG/cabinet meetings, plus EP MEP meeting data if available)
CREATE TABLE public.lobby_meetings (
  id                    uuid primary key default gen_random_uuid(),
  lobby_id              uuid references public.lobby_organisations(id) on delete set null,
  politician_id         uuid references public.politicians(id) on delete set null,
  meeting_date          date not null,
  subject               text,
  commissioner_org      text,                 -- cabinet / DG name when applicable
  data_source           text not null,
  source_url            text,
  fetched_at            timestamptz not null default now(),
  UNIQUE (lobby_id, politician_id, meeting_date, subject)
);

CREATE INDEX lobby_meetings_politician_idx ON public.lobby_meetings (politician_id);
CREATE INDEX lobby_meetings_lobby_idx      ON public.lobby_meetings (lobby_id);
CREATE INDEX lobby_meetings_date_idx       ON public.lobby_meetings (meeting_date);
```

### 3.3 New columns on existing tables

```sql
-- M-200: add bitemporal fields to political_events
ALTER TABLE public.political_events
  ADD COLUMN IF NOT EXISTS valid_from timestamptz,
  ADD COLUMN IF NOT EXISTS valid_to   timestamptz,
  ADD COLUMN IF NOT EXISTS extraction_model text,
  ADD COLUMN IF NOT EXISTS extraction_confidence numeric;

UPDATE public.political_events SET valid_from = event_timestamp WHERE valid_from IS NULL;

-- M-201: add entity_id to politicians (and similar for proposals, lobby_organisations, etc.)
ALTER TABLE public.politicians
  ADD COLUMN IF NOT EXISTS entity_id uuid REFERENCES public.entities(id);

CREATE UNIQUE INDEX politicians_entity_id_uidx ON public.politicians (entity_id) WHERE entity_id IS NOT NULL;

ALTER TABLE public.proposals
  ADD COLUMN IF NOT EXISTS entity_id uuid REFERENCES public.entities(id);
```

### 3.4 New enum values

```sql
ALTER TYPE public.data_source_type ADD VALUE IF NOT EXISTS 'parltrack';
ALTER TYPE public.data_source_type ADD VALUE IF NOT EXISTS 'transparency_register';
ALTER TYPE public.data_source_type ADD VALUE IF NOT EXISTS 'lobbyfacts';
ALTER TYPE public.data_source_type ADD VALUE IF NOT EXISTS 'eurostat_cofog';
ALTER TYPE public.data_source_type ADD VALUE IF NOT EXISTS 'eurostat_macro';
ALTER TYPE public.data_source_type ADD VALUE IF NOT EXISTS 'integrity_watch';
ALTER TYPE public.data_source_type ADD VALUE IF NOT EXISTS 'gdelt';
ALTER TYPE public.data_source_type ADD VALUE IF NOT EXISTS 'archive_twitter';
ALTER TYPE public.data_source_type ADD VALUE IF NOT EXISTS 'llm_extraction';
ALTER TYPE public.data_source_type ADD VALUE IF NOT EXISTS 'opencorporates';
ALTER TYPE public.data_source_type ADD VALUE IF NOT EXISTS 'transparency_international';
```

Each must be in its own migration file because Postgres can't run `ALTER TYPE ... ADD VALUE` inside a transaction alongside other statements.

### 3.5 Migration order

```
20260415010000_canonical_entities.sql
20260415010100_canonical_entity_aliases.sql
20260415010200_canonical_relationships.sql
20260415010300_canonical_claims.sql
20260415010400_canonical_sources.sql
20260415020000_data_source_enum_parltrack.sql
20260415020100_data_source_enum_transparency_register.sql
20260415020200_data_source_enum_lobbyfacts.sql
20260415020300_data_source_enum_eurostat.sql
20260415020400_data_source_enum_integrity_watch.sql
20260415020500_data_source_enum_gdelt.sql
20260415020600_data_source_enum_archive_twitter.sql
20260415020700_data_source_enum_llm_extraction.sql
20260415020800_data_source_enum_opencorporates.sql
20260415020900_data_source_enum_transparency_international.sql
20260415030000_government_expenditure.sql
20260415030100_cofog_functions_seed.sql
20260415030200_country_demographics.sql
20260415040000_lobby_organisations.sql
20260415040100_lobby_spend.sql
20260415040200_lobby_meetings.sql
20260415050000_political_events_bitemporal.sql
20260415050100_politicians_entity_id.sql
20260415050200_proposals_entity_id.sql
```

Each step is additive, independently reversible, and has its own DROP in a matching `down` comment at the top of the file.

---

## 4. Ingestion pipelines

Each pipeline below has (a) what it fetches, (b) where it writes, (c) scheduling, (d) idempotency model, (e) status.

### 4.1 Parltrack nightly — `scripts/sync-parltrack.ts` — **Tier 1**

- **Fetches**: `https://parltrack.org/dumps/ep_meps.json.lz`, `ep_votes.json.lz`, `ep_dossiers.json.lz`, `ep_amendments.json.lz`, `ep_com_votes.json.lz`, `ep_mep_activities.json.lz`. LZMA-compressed NDJSON or JSON arrays.
- **Writes**:
  - `politicians` — upsert by Parltrack's MEP id, enrich with their richer activity-derived party history
  - `political_events` — new rows for votes (`event_type='vote'`), reports authored (`legislation_sponsored`), speeches (`speech`), committee joins/leaves (`committee_join`/`committee_leave`), amendments submitted (`legislation_sponsored`)
  - `proposals` — new rows for every dossier (richer than EUR-Lex alone)
  - `relationships` — `sponsored`, `voted_on`, `chaired_by`, `member_of` edges
- **Scheduling**: nightly cron via `ingest.yml`.
- **Idempotency**: every ingestion keyed on `(politician_id, source_url, event_timestamp)` using Parltrack's own id URLs as `source_url`.
- **Replaces**: S-10 (mep-reports, broken upstream), enriches S-07 (legislation) and S-11 (declarations).
- **Status**: ⏳ not started. Priority 1.

Subtasks:
- [ ] Add `scripts/sync-parltrack.ts`
- [ ] Add a `node_modules`-free LZMA decoder (or use `lzma-native` if already present) — verify or add dep
- [ ] Add `src/lib/parltrack-helpers.ts` with pure parsers and a vitest spec
- [ ] Wire into `.github/workflows/ingest.yml` as a new target
- [ ] Document in INGESTION.md

### 4.2 Transparency Register ingestion — `supabase/functions/scrape-transparency-register/` — **Tier 1**

- **Fetches**: https://ec.europa.eu/transparencyregister/public/consultation/search.do — has an undocumented but stable JSON endpoint `?action=search` used by the search UI. Alternative: bulk XML export at https://ec.europa.eu/transparencyregister/reports/bin/xml/ (update schedule: weekly).
- **Writes**:
  - `lobby_organisations`
  - `lobby_spend`
  - `lobby_meetings` when Commission meetings available (these are published separately for EP Commissioners, Directors-General, and their cabinets at https://ec.europa.eu/transparencyinitiative/meetings/meeting.do)
  - `entities` rows of `kind='lobby_org'` with aliases
  - `relationships` — `lobbied`, `met_with` edges pointing at politician entities
- **Scheduling**: weekly cron.
- **Idempotency**: TR registration id is stable; meetings keyed on `(lobby_id, politician_id, meeting_date, subject)`.
- **Status**: ⏳ not started.

Subtasks:
- [ ] Probe the actual endpoints, record into INGESTION.md
- [ ] Implement `scripts/sync-transparency-register.ts` (Node script, not edge function — XML bulk is 50 MB and fast to download locally)
- [ ] Seed the initial `lobby_organisations` table
- [ ] Ingest the meetings feed separately for Commissioners/DGs/cabinets

### 4.3 LobbyFacts CSV — `scripts/sync-lobbyfacts.ts` — **Tier 1**

- **Fetches**: https://www.lobbyfacts.eu/ data portal CSVs. Per-year lobby spending across orgs.
- **Writes**: `lobby_spend` (with `data_source='lobbyfacts'`), enriching rows already inserted from S-14. When TR says "100k–200k" and LobbyFacts has parsed "exactly 145,000", LobbyFacts wins for that year.
- **Scheduling**: monthly.
- **Status**: ⏳ not started.

Subtasks:
- [ ] Locate current CSV download URL (likely needs one WebFetch to confirm)
- [ ] Implement parser + upsert

### 4.4 Eurostat COFOG budgets — `scripts/sync-eurostat-budgets.ts` — **Tier 1**

- **Fetches**: `https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/gov_10a_exp?format=JSON&lang=EN&na_item=TE&sector=S13&unit=MIO_EUR&geo={CC}` — one call per country. Also `unit=PC_GDP` and `unit=PC_TOT` in separate calls (Eurostat rejects multi-unit single calls).
- **Writes**: `government_expenditure`. One row per `(country, year, cofog)`. ~8,900 rows total for EU27 × ~30y × 11 categories.
- **Scheduling**: quarterly (data lag is 12–18 months anyway).
- **Idempotency**: upsert on `(country_code, year, cofog_code)`. Includes EU27_2020 aggregate as a synthetic "country".
- **Status**: ⏳ verified endpoint, not yet implemented.

Subtasks:
- [ ] Implement JSON-stat → rows parser in `src/lib/jsonstat-parser.ts` + vitest spec covering (a) single-cell, (b) multi-dim traversal, (c) sparse `value` object indices
- [ ] Implement `scripts/sync-eurostat-budgets.ts`
- [ ] Seed the `cofog_functions` reference table in-migration
- [ ] Wire into ingest workflow

### 4.5 Eurostat macro — `scripts/sync-eurostat-macro.ts` — Tier 1 follow-up

- **Fetches**: `nama_10_pc` (GDP per capita current prices), `demo_pjan` (population 1st Jan), `gov_10dd_edpt1` (surplus/deficit) per country per year.
- **Writes**: `country_demographics`.
- **Retires**: hard-coded `EU_COUNTRY_DATA` constant in [src/pages/Data.tsx](src/pages/Data.tsx).
- **Status**: ⏳ not started.

Subtasks:
- [ ] Implementation reuses JSON-stat parser from 4.4
- [ ] Migrate `src/pages/Data.tsx` to read from the new hook `useCountryDemographics()` and delete `EU_COUNTRY_DATA`

### 4.6 Integrity Watch EU — `scripts/sync-integrity-watch.ts` — **Tier 2**

- **Fetches**: one page per MEP at https://www.integritywatch.eu/mepincome — each MEP has a normalized side-income table with € ranges per activity, per declaration year.
- **Writes**: extends `politician_finances` with a new `side_income_breakdown` JSONB column + detailed rows; also writes `political_events` with `event_type='financial_disclosure'` and richer structured `raw_data`.
- **Scheduling**: weekly.
- **Status**: ⏳ not started.

Subtasks:
- [ ] Add `ALTER TABLE politician_finances ADD COLUMN side_income_breakdown jsonb`
- [ ] Write HTML parser for the Integrity Watch table structure
- [ ] Vitest spec with a fixture snippet
- [ ] Attribute matching: Integrity Watch uses MEP names; match against our `politicians` by `external_id` (the EP MEP id, if they expose it) or by normalized name

### 4.7 GDELT — `scripts/sync-gdelt.ts` — **Tier 2**

- **Fetches**: https://www.gdeltproject.org/ — either GDELT Events table via BigQuery (preferred, but needs a GCP setup), or the free daily CSV exports from http://data.gdeltproject.org/events/index.html
- **Writes**: `political_events` with `event_type='media_appearance'` or `public_statement`, joined to politicians by name mention.
- **Trust**: 2 (authoritative secondary).
- **Challenge**: GDELT is huge (200 MB per day of events). We'd pre-filter to "contains named politician".
- **Status**: ⏳ not started.

Subtasks:
- [ ] Build a name-match Bloom filter or FST of all tracked politician names (normalized)
- [ ] Daily pull of GDELT 1.0 events CSV, filter to rows mentioning any politician, insert
- [ ] Vitest spec with synthetic GDELT rows

### 4.8 Historical Twitter corpora — `scripts/import-archive-twitter.ts` — **Tier 3**

- **Sources to try**, in priority order:
  1. **Parltrack** — some MEPs have twitter handles in their profile; we can cross-reference to the archive sources below.
  2. **Internet Archive Wayback Machine** — snapshot lookup of `https://twitter.com/{handle}` and `https://nitter.net/{handle}`. We get per-snapshot HTML and extract visible tweets.
  3. **Archive Team Twitter Stream Grab** — https://archive.org/details/twitterstream — 1% sample of all tweets 2011-present. Hosted as monthly tar archives. We filter to tweets from known MEP handles via a handle allowlist. **Big download** (TB-scale for the full range). We'd only pull the months we care about and pre-filter.
  4. **Zenodo / academic corpora** — a named-search on Zenodo for "MEP tweets" returns several published datasets. Manual review required; each has its own license.
- **Writes**: a new `raw_tweets` table keyed on `(handle, tweet_id)`, plus **no events** until the LLM extraction pass (4.9) runs over it.
- **Scheduling**: one-time historical import, then manual additions per new corpus.
- **Status**: ⏳ not started. Needs human review for source selection.

Subtasks:
- [ ] Add `raw_tweets (id, politician_id, handle, tweet_id, posted_at, body, reply_to, retweet_of, lang, archive_source, source_url)` table
- [ ] Implement Wayback snapshot extractor (regex-free, DOM-based — use jsdom via Vite, same as tests) — dedup by tweet_id
- [ ] Document how to drop in a Zenodo CSV manually
- [ ] Write a README for the import pipeline — it's not a cron job, it's an operator tool

### 4.9 LLM extraction — `scripts/llm-extract-events.ts` — **Tier 3**

Pipeline:

```
raw_tweets  ──┐
speeches ─────┤
press_text ───┼──► llm-extract-events  ──► political_events (trust_level=3|4)
              │                        └──► relationships
media_excerpts┘                        └──► claims (key/value)
```

- **Model**: Anthropic Claude (user has a token in `.env`? No — that's Supabase, different). Needs `ANTHROPIC_API_KEY` env. Model: `claude-sonnet-4-5` for extraction, `claude-haiku-4-5` for cheap first-pass filtering.
- **Prompt contract**: given a tweet body + author metadata, return structured JSON:
  ```json
  {
    "events": [{
      "event_type": "foreign_meeting" | "public_statement" | "policy_change" | ...,
      "entities_mentioned": ["Q2062" /* wikidata */, "europarl.europa.eu/meps/en/123456"],
      "summary": "string",
      "claimed_at": "ISO8601",
      "monetary_amount_eur": null,
      "location": null,
      "confidence": 0.0-1.0
    }],
    "claims": [{
      "key": "twitter_follower_count" | "declared_position" | ...,
      "value": <any>,
      "confidence": 0.0-1.0
    }],
    "relationships": [...]
  }
  ```
- **Provenance**: every extracted row has `data_source='llm_extraction'`, `extraction_model=<model id>`, `extraction_prompt_hash=<sha256 of the prompt template>`, `trust_level=4`. The raw tweet stays in `raw_tweets` so the human can always go back.
- **Cost control**: hard per-run cap on token spend. Resume-from-checkpoint so a killed run doesn't re-bill.
- **Caching**: claude-code-guide recommends prompt caching; see §6 for the prompt template design.
- **Status**: ⏳ build-only. Not auto-run. Operator must `node scripts/llm-extract-events.ts --corpus raw_tweets --limit 1000 --model haiku` explicitly and pay for their own API usage.

Subtasks:
- [ ] Decide on the structured-output format — JSON-schema or Anthropic tool-use (prefer tool-use for strictness)
- [ ] Write the prompt template + hash it + store in `prompts/event-extraction-v1.md`
- [ ] Implement cost tracker + checkpoint
- [ ] Vitest spec with a fake Anthropic client returning canned JSON, verifying row shape
- [ ] Store token usage per run in `scrape_runs.raw_data`

### 4.10 OpenCorporates enrichment — Tier 3

- **Fetches**: https://api.opencorporates.com/v0.4.8/companies/search — given a company name from a DPI, return the canonical jurisdiction + company number.
- **Writes**: extends `politician_investments` with a `canonical_company_id` column pointing at an OpenCorporates record, plus a `companies` table.
- **Status**: ⏳ deferred.

### 4.11 Transparency International CPI — Tier 3

- **Fetches**: yearly CPI CSV.
- **Writes**: extends `country_metadata` or adds `country_yearly_metrics`.
- **Use**: context on country pages.
- **Status**: ⏳ deferred.

### 4.12 Parltrack-as-canonical — Tier 1+ follow-up

Once Parltrack ingestion is stable, **retire or deprioritize** the bespoke EP scrapers (S-01, S-10, S-11, S-12) where Parltrack's data is a superset and more reliable. Document what each still uniquely provides.

---

## 5. Unification layer

### 5.1 Entity projection job

A seed function `seed-entities` reads from the existing `politicians`, `proposals`, `country_metadata`, `lobby_organisations`, and `politician_associations` tables and materializes matching rows in `entities` + `entity_aliases`. It's idempotent and re-runnable.

Subtasks:
- [ ] Write `supabase/functions/seed-entities/index.ts`
- [ ] For each politician, upsert one `entities` row with `kind='person'` and add aliases for Wikidata, EP MEP id, Twitter handle, normalized name
- [ ] For each country, upsert one `entities` row with `kind='country'`, alias by ISO 3166 a2 and a3
- [ ] For each proposal, upsert by CELEX as canonical
- [ ] Populate `politicians.entity_id`, `proposals.entity_id`, etc.

### 5.2 Relationship projection job

A seed function `seed-relationships` reads from `politician_associations`, `political_events`, `lobby_meetings`, `proposals.sponsors[]`, and backfills `relationships`.

Edge-type mapping:

| Source row | predicate |
|---|---|
| `politician_associations.relationship_type='party_ally'` | `party_ally` |
| `politician_associations.relationship_type='committee_colleague'` | `committee_colleague` |
| `political_events.event_type='vote'` | `voted_on` — object = proposal entity |
| `political_events.event_type='legislation_sponsored'` | `sponsored` — object = proposal entity |
| `political_events.event_type='committee_join'` | `member_of` — object = committee entity |
| `lobby_meetings` | `met_with` — object = lobby_org entity |
| `politician_finances.salary_source` | `employed_by` — object = organisation entity |

### 5.3 Claims projection job

Translates scalar facts on `politicians` (party_name, birth_year, committees[], in_office_since) into `claims` rows with `valid_from` set from source metadata.

### 5.4 Entity Markdown card generator

A utility function `renderEntityCard(entityId): string` that takes an entity id, runs a set of queries against `entities`, `entity_aliases`, `claims`, `relationships`, `political_events`, and produces a deterministic Markdown string. Used by:
- A new REST endpoint `/functions/v1/entity/{slug}` that returns the card
- An LLM-tool integration that can be called from outside the app (§8.3)
- The frontend entity detail pages

Example output:
```markdown
# Jane Doe
**Role**: Member of European Parliament  **Country**: Germany  **Party**: SPD (S&D)
**Born**: 1975  **In office since**: 2019-07-02

## Summary
Jane Doe is a German MEP ...

## Timeline
- 2019-07-02  Elected to the 9th European Parliament
- 2020-01-15  Joined Committee on Foreign Affairs
- 2022-03-04  Rapporteur on A9-0042/2022 (DSA trilogue)
- 2023-11-08  Met with lobby org "Digital Europe"
- 2024-06-09  Re-elected to the 10th European Parliament

## Financial disclosures
- 2023: side income €10,000–€25,000 ...

## Relationships
- party_ally of: Max Mustermann, Lisa Schulze (SPD)
- committee_colleague of: ... (AFET)
- met_with: Digital Europe, Microsoft, CDU Europa

## Provenance
- EP XML directory — last fetched 2026-04-14
- Wikipedia — last enriched 2026-04-14
- ...
```

Subtasks:
- [ ] Write `src/lib/entity-card.ts` with a pure `renderEntityCard(data)` function
- [ ] Add a vitest spec with a fully-populated fixture and a sparse one
- [ ] Wire it to a public HTTP endpoint

---

## 6. Frontend work

### 6.1 `/budgets` route + embeds

From the COFOG plan (verbatim carry-over from the previous planning message):

- Country selector, year selector, four Recharts visualizations:
  1. Treemap of current-year spending by COFOG category
  2. Stacked area chart of spending over time per function
  3. Horizontal bar — top functions with € per capita
  4. % of GDP vs EU27 average
- `CountryDetail` embed: mini treemap
- `Data` embed: health + education spending % of GDP cross-country line chart

Subtasks:
- [ ] `src/pages/Budgets.tsx`
- [ ] `src/hooks/use-government-expenditure.ts`
- [ ] `src/hooks/use-country-demographics.ts`
- [ ] Route wiring in `src/App.tsx`
- [ ] Nav entry in `SiteHeader.tsx`
- [ ] Embeds in `CountryDetail.tsx` and `Data.tsx`
- [ ] Vitest for hooks + page smoke test

### 6.2 `/lobby` route

A new page that presents:

- Top lobby organisations by declared spend
- Per-org drill-down: spend over time, meetings, politicians met
- Per-MEP: who met me, what did I vote on after the meeting
- A graph visualization of lobby↔politician meetings (optional; later)

Subtasks:
- [ ] `src/pages/Lobby.tsx`
- [ ] Hooks over `lobby_organisations` / `lobby_meetings` / `lobby_spend`
- [ ] Per-politician "Lobby contacts" panel in `ActorDetail.tsx`

### 6.3 `/entity/:kind/:slug` generic detail route

The unification layer's front door. One route handles all entity kinds. Uses the `renderEntityCard` output plus rich interactive widgets keyed on `entity.kind`.

This is a bigger refactor because today's `ActorDetail`, `PartyDetail`, `CountryDetail`, `ProposalDetail` are all bespoke. We'd keep them as thin wrappers that delegate most rendering to a shared `<EntityDetail>` component driven by entity kind.

Subtasks:
- [ ] Design the `<EntityDetail>` component's slots (header, timeline, relationships, claims, provenance)
- [ ] Migrate one bespoke page to delegate to it as a proof of concept (probably `PartyDetail` since it's smallest)
- [ ] Iterate

### 6.4 Timeline explorer `/timeline`

A single infinite-scroll timeline of ALL `political_events` across the platform, filterable by:
- Country / party / entity
- Event type
- Source / trust level
- Date range

Each entry is a compact card with expand-on-click. Clicking an entity in the card deep-links to its `/entity/...` page.

Subtasks:
- [ ] `src/pages/Timeline.tsx`
- [ ] Paginated hook with `range()` over `political_events`
- [ ] Filter state in URL (like `Proposals.tsx` does)

### 6.5 Graph explorer `/graph`

An interactive force-directed graph view over `relationships` seeded from a chosen entity. Depth slider (1–3 hops). Color by entity kind. Requires a graph layout lib (visx or sigma.js).

This is deferred. Stub the route with a placeholder that says "coming soon" until the underlying tables are populated.

### 6.6 Search upgrades

`SearchBar.tsx` today searches politicians + proposals + countries. After the entity table exists, it should search `entities` directly and return kind-aware result cards.

---

## 7. LLM extraction — deeper design

### 7.1 Prompt template

Stored at `prompts/event-extraction-v1.md`. Hashed, versioned, never edited in place — a new version bumps to `v2`. Every extracted row records the prompt hash so we can re-run with a new prompt without clobbering history.

The template:
1. Describes the platform's event taxonomy (same 21 types as `political_event_type`)
2. Describes the claim taxonomy
3. Gives the input (a tweet + author metadata)
4. Requires a structured response via Anthropic tool-use
5. Explicitly asks for confidence per item
6. Explicitly asks for entities-mentioned with canonical identifiers when possible

### 7.2 Entity linking

Before inserting LLM output, run an entity-linking pass:
- LLM returns `entities_mentioned: ["Angela Merkel", "Digital Europe"]`
- Linker looks each up in `entity_aliases` by normalized name
- If unique match, uses its id
- If ambiguous, stores as unresolved alias + leaves for human review
- If no match, creates an `entities` row with `kind='unknown'` and a provisional alias

### 7.3 Cost model

- Haiku 4.5 for triage: "does this tweet contain any event/claim worth extracting?" (yes/no). Cheap.
- Sonnet 4.5 for extraction on yes-tweets.
- Prompt cache on the taxonomy prefix (it's ~2k tokens, reusable across millions of tweets).
- Hard ceiling: `MAX_USD_PER_RUN` env var. The script aborts with a partial commit if exceeded.

### 7.4 Never auto-run

LLM extraction runs **only** from `scripts/` on demand. It is explicitly not in `ingest.yml`. The reason: every run costs real money and needs a human to decide it's worth it.

---

## 8. API and LLM integration surface

### 8.1 REST endpoints (extending PostgREST's default)

- `GET /rest/v1/entities?kind=eq.person&canonical_name=ilike.*jane*`
- `GET /rest/v1/relationships?subject_id=eq.{id}`
- `GET /rest/v1/claims?entity_id=eq.{id}`

These are free from PostgREST. No extra work needed beyond the schema.

### 8.2 Derived HTTP endpoints

- `GET /functions/v1/entity/{slug}` — returns Markdown card (§5.4)
- `GET /functions/v1/timeline?subject_id=...&from=...&to=...` — returns a filtered timeline
- `GET /functions/v1/graph?seed=...&depth=2` — returns a graph slice as nodes/edges JSON

Each is a thin Supabase edge function that pulls from the database and formats.

### 8.3 MCP / LLM tool integration

Expose the derived endpoints as an MCP server so any LLM (Claude Code, Claude Desktop, chatgpt, etc.) can call them via tool-use. This is a small follow-up task once the endpoints exist.

---

## 9. Quality and operations

### 9.1 Testing discipline

For every new pipeline:
- Pure parser in `src/lib/` (not in `scripts/` or `supabase/functions/`) so vitest can load it without crossing the boundary. This is the lesson from the previous fix round.
- Vitest spec with real fixture bytes (not mocked upstream)
- An end-to-end dry-run command that hits the live upstream and pretty-prints what WOULD be written, without writing

### 9.2 Runtime health

- Every ingestion function writes a `scrape_runs` row. Errors are thrown, not swallowed. This is enforced by the audit fix we already shipped.
- Add a new `/health` edge function or a small Data-page widget that surfaces the last successful run per source type + row counts.

### 9.3 Data quality

- Add `data_quality_issues` table: one row per detected inconsistency (duplicate external_ids, orphaned finance rows, etc.) produced by a periodic `check-data-integrity` function.
- Surface counts on an internal-only admin page.

### 9.4 Scheduling

`.github/workflows/ingest.yml` already exists; extend its target list to include every new pipeline. Default `all` target should be partitioned:
- `eu_daily` — light weight, daily (EP RSS, Parltrack incremental)
- `eu_weekly` — weekly (Transparency Register, Parltrack full dump, Integrity Watch)
- `eu_quarterly` — quarterly (Eurostat COFOG, macro)
- `one_shot` — historical Twitter import, manual

### 9.5 Documentation

Every new ingestion adds a section to `INGESTION.md`. Every new table adds a row to the ER diagram in `REPOSITORY_OVERVIEW.md`. Every new page adds a row to the routing table in `REPOSITORY_OVERVIEW.md`.

---

## 10. Phased execution plan

### Phase 1 — foundation (this week)

1. **Canonical graph migrations** (M-100 to M-104 + enum enums)
2. **Eurostat COFOG ingestion + `/budgets` page** (S-16, §4.4, §6.1). End-to-end shippable.
3. **Eurostat macro + demographics** (S-17, S-18) — retires the hardcoded `EU_COUNTRY_DATA` constant.
4. **Parltrack nightly dump ingestion** (S-13, §4.1). Replaces broken S-10.

Exit criteria:
- `/budgets` page live with real Eurostat data
- `government_expenditure` has ~8,900 rows
- `country_demographics` has ~800 rows
- `political_events` has rapporteurship/speech events restored via Parltrack
- `entities`/`relationships` tables exist (empty is fine in phase 1)

### Phase 2 — lobby money trail

1. **Transparency Register ingestion** (§4.2) — `lobby_organisations`, `lobby_spend`, `lobby_meetings`
2. **LobbyFacts normalization** (§4.3)
3. **Integrity Watch structured side-income** (§4.6)
4. **`/lobby` page** (§6.2)
5. **`ActorDetail` "Lobby contacts" panel** (§6.2)

Exit criteria:
- Every tracked MEP has a lobby-contact section on their profile
- `/lobby` page lets the user browse top lobby orgs by spend

### Phase 3 — unification

1. **`seed-entities`** (§5.1) — projects existing tables into `entities`/`entity_aliases`
2. **`seed-relationships`** (§5.2) — projects associations/events/meetings into `relationships`
3. **`seed-claims`** (§5.3) — projects scalar facts into `claims`
4. **Entity Markdown card generator + HTTP endpoint** (§5.4)
5. **`/entity/:kind/:slug` unified detail route** (§6.3) — start with one kind as PoC

Exit criteria:
- Every politician has a canonical entity row + markdown card
- PartyDetail (smallest) delegates to `<EntityDetail>` successfully

### Phase 4 — media + extraction

1. **GDELT daily ingestion** (§4.7)
2. **Historical Twitter import** (§4.8) — at least the Internet Archive wayback path
3. **LLM extraction pipeline** (§4.9, §7) — build-only, not wired to cron

Exit criteria:
- `raw_tweets` table populated for at least 50 MEPs
- LLM extraction runnable as a one-shot with cost ceiling enforced
- Extracted events land in `political_events` with `trust_level=4`

### Phase 5 — depth

1. **Timeline explorer `/timeline`** (§6.4)
2. **Graph explorer `/graph`** (§6.5)
3. **Search upgrades** (§6.6)
4. **OpenCorporates** (§4.10), **TI CPI** (§4.11) — optional

### Phase 6 — hygiene and documentation

1. **Retire hard-coded constants** (`EU_COUNTRY_DATA`)
2. **Data quality checker** (§9.3)
3. **Admin dashboard** for run health (§9.2)
4. **Update ARCHITECTURE.md, INGESTION.md, REPOSITORY_OVERVIEW.md** for all new tables + pipelines
5. **Add an API reference doc** for the canonical graph

---

## 11. Out-of-scope for this roadmap (explicit)

- **Paid Twitter/X API.** Not worth it. Historical dumps only.
- **Proposed (pre-vote) national budgets.** 24 languages, unstructured PDFs. Year-long scoping.
- **Real-time streaming.** Everything is batch. A scheduled job is always cheaper than a stream.
- **Politician photos beyond what EP/Wikipedia already give us.** No custom scraping of image sources.
- **Email/contact data for politicians.** Privacy-sensitive even when public; decided against.
- **User accounts / saved searches / comment threads.** Read-only public tool. No auth surface.
- **US / UK / non-EU scope.** Happy to be added later; out of scope for the current roadmap.

---

## 12. Resolved defaults (2026-04-15)

These were open questions; they now have resolutions so execution can proceed without further input.

1. **Token budget** → **$0 / build-only.** LLM extraction scripts ship fully working but are NOT wired into `ingest.yml`. Operator runs them manually when ready to spend. `MAX_USD_PER_RUN` env var required at run time or the script refuses to start.
2. **Hosting the frontend** → **local-runnable only for now.** `npm run dev` against the live Supabase project is the primary dev loop. A `vercel.json` config is shipped so the user can one-click deploy later.
3. **Primary language** → **English only.** Multi-language i18n tracked as a post-roadmap item.
4. **Authenticated admin surface** → **skip.** All admin/operational endpoints are service-role-gated and run from scripts, not a UI.
5. **Anon access to LLM endpoint** → **defer.** The Markdown card endpoint is public during Phase 3; rate limiting is a Phase 6 hardening item. A `Cache-Control: public, max-age=300` header mitigates the obvious abuse path.
6. **Parltrack licensing** → **attribution in INGESTION.md + visible credit in the UI footer.** Parltrack is CC-BY-4.0.
7. **Rename `scrape-twitter`** → **yes, during Phase 6 cleanup.** New name: `scrape-press-rss`. Migration path: deploy both, update ingest.yml, remove old.

---

## 13. Done-definition per phase

A phase is "done" when:

- Every listed subtask has an executed verification (test passing, rows counted, URL opened).
- The new pipelines are in `ingest.yml` with their real schedule.
- `CHANGELOG.md` has an entry per migration, ingestion, and page shipped.
- `REPOSITORY_OVERVIEW.md` is updated to reflect the new state.
- An operator can point an LLM at `/functions/v1/entity/{slug}` and get a meaningful markdown card back.

---

*End of roadmap. Edits should preserve the section numbering since other docs may link to it.*
