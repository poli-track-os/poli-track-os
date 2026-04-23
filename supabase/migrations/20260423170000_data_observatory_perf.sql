CREATE OR REPLACE VIEW public.politician_data_observatory_overview AS
SELECT
  p.id,
  p.name,
  p.role,
  p.country_code,
  p.country_name,
  p.party_name,
  p.party_abbreviation,
  p.jurisdiction,
  p.wikipedia_url,
  p.enriched_at,
  p.birth_year,
  p.twitter_handle,
  (p.biography IS NOT NULL OR p.wikipedia_summary IS NOT NULL) AS has_biography,
  (p.photo_url IS NOT NULL OR p.wikipedia_image_url IS NOT NULL) AS has_photo
FROM public.politicians AS p;

GRANT SELECT ON TABLE public.politician_data_observatory_overview TO anon, authenticated, service_role;

CREATE INDEX IF NOT EXISTS idx_political_events_event_type
  ON public.political_events (event_type);

CREATE INDEX IF NOT EXISTS idx_proposals_proposal_type_submitted_date_desc
  ON public.proposals (proposal_type, submitted_date DESC);

CREATE OR REPLACE FUNCTION public.get_political_event_stats()
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path = public
AS $function$
  WITH totals AS (
    SELECT COUNT(*)::integer AS total
    FROM public.political_events
  ),
  by_type_rows AS (
    SELECT
      event_type::text AS name,
      COUNT(*)::integer AS count
    FROM public.political_events
    GROUP BY event_type
  )
  SELECT jsonb_build_object(
    'total', totals.total,
    'byType', COALESCE(
      (
        SELECT jsonb_agg(
          jsonb_build_object('name', name, 'count', count)
          ORDER BY count DESC, name ASC
        )
        FROM by_type_rows
      ),
      '[]'::jsonb
    )
  )
  FROM totals;
$function$;

GRANT EXECUTE ON FUNCTION public.get_political_event_stats() TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_proposal_stats()
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path = public
AS $function$
  WITH totals AS (
    SELECT COUNT(*)::integer AS total
    FROM public.proposals
  ),
  by_country_rows AS (
    SELECT
      country_code AS code,
      MIN(country_name) AS name,
      COUNT(*)::integer AS count
    FROM public.proposals
    GROUP BY country_code
  ),
  by_status_rows AS (
    SELECT
      status AS name,
      COUNT(*)::integer AS count
    FROM public.proposals
    GROUP BY status
  ),
  by_area_rows AS (
    SELECT
      policy_area AS name,
      COUNT(*)::integer AS count
    FROM public.proposals
    WHERE policy_area IS NOT NULL
    GROUP BY policy_area
  ),
  by_type_rows AS (
    SELECT
      proposal_type AS name,
      COUNT(*)::integer AS count
    FROM public.proposals
    GROUP BY proposal_type
  )
  SELECT jsonb_build_object(
    'total', totals.total,
    'byCountry', COALESCE(
      (
        SELECT jsonb_agg(
          jsonb_build_object('code', code, 'name', name, 'count', count)
          ORDER BY count DESC, code ASC
        )
        FROM by_country_rows
      ),
      '[]'::jsonb
    ),
    'byStatus', COALESCE(
      (
        SELECT jsonb_agg(
          jsonb_build_object('name', name, 'count', count)
          ORDER BY count DESC, name ASC
        )
        FROM by_status_rows
      ),
      '[]'::jsonb
    ),
    'byArea', COALESCE(
      (
        SELECT jsonb_agg(
          jsonb_build_object('name', name, 'count', count)
          ORDER BY count DESC, name ASC
        )
        FROM by_area_rows
      ),
      '[]'::jsonb
    ),
    'byType', COALESCE(
      (
        SELECT jsonb_agg(
          jsonb_build_object('name', name, 'count', count)
          ORDER BY count DESC, name ASC
        )
        FROM by_type_rows
      ),
      '[]'::jsonb
    )
  )
  FROM totals;
$function$;

GRANT EXECUTE ON FUNCTION public.get_proposal_stats() TO anon, authenticated, service_role;
