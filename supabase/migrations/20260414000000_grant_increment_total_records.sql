-- Bug fix: increment_total_records was only granted to `service_role`,
-- but the backfill-wikipedia-links script can fall back to the publishable
-- (anon) key in dry-run mode. Calling the RPC under `authenticated` /
-- `anon` raised "permission denied for function increment_total_records",
-- which crashed the apply path AFTER it had already written rows — leaving
-- the scrape_runs row stuck in `running` state.
--
-- Grant EXECUTE to `authenticated` and `anon` so dry-run paths and any
-- future client-side counter bumps don't fail. The RPC body is still
-- SECURITY DEFINER and only updates a denormalized counter; it does NOT
-- expose any new privileges that aren't already implicit in the public
-- read access on data_sources.

GRANT EXECUTE ON FUNCTION public.increment_total_records(public.data_source_type, integer)
  TO authenticated, anon;
