import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

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
  created_at: string;
  updated_at: string;
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

export function useProposals(filters?: { countryCode?: string; status?: string; policyArea?: string }) {
  return useQuery({
    queryKey: ['proposals', filters],
    queryFn: async () => {
      let query = supabase.from('proposals').select('*').order('submitted_date', { ascending: false });
      if (filters?.countryCode) query = query.eq('country_code', filters.countryCode);
      if (filters?.status) query = query.eq('status', filters.status);
      if (filters?.policyArea) query = query.eq('policy_area', filters.policyArea);
      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as DbProposal[];
    },
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

export function useProposalsByCountry(countryCode: string | undefined) {
  return useQuery({
    queryKey: ['proposals-by-country', countryCode],
    queryFn: async () => {
      if (!countryCode) return [];
      const { data, error } = await supabase
        .from('proposals')
        .select('*')
        .eq('country_code', countryCode.toUpperCase())
        .order('submitted_date', { ascending: false })
        .limit(20);
      if (error) throw error;
      return (data || []) as DbProposal[];
    },
    enabled: !!countryCode,
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
      const { data, error } = await supabase.from('proposals').select('country_code, country_name, status, policy_area, proposal_type');
      if (error) throw error;
      const proposals = data || [];

      const byCountry: Record<string, { code: string; name: string; count: number }> = {};
      const byStatus: Record<string, number> = {};
      const byArea: Record<string, number> = {};

      proposals.forEach((p: any) => {
        if (!byCountry[p.country_code]) byCountry[p.country_code] = { code: p.country_code, name: p.country_name, count: 0 };
        byCountry[p.country_code].count++;
        byStatus[p.status] = (byStatus[p.status] || 0) + 1;
        if (p.policy_area) byArea[p.policy_area] = (byArea[p.policy_area] || 0) + 1;
      });

      return {
        total: proposals.length,
        byCountry: Object.values(byCountry).sort((a, b) => b.count - a.count),
        byStatus: Object.entries(byStatus).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count),
        byArea: Object.entries(byArea).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count),
      };
    },
  });
}
