-- Replace partial unique index with a full unique index so ON CONFLICT works.
DROP INDEX IF EXISTS proposals_source_url_uidx;
CREATE UNIQUE INDEX proposals_source_url_uidx ON public.proposals (source_url);
