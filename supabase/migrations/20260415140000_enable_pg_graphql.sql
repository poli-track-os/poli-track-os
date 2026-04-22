-- Enable pg_graphql so the raw table surface is reachable via
-- POST /graphql/v1 in addition to PostgREST at /rest/v1/*.
--
-- Supabase ships pg_graphql pre-installed; this migration just makes sure
-- the extension is enabled idempotently and that the anon role has the
-- usage grant it needs for public reads.

create extension if not exists pg_graphql;

-- Supabase's default grants normally cover this, but we make it explicit
-- so a fresh clone of the project can hit /graphql/v1 without any manual
-- dashboard toggling.
grant usage on schema graphql to anon, authenticated, service_role;
grant all on function graphql.resolve to anon, authenticated, service_role;
