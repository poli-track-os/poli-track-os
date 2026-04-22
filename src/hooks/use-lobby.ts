import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Tables } from '@/integrations/supabase/types';

export type LobbyOrganisationRow = Tables<'lobby_organisations'>;
export type LobbySpendRow = Tables<'lobby_spend'>;
export type LobbyMeetingRow = Tables<'lobby_meetings'>;

export interface LobbyOrganisationWithSpend extends LobbyOrganisationRow {
  latestSpend: number | null;
  latestSpendYear: number | null;
}

// Top organisations by latest spend, joined with their latest spend row.
export function useTopLobbyOrgs(limit = 50) {
  return useQuery({
    queryKey: ['top-lobby-orgs', limit],
    queryFn: async (): Promise<LobbyOrganisationWithSpend[]> => {
      const { data: orgs, error: orgErr } = await supabase
        .from('lobby_organisations')
        .select('*')
        .order('updated_at', { ascending: false })
        .limit(limit * 3);
      if (orgErr) throw orgErr;

      const orgRows = (orgs || []) as LobbyOrganisationRow[];
      if (orgRows.length === 0) return [];

      const { data: spend, error: spendErr } = await supabase
        .from('lobby_spend')
        .select('lobby_id, year, declared_amount_eur_high')
        .in('lobby_id', orgRows.map((o) => o.id))
        .order('year', { ascending: false });
      if (spendErr) throw spendErr;

      const latestByLobby = new Map<string, { year: number; amount: number }>();
      for (const row of (spend || []) as Array<{ lobby_id: string; year: number; declared_amount_eur_high: number | null }>) {
        if (latestByLobby.has(row.lobby_id)) continue;
        if (row.declared_amount_eur_high !== null) {
          latestByLobby.set(row.lobby_id, { year: row.year, amount: Number(row.declared_amount_eur_high) });
        }
      }

      const enriched: LobbyOrganisationWithSpend[] = orgRows.map((o) => ({
        ...o,
        latestSpend: latestByLobby.get(o.id)?.amount ?? null,
        latestSpendYear: latestByLobby.get(o.id)?.year ?? null,
      }));
      enriched.sort((a, b) => (b.latestSpend ?? 0) - (a.latestSpend ?? 0));
      return enriched.slice(0, limit);
    },
    staleTime: 1000 * 60 * 60,
  });
}

export function useLobbyOrg(transparencyId: string | undefined) {
  return useQuery({
    queryKey: ['lobby-org', transparencyId],
    queryFn: async () => {
      if (!transparencyId) return null;
      const { data, error } = await supabase
        .from('lobby_organisations')
        .select('*')
        .eq('transparency_id', transparencyId)
        .maybeSingle();
      if (error) throw error;
      return data as LobbyOrganisationRow | null;
    },
    enabled: !!transparencyId,
  });
}

export function useLobbySpendForOrg(lobbyId: string | undefined) {
  return useQuery({
    queryKey: ['lobby-spend', lobbyId],
    queryFn: async () => {
      if (!lobbyId) return [];
      const { data, error } = await supabase
        .from('lobby_spend')
        .select('*')
        .eq('lobby_id', lobbyId)
        .order('year', { ascending: true });
      if (error) throw error;
      return (data || []) as LobbySpendRow[];
    },
    enabled: !!lobbyId,
  });
}

export function useLobbyMeetingsForPolitician(politicianId: string | undefined) {
  return useQuery({
    queryKey: ['lobby-meetings-by-politician', politicianId],
    queryFn: async () => {
      if (!politicianId) return [];
      const { data, error } = await supabase
        .from('lobby_meetings')
        .select('*, lobby_organisations(name, transparency_id, category)')
        .eq('politician_id', politicianId)
        .order('meeting_date', { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data || []) as Array<LobbyMeetingRow & { lobby_organisations: { name: string; transparency_id: string; category: string | null } | null }>;
    },
    enabled: !!politicianId,
  });
}

export function useTotalLobbyOrgs() {
  return useQuery({
    queryKey: ['lobby-orgs-count'],
    queryFn: async () => {
      const { count, error } = await supabase
        .from('lobby_organisations')
        .select('id', { count: 'exact', head: true });
      if (error) throw error;
      return count ?? 0;
    },
  });
}
