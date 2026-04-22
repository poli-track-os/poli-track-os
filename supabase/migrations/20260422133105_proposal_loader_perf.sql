CREATE INDEX IF NOT EXISTS idx_proposals_submitted_date_desc
  ON public.proposals (submitted_date DESC);

CREATE INDEX IF NOT EXISTS idx_proposals_country_submitted_date_desc
  ON public.proposals (country_code, submitted_date DESC);

CREATE INDEX IF NOT EXISTS idx_proposals_status_submitted_date_desc
  ON public.proposals (status, submitted_date DESC);

CREATE INDEX IF NOT EXISTS idx_proposals_policy_area_submitted_date_desc
  ON public.proposals (policy_area, submitted_date DESC);

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
    )
  )
  FROM totals;
$function$;

GRANT EXECUTE ON FUNCTION public.get_proposal_stats() TO anon, authenticated, service_role;
