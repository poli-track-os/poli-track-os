import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { buildVoteIntegrityReport, type ProposalVoteEvent, type ProposalVoteGroup, type ProposalVoteRecord } from '@/lib/proposal-vote-analytics';

const DEFAULT_PROPOSAL_LIST_PAGE_SIZE = 1000;
const PROPOSALS_LIST_STALE_TIME_MS = 1000 * 60 * 5;
const PROPOSALS_STATS_STALE_TIME_MS = 1000 * 60 * 30;
const PROPOSALS_CACHE_TIME_MS = 1000 * 60 * 60;

export interface DbProposal {
  id: string;
  title: string;
  official_title: string | null;
  status: string;
  proposal_type: string;
  jurisdiction: string;
  country_code: string;
  country_name: string;
  vote_date: string | null;
  submitted_date: string;
  sponsors: string[];
  affected_laws: string[];
  evidence_count: number;
  summary: string | null;
  policy_area: string | null;
  source_url: string | null;
  data_source: string;
  created_at: string;
  updated_at: string;
}

export interface ProposalVotesPayload {
  events: ProposalVoteEvent[];
  groups: ProposalVoteGroup[];
  records: ProposalVoteRecord[];
  latestEvent: ProposalVoteEvent | null;
  latestEventGroups: ProposalVoteGroup[];
  latestEventRecords: ProposalVoteRecord[];
  integrity: ReturnType<typeof buildVoteIntegrityReport>;
}

export interface ProposalStatsCountBucket {
  name: string;
  count: number;
}

export interface ProposalStatsCountryBucket {
  code: string;
  name: string;
  count: number;
}

export interface ProposalStatsPayload {
  total: number;
  byCountry: ProposalStatsCountryBucket[];
  byStatus: ProposalStatsCountBucket[];
  byArea: ProposalStatsCountBucket[];
}

export interface ProposalFilters {
  countryCode?: string;
  status?: string;
  policyArea?: string;
  page?: number;
  pageSize?: number;
}

export const statusLabels: Record<string, string> = {
  consultation: 'CONSULTATION',
  committee: 'COMMITTEE',
  plenary: 'PLENARY',
  adopted: 'ADOPTED',
  rejected: 'REJECTED',
  withdrawn: 'WITHDRAWN',
  pending_vote: 'PENDING VOTE',
  parliamentary_deliberation: 'DELIBERATION',
  accepted: 'ACCEPTED',
};

export const statusColors: Record<string, string> = {
  consultation: 'bg-accent/10',
  committee: 'bg-warning/10',
  plenary: 'bg-primary/10',
  adopted: 'bg-green-500/10',
  accepted: 'bg-green-500/10',
  rejected: 'bg-destructive/10',
  withdrawn: 'bg-muted',
  pending_vote: 'bg-destructive/10',
  parliamentary_deliberation: 'bg-warning/10',
};

export function useProposals(filters?: ProposalFilters) {
  // Normalize country_code to uppercase so URL params like
  // `/proposals?country=de` still match the uppercase DB values.
  const normalized = filters
    ? {
        ...filters,
        countryCode: filters.countryCode?.toUpperCase(),
        page: filters.page ?? 1,
        pageSize: filters.pageSize ?? DEFAULT_PROPOSAL_LIST_PAGE_SIZE,
      }
    : undefined;
  return useQuery({
    queryKey: ['proposals', normalized],
    queryFn: async () => {
      let query = supabase
        .from('proposals')
        .select('*')
        .order('submitted_date', { ascending: false });

      if (normalized?.countryCode) query = query.eq('country_code', normalized.countryCode);
      if (normalized?.status) query = query.eq('status', normalized.status);
      if (normalized?.policyArea) query = query.eq('policy_area', normalized.policyArea);

      const page = normalized?.page ?? 1;
      const pageSize = normalized?.pageSize ?? DEFAULT_PROPOSAL_LIST_PAGE_SIZE;
      const from = Math.max(0, (page - 1) * pageSize);
      const to = from + pageSize - 1;

      const { data, error } = await query.range(from, to);
      if (error) throw error;
      return (data || []) as DbProposal[];
    },
    staleTime: PROPOSALS_LIST_STALE_TIME_MS,
    gcTime: PROPOSALS_CACHE_TIME_MS,
  });
}

export function useProposal(id: string | undefined) {
  return useQuery({
    queryKey: ['proposal', id],
    queryFn: async () => {
      if (!id) return null;
      const { data, error } = await supabase.from('proposals').select('*').eq('id', id).maybeSingle();
      if (error) throw error;
      return data as DbProposal | null;
    },
    enabled: !!id,
  });
}

export function useProposalVotes(id: string | undefined) {
  return useQuery({
    queryKey: ['proposal-votes', id],
    queryFn: async () => {
      if (!id) return null;
      const { data: events, error: eventsError } = await supabase
        .from('proposal_vote_events')
        .select('*')
        .eq('proposal_id', id)
        .order('happened_at', { ascending: false, nullsFirst: false });
      if (eventsError) throw eventsError;
      const voteEvents = (events ?? []) as ProposalVoteEvent[];
      if (voteEvents.length === 0) {
        return {
          events: [],
          groups: [],
          records: [],
          latestEvent: null,
          latestEventGroups: [],
          latestEventRecords: [],
          integrity: buildVoteIntegrityReport(null, []),
        } as ProposalVotesPayload;
      }

      const eventIds = voteEvents.map((event) => event.id);
      const [{ data: groups, error: groupsError }, { data: records, error: recordsError }] = await Promise.all([
        supabase.from('proposal_vote_groups').select('*').in('event_id', eventIds),
        supabase.from('proposal_vote_records').select('*').in('event_id', eventIds),
      ]);
      if (groupsError) throw groupsError;
      if (recordsError) throw recordsError;

      const voteGroups = (groups ?? []) as ProposalVoteGroup[];
      const voteRecords = (records ?? []) as ProposalVoteRecord[];
      const latestEvent = voteEvents[0] ?? null;
      const latestEventGroups = latestEvent ? voteGroups.filter((group) => group.event_id === latestEvent.id) : [];
      const latestEventRecords = latestEvent ? voteRecords.filter((record) => record.event_id === latestEvent.id) : [];
      return {
        events: voteEvents,
        groups: voteGroups,
        records: voteRecords,
        latestEvent,
        latestEventGroups,
        latestEventRecords,
        integrity: buildVoteIntegrityReport(latestEvent, latestEventRecords),
      } as ProposalVotesPayload;
    },
    enabled: !!id,
  });
}

export function useProposalsByCountry(countryCode: string | undefined) {
  const normalized = countryCode?.toUpperCase();
  return useQuery({
    queryKey: ['proposals-by-country', normalized],
    queryFn: async () => {
      if (!normalized) return [];
      const { data, error } = await supabase
        .from('proposals')
        .select('*')
        .eq('country_code', normalized)
        .order('submitted_date', { ascending: false })
        .limit(20);
      if (error) throw error;
      return (data || []) as DbProposal[];
    },
    enabled: !!normalized,
  });
}

export function useProposalsByPolicyAreas(areas: string[]) {
  return useQuery({
    queryKey: ['proposals-by-areas', areas],
    queryFn: async () => {
      if (!areas.length) return [];
      const { data, error } = await supabase
        .from('proposals')
        .select('*')
        .in('policy_area', areas)
        .order('submitted_date', { ascending: false })
        .limit(10);
      if (error) throw error;
      return (data || []) as DbProposal[];
    },
    enabled: areas.length > 0,
  });
}

export function useProposalStats() {
  return useQuery({
    queryKey: ['proposal-stats'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_proposal_stats');
      if (error) throw error;

      const stats = (data ?? {}) as Partial<ProposalStatsPayload> | null;
      return {
        total: typeof stats?.total === 'number' ? stats.total : 0,
        byCountry: Array.isArray(stats?.byCountry) ? stats.byCountry : [],
        byStatus: Array.isArray(stats?.byStatus) ? stats.byStatus : [],
        byArea: Array.isArray(stats?.byArea) ? stats.byArea : [],
      } satisfies ProposalStatsPayload;
    },
    staleTime: PROPOSALS_STATS_STALE_TIME_MS,
    gcTime: PROPOSALS_CACHE_TIME_MS,
  });
}

export function useProposalTotalCount() {
  return useQuery({
    queryKey: ['proposal-total-count'],
    queryFn: async () => {
      const { count, error } = await supabase.from('proposals').select('id', { count: 'exact', head: true });
      if (error) throw error;
      return count || 0;
    },
    staleTime: PROPOSALS_STATS_STALE_TIME_MS,
    gcTime: PROPOSALS_CACHE_TIME_MS,
  });
}
