CREATE TABLE public.proposal_vote_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id UUID NOT NULL REFERENCES public.proposals(id) ON DELETE CASCADE,
  source_event_id TEXT NOT NULL,
  chamber TEXT,
  vote_method TEXT,
  happened_at TIMESTAMPTZ,
  result TEXT,
  for_count INTEGER,
  against_count INTEGER,
  abstain_count INTEGER,
  absent_count INTEGER,
  total_eligible INTEGER,
  total_cast INTEGER,
  quorum_required INTEGER,
  quorum_reached BOOLEAN,
  source_url TEXT,
  source_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT proposal_vote_events_proposal_source_uidx UNIQUE (proposal_id, source_event_id)
);

CREATE TABLE public.proposal_vote_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id UUID NOT NULL REFERENCES public.proposals(id) ON DELETE CASCADE,
  event_id UUID NOT NULL REFERENCES public.proposal_vote_events(id) ON DELETE CASCADE,
  source_group_id TEXT NOT NULL,
  group_type TEXT NOT NULL,
  group_name TEXT NOT NULL,
  for_count INTEGER,
  against_count INTEGER,
  abstain_count INTEGER,
  absent_count INTEGER,
  source_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT proposal_vote_groups_event_source_uidx UNIQUE (event_id, source_group_id)
);

CREATE TABLE public.proposal_vote_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id UUID NOT NULL REFERENCES public.proposals(id) ON DELETE CASCADE,
  event_id UUID NOT NULL REFERENCES public.proposal_vote_events(id) ON DELETE CASCADE,
  source_record_id TEXT NOT NULL,
  politician_id UUID REFERENCES public.politicians(id) ON DELETE SET NULL,
  voter_name TEXT NOT NULL,
  party TEXT,
  vote_position TEXT NOT NULL CHECK (vote_position IN ('for', 'against', 'abstain', 'absent', 'paired', 'other')),
  confidence DOUBLE PRECISION,
  source_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT proposal_vote_records_event_source_uidx UNIQUE (event_id, source_record_id)
);

ALTER TABLE public.proposal_vote_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.proposal_vote_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.proposal_vote_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Proposal vote events are publicly readable"
ON public.proposal_vote_events
FOR SELECT
TO public
USING (true);

CREATE POLICY "Proposal vote groups are publicly readable"
ON public.proposal_vote_groups
FOR SELECT
TO public
USING (true);

CREATE POLICY "Proposal vote records are publicly readable"
ON public.proposal_vote_records
FOR SELECT
TO public
USING (true);

CREATE INDEX proposal_vote_events_proposal_idx ON public.proposal_vote_events (proposal_id, happened_at DESC NULLS LAST);
CREATE INDEX proposal_vote_groups_proposal_idx ON public.proposal_vote_groups (proposal_id, event_id);
CREATE INDEX proposal_vote_records_proposal_idx ON public.proposal_vote_records (proposal_id, event_id);
CREATE INDEX proposal_vote_records_politician_idx ON public.proposal_vote_records (politician_id);

CREATE TRIGGER update_proposal_vote_events_updated_at
BEFORE UPDATE ON public.proposal_vote_events
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_proposal_vote_groups_updated_at
BEFORE UPDATE ON public.proposal_vote_groups
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_proposal_vote_records_updated_at
BEFORE UPDATE ON public.proposal_vote_records
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
