import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Tables } from '@/integrations/supabase/types';

type QueryResult<T> = Promise<{ data: T | null; error: Error | null }>;
type RegistryQuery = {
  select: (columns?: string) => RegistryQuery;
  maybeSingle: () => QueryResult<unknown>;
  limit: (count: number) => QueryResult<unknown[]>;
};
const registryDb = supabase as unknown as { from: (table: string) => RegistryQuery };

export type LobbyOrganisationRow = Tables<'lobby_organisations'>;
export type LobbySpendRow = Tables<'lobby_spend'>;
export type LobbyMeetingRow = Tables<'lobby_meetings'>;

export interface LobbyOrganisationWithSpend extends LobbyOrganisationRow {
  latestSpend: number | null;
  latestSpendYear: number | null;
}

interface InfluenceRegistryOverview {
  filings_total: number;
  clients_total: number;
  actors_total: number;
  companies_total: number;
  contacts_total: number;
  money_rows_total: number;
  recorded_amount_total: number | string | null;
}

interface LobbyInfluenceClient {
  id: string;
  name: string;
  principal_country_code: string | null;
  sector: string | null;
  source_url: string | null;
}

interface LobbyInfluenceMoney {
  payer_client_id: string | null;
  amount_low: number | string | null;
  amount_high: number | string | null;
  amount_exact: number | string | null;
  currency: string | null;
}

interface LobbyInfluenceContact {
  target_institution: string | null;
  target_name: string | null;
}

export interface LobbyInfluenceSummary {
  overview: InfluenceRegistryOverview | null;
  topInfluenceSpenders: Array<{
    id: string;
    name: string;
    amount: number;
    principalCountryCode: string | null;
    sector: string | null;
    sourceUrl: string | null;
  }>;
  topInfluenceTargets: Array<{ name: string; count: number }>;
}

function disclosedAmount(row: LobbyInfluenceMoney): number {
  return Number(row.amount_exact ?? row.amount_high ?? row.amount_low ?? 0);
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
    staleTime: 1000 * 60 * 60,
  });
}

export function useLobbyInfluenceSummary() {
  return useQuery({
    queryKey: ['lobby-influence-summary'],
    queryFn: async (): Promise<LobbyInfluenceSummary> => {
      const [overviewRes, clientsRes, moneyRes, contactsRes] = await Promise.all([
        registryDb.from('influence_registry_overview').select('*').maybeSingle(),
        registryDb
          .from('influence_clients')
          .select('id, name, principal_country_code, sector, source_url')
          .limit(1000),
        registryDb
          .from('influence_money')
          .select('payer_client_id, amount_low, amount_high, amount_exact, currency')
          .limit(1000),
        registryDb
          .from('influence_contacts')
          .select('target_institution, target_name')
          .limit(1000),
      ]);

      if (overviewRes.error) throw overviewRes.error;
      if (clientsRes.error) throw clientsRes.error;
      if (moneyRes.error) throw moneyRes.error;
      if (contactsRes.error) throw contactsRes.error;

      const clients = (clientsRes.data || []) as LobbyInfluenceClient[];
      const clientById = new Map(clients.map((client) => [client.id, client]));
      const spendByClient = new Map<string, LobbyInfluenceSummary['topInfluenceSpenders'][number]>();

      for (const row of (moneyRes.data || []) as LobbyInfluenceMoney[]) {
        if (!row.payer_client_id) continue;
        const client = clientById.get(row.payer_client_id);
        if (!client) continue;
        const existing = spendByClient.get(client.id) || {
          id: client.id,
          name: client.name,
          amount: 0,
          principalCountryCode: client.principal_country_code,
          sector: client.sector,
          sourceUrl: client.source_url,
        };
        existing.amount += disclosedAmount(row);
        spendByClient.set(client.id, existing);
      }

      const targetCounts = new Map<string, { name: string; count: number }>();
      for (const row of (contactsRes.data || []) as LobbyInfluenceContact[]) {
        const name = row.target_institution || row.target_name;
        if (!name) continue;
        targetCounts.set(name, { name, count: (targetCounts.get(name)?.count || 0) + 1 });
      }

      return {
        overview: (overviewRes.data as InfluenceRegistryOverview | null) || null,
        topInfluenceSpenders: [...spendByClient.values()].sort((a, b) => b.amount - a.amount).slice(0, 8),
        topInfluenceTargets: [...targetCounts.values()].sort((a, b) => b.count - a.count).slice(0, 8),
      };
    },
    staleTime: 1000 * 60 * 10,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
}
