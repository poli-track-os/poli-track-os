-- Key/value claims about a single entity, with bitemporal fields.
--
-- A claim is "entity X has property K with value V during [valid_from, valid_to)".
-- Claims are NOT automatically reconciled across sources: multiple claims with
-- the same (entity, key, valid_from) and different sources can coexist. The
-- frontend decides which to display based on trust_level.
--
-- value is jsonb because the shape depends on value_type:
--   'number'   -> {"n": 42}
--   'string'   -> {"s": "Member of Parliament"}
--   'date'     -> {"d": "2019-07-02"}
--   'range'    -> {"low": 10000, "high": 25000, "unit": "EUR"}
--   'currency' -> {"amount": 42000, "currency": "EUR"}
--   'boolean'  -> {"b": true}
--   'url'      -> {"url": "https://example.com"}
--   'object'   -> arbitrary JSON (escape hatch)
--
-- superseded_by lets us chain updates: when a newer run retracts an earlier
-- claim, we write a new claim and point the old one at it, instead of
-- deleting.

CREATE TABLE IF NOT EXISTS public.claims (
  id                    uuid primary key default gen_random_uuid(),
  entity_id             uuid not null references public.entities(id) on delete cascade,
  key                   text not null,
  value                 jsonb not null,
  value_type            text not null,
  valid_from            timestamptz,
  valid_to              timestamptz,
  data_source           text not null,
  source_url            text,
  trust_level           smallint check (trust_level between 1 and 4),
  extraction_model      text,
  extraction_confidence numeric CHECK (extraction_confidence IS NULL OR (extraction_confidence >= 0 AND extraction_confidence <= 1)),
  observed_at           timestamptz not null default now(),
  superseded_by         uuid references public.claims(id) ON DELETE SET NULL,
  CONSTRAINT claims_value_type_check CHECK (value_type IN (
    'number', 'string', 'date', 'range', 'currency', 'boolean', 'url', 'object'
  )),
  UNIQUE (entity_id, key, valid_from, data_source)
);

CREATE INDEX IF NOT EXISTS claims_entity_key_idx ON public.claims (entity_id, key);
CREATE INDEX IF NOT EXISTS claims_valid_idx      ON public.claims (valid_from, valid_to);
CREATE INDEX IF NOT EXISTS claims_data_source_idx ON public.claims (data_source);

ALTER TABLE public.claims ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Claims are viewable by everyone"
  ON public.claims
  FOR SELECT
  USING (true);
