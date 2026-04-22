-- `api_keys` table for optional higher-rate-limit consumers.
--
-- The envelope helper does not yet enforce keys — this migration just
-- provisions the table so operators can start issuing them before the
-- rate-limit middleware lands. Each key stores only a sha256 hash (never
-- the plaintext) plus a rate-limit budget and optional revocation
-- timestamp.
--
-- Keys are minted with `scripts/issue-api-key.ts` (future). Public API
-- access remains open; keys are additive, not required.

create table if not exists public.api_keys (
  id              uuid primary key default gen_random_uuid(),
  key_hash        text not null unique,
  label           text not null,
  rate_limit_rpm  integer not null default 600,
  created_at      timestamptz not null default now(),
  last_used_at    timestamptz,
  revoked_at      timestamptz,
  notes           text
);

comment on table public.api_keys is 'Opaque API keys for higher rate limits. Operator-issued only. Public reads remain open without a key.';
comment on column public.api_keys.key_hash is 'sha256(key) — the plaintext is never stored.';
comment on column public.api_keys.rate_limit_rpm is 'Requests per minute budget for this key. Default 600.';

-- RLS: the table is readable only by the service role (no anon reads at
-- all, since hashes are still secrets). PostgREST won't expose it.
alter table public.api_keys enable row level security;

-- No policies created → anon and authenticated roles cannot read or
-- write. Only service_role (bypass) can see the rows.
