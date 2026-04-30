import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Actor, ActorEvent } from '@/data/domain';
import type { Tables } from '@/integrations/supabase/types';
import { resolvePoliticalPosition } from '@/lib/political-positioning';

type Politician = Tables<'politicians'>;
type PoliticalEvent = Tables<'political_events'>;
const POLITICIANS_PAGE_SIZE = 1000;

export async function fetchAllPoliticianRows<T = Politician>(selectClause = '*') {
  const rows: T[] = [];

  for (let from = 0; ; from += POLITICIANS_PAGE_SIZE) {
    const { data, error } = await supabase
      .from('politicians')
      .select(selectClause)
      .order('id', { ascending: true })
      .range(from, from + POLITICIANS_PAGE_SIZE - 1);
    if (error) throw error;

    const chunk = (data || []) as T[];
    rows.push(...chunk);
    if (chunk.length < POLITICIANS_PAGE_SIZE) break;
  }

  return rows;
}

export function mapPoliticianToActor(p: Politician): Actor {
  return {
    id: p.id,
    name: p.name,
    partyId: p.party_abbreviation || 'unknown',
    party: p.party_abbreviation || p.party_name || 'Independent',
    partyName: p.party_name || undefined,
    partyAbbreviation: p.party_abbreviation || undefined,
    canton: p.country_name,
    cityId: '',
    countryId: p.country_code.toLowerCase(),
    role: p.role || 'Politician',
    jurisdiction: (p.jurisdiction as Actor['jurisdiction']) || 'federal',
    committees: p.committees || [],
    recentVotes: [],
    revisionId: `rev-${p.id.slice(0, 6)}`,
    updatedAt: p.updated_at,
    photoUrl: p.photo_url || undefined,
    birthYear: p.birth_year || undefined,
    inOfficeSince: p.in_office_since || undefined,
    twitterHandle: p.twitter_handle || undefined,
    wikipediaUrl: p.wikipedia_url || undefined,
    wikipediaSummary: p.wikipedia_summary || undefined,
    biography: p.biography || undefined,
    wikipediaImageUrl: p.wikipedia_image_url || undefined,
    wikipediaData: (p.wikipedia_data as Record<string, any>) || undefined,
    enrichedAt: p.enriched_at || undefined,
    dataSource: p.data_source || undefined,
    sourceUrl: p.source_url || undefined,
    sourceAttribution: (p.source_attribution as Record<string, any>) || undefined,
  };
}

export function mapEventToActorEvent(e: PoliticalEvent): ActorEvent {
  return {
    id: e.id,
    actorId: e.politician_id,
    hash: e.hash,
    timestamp: e.event_timestamp,
    type: e.event_type as ActorEvent['type'],
    title: e.title,
    description: e.description || '',
    diff: e.diff_removed || e.diff_added
      ? { removed: e.diff_removed || undefined, added: e.diff_added || undefined }
      : undefined,
    evidenceCount: e.evidence_count || 1,
    sourceUrl: e.source_url || undefined,
    source: e.source as ActorEvent['source'] | undefined,
    sourceHandle: e.source_handle || undefined,
    sentiment: e.sentiment as ActorEvent['sentiment'] | undefined,
    entities: e.entities || undefined,
    trustLevel: e.trust_level ?? undefined,
  };
}

export function usePoliticians() {
  return useQuery({
    queryKey: ['politicians'],
    queryFn: async () => {
      const data = await fetchAllPoliticianRows<Politician>('*');
      return data
        .map(mapPoliticianToActor)
        .sort((left, right) => left.name.localeCompare(right.name));
    },
  });
}

export function usePolitician(id: string | undefined) {
  return useQuery({
    queryKey: ['politician', id],
    queryFn: async () => {
      if (!id) return null;
      const { data, error } = await supabase
        .from('politicians')
        .select('*')
        .eq('id', id)
        .maybeSingle();
      if (error) throw error;
      return data ? mapPoliticianToActor(data) : null;
    },
    enabled: !!id,
  });
}

export interface PoliticianFinance {
  annual_salary: number | null;
  currency: string;
  side_income: number | null;
  declared_assets: number | null;
  property_value: number | null;
  declared_debt: number | null;
  salary_source: string | null;
  declaration_year: number;
}

export interface PoliticianInvestment {
  id: string;
  company_name: string;
  sector: string | null;
  investment_type: string;
  estimated_value: number | null;
  currency: string;
  is_active: boolean;
  notes: string | null;
}

export interface PoliticianOfficeCompensation {
  politician_id: string;
  politician_name: string;
  politician_role: string | null;
  country_code: string;
  country_name: string;
  jurisdiction: string;
  chamber_id: string | null;
  office_type: string;
  office_title: string;
  year: number;
  effective_date: string;
  date_to: string | null;
  period: string;
  amount: number;
  annual_amount: number;
  currency: string;
  annual_amount_eur: number | null;
  source_url: string;
  source_label: string;
  source_type: string;
  trust_level: number;
  notes: string | null;
}

export function usePoliticianFinances(politicianId: string | undefined) {
  return useQuery({
    queryKey: ['politician-finances', politicianId],
    queryFn: async () => {
      if (!politicianId) return null;
      const { data, error } = await supabase
        .from('politician_finances')
        .select('*')
        .eq('politician_id', politicianId)
        .order('declaration_year', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data as PoliticianFinance | null;
    },
    enabled: !!politicianId,
  });
}

export function usePoliticianOfficeCompensation(politicianId: string | undefined) {
  return useQuery({
    queryKey: ['politician-office-compensation', politicianId],
    queryFn: async () => {
      if (!politicianId) return [];
      const client = supabase as any;
      const { data, error } = await client
        .from('politician_current_office_compensation')
        .select('politician_id, politician_name, politician_role, country_code, country_name, jurisdiction, chamber_id, office_type, office_title, year, effective_date, date_to, period, amount, annual_amount, currency, annual_amount_eur, source_url, source_label, source_type, trust_level, notes')
        .eq('politician_id', politicianId)
        .order('year', { ascending: false });
      if (error) throw error;
      return (data || []) as PoliticianOfficeCompensation[];
    },
    enabled: !!politicianId,
    staleTime: 10 * 60 * 1000,
  });
}

export function usePoliticianInvestments(politicianId: string | undefined) {
  return useQuery({
    queryKey: ['politician-investments', politicianId],
    queryFn: async () => {
      if (!politicianId) return [];
      const { data, error } = await supabase
        .from('politician_investments')
        .select('*')
        .eq('politician_id', politicianId)
        .order('estimated_value', { ascending: false });
      if (error) throw error;
      return (data || []) as PoliticianInvestment[];
    },
    enabled: !!politicianId,
  });
}

export function usePoliticianEvents(politicianId: string | undefined) {
  return useQuery({
    queryKey: ['politician-events', politicianId],
    queryFn: async () => {
      if (!politicianId) return [];
      const { data, error } = await supabase
        .from('political_events')
        .select('*')
        .eq('politician_id', politicianId)
        .order('event_timestamp', { ascending: false });
      if (error) throw error;
      return (data || []).map(mapEventToActorEvent);
    },
    enabled: !!politicianId,
  });
}

export function usePoliticianPosition(politicianId: string | undefined) {
  return useQuery({
    queryKey: ['politician-position', politicianId],
    queryFn: async () => {
      if (!politicianId) return null;
      // Order by updated_at desc + limit(1) so a row history (or a
      // schema relaxation that allowed multiple rows) doesn't crash the
      // hook with `JSON object requested, multiple (or no) rows returned`.
      // Also include `name` in the join so the returned shape matches
      // useAllPositions().
      const { data, error } = await supabase
        .from('politician_positions')
        .select('*, politicians!inner(name, party_name, party_abbreviation, country_code)')
        .eq('politician_id', politicianId)
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;

      const politician = (data as any).politicians;
      return {
        ...resolvePoliticalPosition(
          data as any,
          politician?.party_name,
          politician?.party_abbreviation,
          politician?.country_code,
        ),
        // Match useAllPositions shape so consumers can compose the two.
        politician_id: politicianId,
        name: politician?.name,
        party: politician?.party_abbreviation,
        partyName: politician?.party_name,
        country: politician?.country_code,
      };
    },
    enabled: !!politicianId,
  });
}

export function useAllPositions() {
  return useQuery({
    queryKey: ['all-positions'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('politician_positions')
        .select('*, politicians!inner(name, party_name, party_abbreviation, country_code)');
      if (error) throw error;
      return (data || []).map((d: any) => ({
        ...resolvePoliticalPosition(
          d,
          d.politicians?.party_name,
          d.politicians?.party_abbreviation,
          d.politicians?.country_code,
        ),
        name: d.politicians?.name,
        party: d.politicians?.party_abbreviation,
        partyName: d.politicians?.party_name,
        country: d.politicians?.country_code,
      }));
    },
  });
}

export interface PoliticianAssociate {
  id: string;
  associate_id: string;
  relationship_type: string;
  strength: number;
  context: string | null;
  is_domestic: boolean;
  name: string;
  party: string | null;
  country_code: string;
  country_name: string;
  photo_url: string | null;
  role: string | null;
}

export function usePoliticianAssociates(politicianId: string | undefined) {
  return useQuery({
    queryKey: ['politician-associates', politicianId],
    queryFn: async () => {
      if (!politicianId) return [];
      // Get associations where this politician is either side
      const [{ data: d1, error: e1 }, { data: d2, error: e2 }] = await Promise.all([
        supabase
          .from('politician_associations')
          .select('id, associate_id, relationship_type, strength, context, is_domestic, politicians!politician_associations_associate_id_fkey(name, party_abbreviation, country_code, country_name, photo_url, role)')
          .eq('politician_id', politicianId)
          .order('strength', { ascending: false })
          .limit(20),
        supabase
          .from('politician_associations')
          .select('id, politician_id, relationship_type, strength, context, is_domestic, politicians!politician_associations_politician_id_fkey(name, party_abbreviation, country_code, country_name, photo_url, role)')
          .eq('associate_id', politicianId)
          .order('strength', { ascending: false })
          .limit(20),
      ]);
      if (e1) throw e1;
      if (e2) throw e2;

      const seen = new Set<string>();
      const results: PoliticianAssociate[] = [];

      for (const r of d1 || []) {
        const p = (r as any).politicians;
        if (!p || seen.has(r.associate_id)) continue;
        seen.add(r.associate_id);
        results.push({
          id: r.id,
          associate_id: r.associate_id,
          relationship_type: r.relationship_type,
          strength: Number(r.strength),
          context: r.context,
          is_domestic: r.is_domestic,
          name: p.name,
          party: p.party_abbreviation,
          country_code: p.country_code,
          country_name: p.country_name,
          photo_url: p.photo_url,
          role: p.role,
        });
      }
      for (const r of d2 || []) {
        const p = (r as any).politicians;
        if (!p || seen.has(r.politician_id)) continue;
        seen.add(r.politician_id);
        results.push({
          id: r.id,
          associate_id: r.politician_id,
          relationship_type: r.relationship_type,
          strength: Number(r.strength),
          context: r.context,
          is_domestic: r.is_domestic,
          name: p.name,
          party: p.party_abbreviation,
          country_code: p.country_code,
          country_name: p.country_name,
          photo_url: p.photo_url,
          role: p.role,
        });
      }

      return results.sort((a, b) => b.strength - a.strength).slice(0, 20);
    },
    enabled: !!politicianId,
  });
}

export function usePoliticiansByCountry(countryCode: string | undefined) {
  // Normalize the cache key by uppercasing the country code. Without
  // this, `/country/de` and `/country/DE` produce two separate cache
  // entries (and two separate fetches) for identical results.
  const normalized = countryCode?.toUpperCase();
  return useQuery({
    queryKey: ['politicians-by-country', normalized],
    queryFn: async () => {
      if (!normalized) return [];
      const { data, error } = await supabase
        .from('politicians')
        .select('*')
        .eq('country_code', normalized)
        .order('name');
      if (error) throw error;
      return (data || []).map(mapPoliticianToActor);
    },
    enabled: !!normalized,
  });
}

export function useCountryStats() {
  return useQuery({
    queryKey: ['country-stats'],
    queryFn: async () => {
      const data = await fetchAllPoliticianRows<Pick<Politician, 'country_code' | 'country_name' | 'continent' | 'party_name'>>(
        'country_code, country_name, continent, party_name',
      );
      
      const countries = new Map<string, { code: string; name: string; continent: string; actorCount: number; parties: Set<string> }>();
      for (const p of data) {
        const existing = countries.get(p.country_code) || {
          code: p.country_code,
          name: p.country_name,
          continent: p.continent || 'Unknown',
          actorCount: 0,
          parties: new Set<string>(),
        };
        existing.actorCount++;
        if (p.party_name) existing.parties.add(p.party_name);
        countries.set(p.country_code, existing);
      }
      
      return Array.from(countries.values())
        .map(c => ({
          ...c,
          partyCount: c.parties.size,
          parties: Array.from(c.parties),
        }))
        .sort((left, right) => right.actorCount - left.actorCount || left.name.localeCompare(right.name));
    },
  });
}
