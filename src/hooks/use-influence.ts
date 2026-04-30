import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

const db = supabase as any;

export interface InfluenceOverviewFilters {
  country?: string;
  principalCountry?: string;
  source?: string;
  sector?: string;
  targetInstitution?: string;
  evidence?: number;
  minAmount?: number;
  maxAmount?: number;
}

export interface InfluenceClient {
  id: string;
  name: string;
  country_code: string | null;
  principal_country_code: string | null;
  sector: string | null;
  is_foreign_principal: boolean;
  data_source?: string;
  source_url?: string | null;
}

export interface InfluenceMoney {
  id: string;
  payer_client_id: string | null;
  recipient_actor_id: string | null;
  recipient_company_id: string | null;
  money_type: string;
  amount_low: number | null;
  amount_high: number | null;
  amount_exact: number | null;
  currency: string;
  description: string | null;
  data_source: string;
  trust_level: number | null;
  source_url: string | null;
}

export interface InfluenceContact {
  id: string;
  filing_id: string | null;
  lobby_actor_id: string | null;
  client_id: string | null;
  target_politician_id: string | null;
  target_actor_id: string | null;
  target_name: string | null;
  target_institution: string | null;
  target_country_code: string | null;
  contact_date: string | null;
  contact_type: string;
  subject: string | null;
  location: string | null;
  data_source: string;
  trust_level: number | null;
  source_url: string | null;
}

export interface InfluenceFiling {
  id: string;
  filing_id: string;
  filing_type: string;
  registrant_actor_id: string | null;
  registrant_name: string | null;
  client_id: string | null;
  client_name: string | null;
  principal_country_code: string | null;
  year: number | null;
  quarter: number | null;
  issue_areas: string[];
  target_institutions: string[];
  amount_reported: number | null;
  amount_low: number | null;
  amount_high: number | null;
  currency: string;
  description: string | null;
  source_url: string | null;
  data_source: string;
  trust_level: number | null;
}

export interface PublicAffiliation {
  id: string;
  affiliation_type: string;
  affiliation_label: string;
  claim_text: string | null;
  source_url: string;
  source_title: string | null;
  trust_level: number | null;
  review_status: string;
  visible: boolean;
}

function amount(row: Pick<InfluenceMoney, 'amount_exact' | 'amount_high' | 'amount_low'>) {
  return Number(row.amount_exact ?? row.amount_high ?? row.amount_low ?? 0);
}

export function formatInfluenceAmount(value: number | null | undefined, currency = 'USD') {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  return new Intl.NumberFormat('en', {
    style: 'currency',
    currency,
    currencyDisplay: 'code',
    maximumFractionDigits: 0,
  }).format(value);
}

function applyEvidenceFilter<T extends { trust_level: number | null }>(rows: T[], evidence = 4) {
  return rows.filter((row) => row.trust_level === null || row.trust_level <= evidence);
}

export function useInfluenceOverview(filters: InfluenceOverviewFilters = {}) {
  return useQuery({
    queryKey: ['influence-overview', filters],
    queryFn: async () => {
      let clientsQuery = db
        .from('influence_clients')
        .select('*')
        .limit(2000);
      if (filters.country) clientsQuery = clientsQuery.eq('country_code', filters.country.toUpperCase());
      if (filters.principalCountry) clientsQuery = clientsQuery.eq('principal_country_code', filters.principalCountry.toUpperCase());
      if (filters.sector) clientsQuery = clientsQuery.ilike('sector', `%${filters.sector}%`);

      let contactsQuery = db
        .from('influence_contacts')
        .select('*')
        .limit(3000);
      if (filters.country) contactsQuery = contactsQuery.eq('target_country_code', filters.country.toUpperCase());
      if (filters.source) contactsQuery = contactsQuery.eq('data_source', filters.source);
      if (filters.targetInstitution) contactsQuery = contactsQuery.ilike('target_institution', `%${filters.targetInstitution}%`);

      let moneyQuery = db
        .from('influence_money')
        .select('*')
        .limit(5000);
      if (filters.source) moneyQuery = moneyQuery.eq('data_source', filters.source);

      const [clientsRes, contactsRes, moneyRes, overviewRes] = await Promise.all([
        clientsQuery,
        contactsQuery,
        moneyQuery,
        db.from('influence_registry_overview').select('*').maybeSingle(),
      ]);
      if (clientsRes.error) throw clientsRes.error;
      if (contactsRes.error) throw contactsRes.error;
      if (moneyRes.error) throw moneyRes.error;

      const evidence = filters.evidence ?? 4;
      const clients = (clientsRes.data || []) as InfluenceClient[];
      const clientById = new Map(clients.map((client) => [client.id, client]));
      const clientIds = new Set(clientById.keys());
      const contacts = applyEvidenceFilter((contactsRes.data || []) as InfluenceContact[], evidence)
        .filter((row) => !row.client_id || clientIds.has(row.client_id));
      const money = applyEvidenceFilter((moneyRes.data || []) as InfluenceMoney[], evidence)
        .filter((row) => !row.payer_client_id || clientIds.has(row.payer_client_id))
        .filter((row) => {
          const value = amount(row);
          if (filters.minAmount && value < filters.minAmount) return false;
          if (filters.maxAmount && value > filters.maxAmount) return false;
          return true;
        });

      const spendByClient = new Map<string, { id: string; name: string; amount: number; sector: string | null; principal_country_code: string | null }>();
      for (const row of money) {
        if (!row.payer_client_id) continue;
        const client = clientById.get(row.payer_client_id);
        if (!client) continue;
        const existing = spendByClient.get(client.id) || {
          id: client.id,
          name: client.name,
          amount: 0,
          sector: client.sector,
          principal_country_code: client.principal_country_code,
        };
        existing.amount += amount(row);
        spendByClient.set(client.id, existing);
      }

      const targetCounts = new Map<string, { name: string; count: number }>();
      const sourceCounts = new Map<string, { name: string; count: number }>();
      for (const row of contacts) {
        const target = row.target_institution || row.target_name;
        if (target) targetCounts.set(target, { name: target, count: (targetCounts.get(target)?.count || 0) + 1 });
        sourceCounts.set(row.data_source, { name: row.data_source, count: (sourceCounts.get(row.data_source)?.count || 0) + 1 });
      }
      for (const row of money) sourceCounts.set(row.data_source, { name: row.data_source, count: (sourceCounts.get(row.data_source)?.count || 0) + 1 });

      return {
        overview: overviewRes.data || null,
        clients,
        contacts,
        money,
        topSpenders: [...spendByClient.values()].sort((a, b) => b.amount - a.amount).slice(0, 25),
        topTargets: [...targetCounts.values()].sort((a, b) => b.count - a.count).slice(0, 25),
        sourceCounts: [...sourceCounts.values()].sort((a, b) => b.count - a.count),
      };
    },
  });
}

export function useInfluenceOrg(id: string | undefined) {
  return useQuery({
    queryKey: ['influence-org', id],
    queryFn: async () => {
      if (!id) return null;
      const [actorRes, clientRes, companyRes, filingsRes, contactsRes, moneyRes, officersRes, ownershipRes] = await Promise.all([
        db.from('influence_actors').select('*').eq('id', id).maybeSingle(),
        db.from('influence_clients').select('*').eq('id', id).maybeSingle(),
        db.from('companies').select('*').eq('id', id).maybeSingle(),
        db.from('influence_filings').select('*').or(`client_id.eq.${id},registrant_actor_id.eq.${id}`).limit(300),
        db.from('influence_contacts').select('*').or(`client_id.eq.${id},lobby_actor_id.eq.${id},target_actor_id.eq.${id}`).limit(300),
        db.from('influence_money').select('*').or(`payer_client_id.eq.${id},recipient_actor_id.eq.${id},recipient_company_id.eq.${id}`).limit(300),
        db.from('company_officers').select('*, companies(id, name, jurisdiction_code, sector)').eq('company_id', id).limit(200),
        db.from('beneficial_ownership').select('*').or(`owned_company_id.eq.${id},owner_actor_id.eq.${id},owner_company_id.eq.${id}`).limit(200),
      ]);
      if (actorRes.error) throw actorRes.error;
      if (clientRes.error) throw clientRes.error;
      if (companyRes.error) throw companyRes.error;
      return {
        actor: actorRes.data,
        client: clientRes.data,
        company: companyRes.data,
        filings: (filingsRes.data || []) as InfluenceFiling[],
        contacts: (contactsRes.data || []) as InfluenceContact[],
        money: (moneyRes.data || []) as InfluenceMoney[],
        officers: officersRes.data || [],
        ownership: ownershipRes.data || [],
      };
    },
    enabled: !!id,
  });
}

export function useInfluencePerson(id: string | undefined) {
  return useQuery({
    queryKey: ['influence-person', id],
    queryFn: async () => {
      if (!id) return null;
      const [actorRes, contactsRes, rolesRes, affiliationsRes] = await Promise.all([
        db.from('influence_actors').select('*').eq('id', id).maybeSingle(),
        db.from('influence_contacts').select('*').or(`lobby_actor_id.eq.${id},target_actor_id.eq.${id},target_politician_id.eq.${id}`).limit(300),
        db.from('company_officers').select('*, companies(id, name, jurisdiction_code, sector)').eq('actor_id', id).limit(200),
        db
          .from('public_affiliations_visible')
          .select('*')
          .or(`subject_actor_id.eq.${id},subject_politician_id.eq.${id}`)
          .eq('visible', true)
          .eq('review_status', 'approved'),
      ]);
      if (actorRes.error) throw actorRes.error;
      if (contactsRes.error) throw contactsRes.error;
      if (rolesRes.error) throw rolesRes.error;
      if (affiliationsRes.error) throw affiliationsRes.error;
      return {
        actor: actorRes.data,
        contacts: (contactsRes.data || []) as InfluenceContact[],
        companyRoles: rolesRes.data || [],
        publicAffiliations: (affiliationsRes.data || []) as PublicAffiliation[],
      };
    },
    enabled: !!id,
  });
}

export function useInfluenceCountry(code: string | undefined) {
  return useQuery({
    queryKey: ['influence-country', code],
    queryFn: async () => {
      if (!code) return null;
      const country = code.toUpperCase();
      const [clientsRes, filingsRes, contactsRes, moneyRes] = await Promise.all([
        db.from('influence_clients').select('*').or(`country_code.eq.${country},principal_country_code.eq.${country}`).limit(1000),
        db.from('influence_filings').select('*').eq('principal_country_code', country).limit(1000),
        db.from('influence_contacts').select('*').eq('target_country_code', country).limit(1000),
        db.from('influence_money').select('*').limit(3000),
      ]);
      if (clientsRes.error) throw clientsRes.error;
      if (filingsRes.error) throw filingsRes.error;
      if (contactsRes.error) throw contactsRes.error;
      if (moneyRes.error) throw moneyRes.error;
      const clients = (clientsRes.data || []) as InfluenceClient[];
      const ids = new Set(clients.map((client) => client.id));
      const money = ((moneyRes.data || []) as InfluenceMoney[]).filter((row) => row.payer_client_id && ids.has(row.payer_client_id));
      return {
        country,
        clients,
        filings: (filingsRes.data || []) as InfluenceFiling[],
        contacts: (contactsRes.data || []) as InfluenceContact[],
        money,
        recordedAmount: money.reduce((sum, row) => sum + amount(row), 0),
      };
    },
    enabled: !!code,
  });
}

export function useInfluenceNetwork(seed: string | null) {
  return useQuery({
    queryKey: ['influence-network', seed],
    queryFn: async () => {
      if (!seed) return { nodes: [], edges: [] };
      const [contactsRes, moneyRes, officersRes, ownershipRes] = await Promise.all([
        db.from('influence_contacts').select('*').or(`lobby_actor_id.eq.${seed},target_actor_id.eq.${seed},target_politician_id.eq.${seed},client_id.eq.${seed}`).limit(200),
        db.from('influence_money').select('*').or(`payer_client_id.eq.${seed},recipient_actor_id.eq.${seed},recipient_company_id.eq.${seed}`).limit(200),
        db.from('company_officers').select('*').or(`actor_id.eq.${seed},company_id.eq.${seed}`).limit(200),
        db.from('beneficial_ownership').select('*').or(`owner_actor_id.eq.${seed},owner_company_id.eq.${seed},owned_company_id.eq.${seed}`).limit(200),
      ]);
      if (contactsRes.error) throw contactsRes.error;
      if (moneyRes.error) throw moneyRes.error;
      if (officersRes.error) throw officersRes.error;
      if (ownershipRes.error) throw ownershipRes.error;
      return {
        nodes: [{ id: seed, label: seed, kind: 'seed' }],
        edges: [
          ...((contactsRes.data || []) as InfluenceContact[]).map((row) => ({ ...row, predicate: 'met_with' })),
          ...((moneyRes.data || []) as InfluenceMoney[]).map((row) => ({ ...row, predicate: 'paid_by', amount: amount(row) })),
          ...(officersRes.data || []).map((row: any) => ({ ...row, predicate: 'officer_of' })),
          ...(ownershipRes.data || []).map((row: any) => ({ ...row, predicate: 'beneficial_owner_of' })),
        ],
      };
    },
    enabled: !!seed,
  });
}

export function useInfluenceRelationshipSummary() {
  return useQuery({
    queryKey: ['influence-relationship-summary'],
    queryFn: async () => {
      const [contactsRes, moneyRes, officersRes, ownershipRes] = await Promise.all([
        db.from('influence_contacts').select('id, target_institution, target_country_code, data_source').limit(500),
        db.from('influence_money').select('id, amount_low, amount_high, amount_exact, currency, data_source').limit(500),
        db.from('company_officers').select('id, role, name, company_id, data_source').limit(500),
        db.from('beneficial_ownership').select('id, ownership_percent, control_type, data_source').limit(500),
      ]);
      if (contactsRes.error) throw contactsRes.error;
      if (moneyRes.error) throw moneyRes.error;
      if (officersRes.error) throw officersRes.error;
      if (ownershipRes.error) throw ownershipRes.error;
      return {
        contacts: contactsRes.data || [],
        money: moneyRes.data || [],
        officers: officersRes.data || [],
        ownership: ownershipRes.data || [],
      };
    },
  });
}
