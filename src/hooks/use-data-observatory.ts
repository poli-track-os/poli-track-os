import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Json, Tables } from '@/integrations/supabase/types';
import { buildCoverageModel, type CoveragePoliticianRow } from '@/lib/data-coverage';
import { getIdeologyFamily, resolvePoliticalPosition } from '@/lib/political-positioning';

const PAGE_SIZE = 1000;

export const EU_COUNTRY_DATA: Record<string, { population: number; gdp: number; area: number }> = {
  DE: { population: 84_482_000, gdp: 4_456, area: 357_022 },
  FR: { population: 68_170_000, gdp: 3_049, area: 551_695 },
  IT: { population: 58_850_000, gdp: 2_186, area: 301_340 },
  ES: { population: 48_345_000, gdp: 1_582, area: 505_990 },
  PL: { population: 37_750_000, gdp: 842, area: 312_696 },
  RO: { population: 19_038_000, gdp: 351, area: 238_397 },
  NL: { population: 17_811_000, gdp: 1_092, area: 41_543 },
  BE: { population: 11_686_000, gdp: 624, area: 30_528 },
  CZ: { population: 10_827_000, gdp: 335, area: 78_871 },
  GR: { population: 10_394_000, gdp: 239, area: 131_957 },
  PT: { population: 10_379_000, gdp: 287, area: 92_212 },
  SE: { population: 10_551_000, gdp: 593, area: 450_295 },
  HU: { population: 9_597_000, gdp: 203, area: 93_028 },
  AT: { population: 9_158_000, gdp: 516, area: 83_879 },
  BG: { population: 6_447_000, gdp: 114, area: 110_879 },
  DK: { population: 5_946_000, gdp: 404, area: 42_943 },
  FI: { population: 5_563_000, gdp: 300, area: 338_424 },
  SK: { population: 5_428_000, gdp: 127, area: 49_035 },
  IE: { population: 5_194_000, gdp: 545, area: 70_273 },
  HR: { population: 3_855_000, gdp: 82, area: 56_594 },
  LT: { population: 2_860_000, gdp: 77, area: 65_300 },
  SI: { population: 2_116_000, gdp: 68, area: 20_273 },
  LV: { population: 1_884_000, gdp: 43, area: 64_559 },
  EE: { population: 1_366_000, gdp: 41, area: 45_228 },
  CY: { population: 1_260_000, gdp: 32, area: 9_251 },
  LU: { population: 672_000, gdp: 87, area: 2_586 },
  MT: { population: 542_000, gdp: 20, area: 316 },
};

type ObservatoryOverviewRow = Tables<'politician_data_observatory_overview'>;

type ProposalBucket = { code: string; name: string; count: number };
type NamedCountBucket = { name: string; count: number };

type ProposalStatsPayload = {
  total: number;
  byCountry: ProposalBucket[];
  byStatus: NamedCountBucket[];
  byArea: NamedCountBucket[];
  byType: NamedCountBucket[];
};

type PoliticalEventStatsPayload = {
  total: number;
  byType: NamedCountBucket[];
};

type LegacyOverviewRow = Pick<
  Tables<'politicians'>,
  | 'id'
  | 'name'
  | 'role'
  | 'country_code'
  | 'country_name'
  | 'party_name'
  | 'party_abbreviation'
  | 'jurisdiction'
  | 'wikipedia_url'
  | 'enriched_at'
  | 'birth_year'
  | 'twitter_handle'
  | 'biography'
  | 'wikipedia_summary'
  | 'photo_url'
  | 'wikipedia_image_url'
>;

type MissingObjectErrorLike = {
  code?: string;
  message?: string;
};

function titleize(value: string) {
  return value
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function isMissingObjectError(error: unknown) {
  const candidate = error as MissingObjectErrorLike | null | undefined;
  const message = candidate?.message?.toLowerCase() || '';
  return (
    candidate?.code === 'PGRST202' ||
    candidate?.code === 'PGRST205' ||
    candidate?.code === '42P01' ||
    candidate?.code === '42883' ||
    message.includes('could not find the table') ||
    message.includes('could not find the function') ||
    message.includes('does not exist')
  );
}

async function fetchAllPages<T>(fetchPage: (from: number, to: number) => Promise<T[]>) {
  const rows: T[] = [];

  for (let offset = 0; ; offset += PAGE_SIZE) {
    const chunk = await fetchPage(offset, offset + PAGE_SIZE - 1);
    rows.push(...chunk);
    if (chunk.length < PAGE_SIZE) break;
  }

  return rows;
}

async function fetchOfficeCompensationRows() {
  try {
    return await fetchAllPages<any>(async (from, to) => {
      const { data, error } = await (supabase as any)
        .from('public_office_compensation')
        .select('country_code, country_name, office_type, office_title, year, effective_date, annual_amount, currency, annual_amount_eur, source_type, trust_level, source_label, source_url')
        .order('country_code', { ascending: true })
        .range(from, to);
      if (error) throw error;
      return data || [];
    });
  } catch (error) {
    if (isMissingObjectError(error)) return [];
    throw error;
  }
}

export function mapOverviewRowToCoveragePolitician(row: ObservatoryOverviewRow): CoveragePoliticianRow {
  return {
    id: row.id,
    name: row.name,
    role: row.role,
    country_code: row.country_code,
    country_name: row.country_name,
    party_name: row.party_name,
    party_abbreviation: row.party_abbreviation,
    biography: row.has_biography ? '__available__' : null,
    photo_url: row.has_photo ? '__available__' : null,
    wikipedia_url: row.wikipedia_url,
    wikipedia_summary: null,
    wikipedia_image_url: null,
    enriched_at: row.enriched_at,
    birth_year: row.birth_year,
    twitter_handle: row.twitter_handle,
  };
}

function mapLegacyPoliticianToOverviewRow(row: LegacyOverviewRow): ObservatoryOverviewRow {
  return {
    id: row.id,
    name: row.name,
    role: row.role,
    country_code: row.country_code,
    country_name: row.country_name,
    party_name: row.party_name,
    party_abbreviation: row.party_abbreviation,
    jurisdiction: row.jurisdiction,
    wikipedia_url: row.wikipedia_url,
    enriched_at: row.enriched_at,
    birth_year: row.birth_year,
    twitter_handle: row.twitter_handle,
    has_biography: Boolean(row.biography || row.wikipedia_summary),
    has_photo: Boolean(row.photo_url || row.wikipedia_image_url),
  };
}

export function normalizeProposalStatsPayload(stats: Json | null | undefined): ProposalStatsPayload {
  const payload = (stats ?? {}) as Partial<ProposalStatsPayload> | null;
  const toBuckets = (value: unknown, mapper?: (bucket: NamedCountBucket) => NamedCountBucket) =>
    Array.isArray(value)
      ? value
          .filter((entry): entry is NamedCountBucket => Boolean(entry) && typeof entry === 'object')
          .map((entry) => {
            const bucket = {
              name: typeof entry.name === 'string' ? entry.name : 'Unknown',
              count: typeof entry.count === 'number' ? entry.count : 0,
            };
            return mapper ? mapper(bucket) : bucket;
          })
      : [];

  return {
    total: typeof payload?.total === 'number' ? payload.total : 0,
    byCountry: Array.isArray(payload?.byCountry)
      ? payload.byCountry
          .filter((entry): entry is ProposalBucket => Boolean(entry) && typeof entry === 'object')
          .map((entry) => ({
            code: typeof entry.code === 'string' ? entry.code : '??',
            name: typeof entry.name === 'string' ? entry.name : (typeof entry.code === 'string' ? entry.code : 'Unknown'),
            count: typeof entry.count === 'number' ? entry.count : 0,
          }))
      : [],
    byStatus: toBuckets(payload?.byStatus, (bucket) => ({ ...bucket, name: titleize(bucket.name) })),
    byArea: toBuckets(payload?.byArea, (bucket) => ({ ...bucket, name: titleize(bucket.name) })),
    byType: toBuckets(payload?.byType, (bucket) => ({ ...bucket, name: titleize(bucket.name) })),
  };
}

export function normalizePoliticalEventStatsPayload(stats: Json | null | undefined): PoliticalEventStatsPayload {
  const payload = (stats ?? {}) as Partial<PoliticalEventStatsPayload> | null;
  return {
    total: typeof payload?.total === 'number' ? payload.total : 0,
    byType: Array.isArray(payload?.byType)
      ? payload.byType
          .filter((entry): entry is NamedCountBucket => Boolean(entry) && typeof entry === 'object')
          .map((entry) => ({
            name: typeof entry.name === 'string' ? titleize(entry.name) : 'Unknown',
            count: typeof entry.count === 'number' ? entry.count : 0,
          }))
      : [],
  };
}

async function fetchOverviewRows() {
  const preferred = await fetchAllPages<ObservatoryOverviewRow>(async (from, to) => {
    const { data, error } = await supabase
      .from('politician_data_observatory_overview')
      .select('id, name, role, country_code, country_name, party_name, party_abbreviation, jurisdiction, wikipedia_url, enriched_at, birth_year, twitter_handle, has_biography, has_photo')
      .order('id', { ascending: true })
      .range(from, to);
    if (error) throw error;
    return data || [];
  }).catch(async (error) => {
    if (!isMissingObjectError(error)) throw error;
    const legacyRows = await fetchAllPages<LegacyOverviewRow>(async (from, to) => {
      const { data, error: fallbackError } = await supabase
        .from('politicians')
        .select('id, name, role, country_code, country_name, party_name, party_abbreviation, jurisdiction, wikipedia_url, enriched_at, birth_year, twitter_handle, biography, wikipedia_summary, photo_url, wikipedia_image_url')
        .order('id', { ascending: true })
        .range(from, to);
      if (fallbackError) throw fallbackError;
      return data || [];
    });
    return legacyRows.map(mapLegacyPoliticianToOverviewRow);
  });

  return preferred;
}

async function fetchPoliticalEventStats() {
  const { data, error } = await supabase.rpc('get_political_event_stats');
  if (!error) return normalizePoliticalEventStatsPayload(data);
  if (!isMissingObjectError(error)) throw error;

  const events = await fetchAllPages<{ event_type: string | null }>(async (from, to) => {
    const { data, error: fallbackError } = await supabase
      .from('political_events')
      .select('event_type')
      .order('id', { ascending: true })
      .range(from, to);
    if (fallbackError) throw fallbackError;
    return data || [];
  });

  const counts: Record<string, number> = {};
  for (const event of events) {
    const key = event.event_type || 'unknown';
    counts[key] = (counts[key] || 0) + 1;
  }

  return {
    total: events.length,
    byType: Object.entries(counts)
      .map(([name, count]) => ({ name: titleize(name), count }))
      .sort((left, right) => right.count - left.count || left.name.localeCompare(right.name)),
  };
}

async function fetchProposalStats() {
  const { data, error } = await supabase.rpc('get_proposal_stats');
  if (!error) return normalizeProposalStatsPayload(data);
  if (!isMissingObjectError(error)) throw error;

  const proposals = await fetchAllPages<{
    country_code: string | null;
    country_name: string | null;
    status: string | null;
    policy_area: string | null;
    proposal_type: string | null;
  }>(async (from, to) => {
    const { data, error: fallbackError } = await supabase
      .from('proposals')
      .select('country_code, country_name, status, policy_area, proposal_type')
      .order('submitted_date', { ascending: false })
      .range(from, to);
    if (fallbackError) throw fallbackError;
    return data || [];
  });

  const byCountry = new Map<string, ProposalBucket>();
  const byStatus = new Map<string, number>();
  const byArea = new Map<string, number>();
  const byType = new Map<string, number>();

  for (const proposal of proposals) {
    const code = proposal.country_code || '??';
    const name = proposal.country_name || code;
    const existingCountry = byCountry.get(code);
    if (existingCountry) {
      existingCountry.count += 1;
    } else {
      byCountry.set(code, { code, name, count: 1 });
    }

    const status = proposal.status || 'unknown';
    byStatus.set(status, (byStatus.get(status) || 0) + 1);

    if (proposal.policy_area) {
      byArea.set(proposal.policy_area, (byArea.get(proposal.policy_area) || 0) + 1);
    }

    const proposalType = proposal.proposal_type || 'unknown';
    byType.set(proposalType, (byType.get(proposalType) || 0) + 1);
  }

  return {
    total: proposals.length,
    byCountry: Array.from(byCountry.values()).sort((left, right) => right.count - left.count || left.code.localeCompare(right.code)),
    byStatus: Array.from(byStatus.entries())
      .map(([name, count]) => ({ name: titleize(name), count }))
      .sort((left, right) => right.count - left.count || left.name.localeCompare(right.name)),
    byArea: Array.from(byArea.entries())
      .map(([name, count]) => ({ name: titleize(name), count }))
      .sort((left, right) => right.count - left.count || left.name.localeCompare(right.name)),
    byType: Array.from(byType.entries())
      .map(([name, count]) => ({ name: titleize(name), count }))
      .sort((left, right) => right.count - left.count || left.name.localeCompare(right.name)),
  };
}

export function useDataStats() {
  return useQuery({
    queryKey: ['data-stats', 'finance-v2'],
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    queryFn: async () => {
      const [overviewRows, politicalEventStats, financesData, investmentsData, officeCompensationData, positionsData, proposalStats] = await Promise.all([
        fetchOverviewRows(),
        fetchPoliticalEventStats(),
        fetchAllPages<any>(async (from, to) => {
          const { data, error } = await supabase
            .from('politician_finances')
            .select('politician_id, annual_salary, side_income, declared_assets, property_value, declared_debt, salary_source, politicians(name, country_code, country_name, role)')
            .order('politician_id', { ascending: true })
            .range(from, to);
          if (error) throw error;
          return data || [];
        }),
        fetchAllPages<any>(async (from, to) => {
          const { data, error } = await supabase
            .from('politician_investments')
            .select('politician_id, company_name, sector, estimated_value, investment_type')
            .order('politician_id', { ascending: true })
            .range(from, to);
          if (error) throw error;
          return data || [];
        }),
        fetchOfficeCompensationRows(),
        fetchAllPages<any>(async (from, to) => {
          const { data, error } = await supabase
            .from('politician_positions')
            .select('economic_score, social_score, ideology_label, eu_integration_score, environmental_score, immigration_score, education_priority, science_priority, healthcare_priority, defense_priority, economy_priority, justice_priority, social_welfare_priority, environment_priority, data_source, key_positions, politician_id, politicians!inner(party_name, party_abbreviation, country_code)')
            .order('politician_id', { ascending: true })
            .range(from, to);
          if (error) throw error;
          return data || [];
        }),
        fetchProposalStats(),
      ]);
      const coveragePoliticians = overviewRows.map(mapOverviewRowToCoveragePolitician);

      const countryCounts: Record<string, { count: number; code: string }> = {};
      overviewRows.forEach((politician) => {
        if (!politician.country_name) return;
        if (!countryCounts[politician.country_name]) {
          countryCounts[politician.country_name] = { count: 0, code: politician.country_code };
        }
        countryCounts[politician.country_name].count++;
      });
      const byCountry = Object.entries(countryCounts)
        .map(([name, { count, code }]) => ({ name, count, code }))
        .sort((left, right) => right.count - left.count);

      const groupCounts: Record<string, number> = {};
      overviewRows.forEach((politician) => {
        const group = politician.party_name || 'Unknown';
        const short = group
          .replace("Group of the European People's Party (Christian Democrats)", 'EPP')
          .replace('Group of the Progressive Alliance of Socialists and Democrats in the European Parliament', 'S&D')
          .replace('Renew Europe Group', 'Renew')
          .replace('Group of the Greens/European Free Alliance', 'Greens/EFA')
          .replace('European Conservatives and Reformists Group', 'ECR')
          .replace('The Left group in the European Parliament - GUE/NGL', 'The Left')
          .replace('Patriots for Europe Group', 'Patriots')
          .replace('Europe of Sovereign Nations Group', 'ESN')
          .replace('Non-attached Members', 'Non-attached');
        groupCounts[short] = (groupCounts[short] || 0) + 1;
      });
      const byGroup = Object.entries(groupCounts)
        .map(([name, count]) => ({ name, count }))
        .sort((left, right) => right.count - left.count)
        .slice(0, 15);

      const jurisdictions: Record<string, number> = {};
      overviewRows.forEach((politician) => {
        const jurisdiction = politician.jurisdiction || 'unknown';
        jurisdictions[jurisdiction] = (jurisdictions[jurisdiction] || 0) + 1;
      });
      const byJurisdiction = Object.entries(jurisdictions)
        .map(([name, count]) => ({ name: name.charAt(0).toUpperCase() + name.slice(1), count }))
        .sort((left, right) => right.count - left.count);

      const byEventType = politicalEventStats.byType;

      const enriched = overviewRows.filter((politician) => politician.enriched_at).length;
      const total = overviewRows.length;

      const nationalParties: Record<string, { count: number; country: string }> = {};
      overviewRows.forEach((politician) => {
        const party = politician.party_name;
        if (!party) return;
        if (!nationalParties[party]) nationalParties[party] = { count: 0, country: politician.country_name };
        nationalParties[party].count++;
      });

      const perCapita = byCountry
        .filter((country) => EU_COUNTRY_DATA[country.code])
        .map((country) => {
          const ref = EU_COUNTRY_DATA[country.code];
          return {
            name: country.code,
            fullName: country.name,
            count: country.count,
            population: ref.population,
            gdp: ref.gdp,
            area: ref.area,
            perMillion: parseFloat(((country.count / ref.population) * 1_000_000).toFixed(1)),
          };
        })
        .sort((left, right) => right.perMillion - left.perMillion);

      const perGdp = byCountry
        .filter((country) => EU_COUNTRY_DATA[country.code])
        .map((country) => {
          const ref = EU_COUNTRY_DATA[country.code];
          return {
            name: country.code,
            fullName: country.name,
            count: country.count,
            gdp: ref.gdp,
            population: ref.population,
            perBillion: parseFloat((country.count / ref.gdp).toFixed(2)),
          };
        })
        .sort((left, right) => right.perBillion - left.perBillion);

      const scatterData = byCountry
        .filter((country) => EU_COUNTRY_DATA[country.code])
        .map((country) => {
          const ref = EU_COUNTRY_DATA[country.code];
          return {
            name: country.code,
            fullName: country.name,
            gdp: ref.gdp,
            politicians: country.count,
            population: ref.population / 1_000_000,
          };
        });

      const safeMax = (values: number[]) => {
        const finite = values.filter((value) => Number.isFinite(value) && value > 0);
        return finite.length === 0 ? 0 : Math.max(...finite);
      };
      const maxPerCap = safeMax(perCapita.map((country) => country.perMillion));
      const maxPerGdp = safeMax(perGdp.map((country) => country.perBillion));
      const topAbsolute = byCountry[0]?.count ?? 0;
      const representationIndex = (maxPerCap > 0 && maxPerGdp > 0 && topAbsolute > 0)
        ? byCountry
            .filter((country) => EU_COUNTRY_DATA[country.code])
            .map((country) => {
              const ref = EU_COUNTRY_DATA[country.code];
              const perCapitaCount = (country.count / ref.population) * 1_000_000;
              const perGdpCount = country.count / ref.gdp;
              const perArea = (country.count / ref.area) * 10_000;
              return {
                name: country.code,
                fullName: country.name,
                perCapita: parseFloat(((perCapitaCount / maxPerCap) * 100).toFixed(0)),
                perGdp: parseFloat(((perGdpCount / maxPerGdp) * 100).toFixed(0)),
                density: parseFloat(Math.min(100, perArea * 5).toFixed(0)),
                absolute: parseFloat(((country.count / topAbsolute) * 100).toFixed(0)),
              };
            })
            .sort((left, right) => (right.perCapita + right.perGdp) - (left.perCapita + left.perGdp))
            .slice(0, 8)
        : [];

      const gdpPerPol = byCountry
        .filter((country) => EU_COUNTRY_DATA[country.code] && country.count > 0)
        .map((country) => {
          const ref = EU_COUNTRY_DATA[country.code];
          return {
            name: country.code,
            fullName: country.name,
            gdpPerPolitician: parseFloat((ref.gdp / country.count).toFixed(1)),
            count: country.count,
            gdp: ref.gdp,
          };
        })
        .sort((left, right) => right.gdpPerPolitician - left.gdpPerPolitician);

      const finances = financesData;
      const invData = investmentsData;
      const officeCompensation = officeCompensationData;
      const salaryDataCount = finances.filter((finance: any) => Number(finance.annual_salary || 0) > 0).length;

      const salaryBuckets = [
        { range: '< €80K', min: 0, max: 80000, count: 0 },
        { range: '€80-120K', min: 80000, max: 120000, count: 0 },
        { range: '€120-150K', min: 120000, max: 150000, count: 0 },
        { range: '€150-200K', min: 150000, max: 200000, count: 0 },
        { range: '> €200K', min: 200000, max: Infinity, count: 0 },
      ];
      finances.forEach((finance: any) => {
        if (!finance.annual_salary) return;
        const bucket = salaryBuckets.find((entry) => finance.annual_salary >= entry.min && finance.annual_salary < entry.max);
        if (bucket) bucket.count++;
      });
      const salaryDistribution = salaryBuckets.map((bucket) => ({ name: bucket.range, count: bucket.count, min: bucket.min, max: bucket.max }));

      const sectorTotals: Record<string, { value: number; count: number }> = {};
      invData.forEach((investment: any) => {
        const sector = investment.sector || 'Other';
        if (!sectorTotals[sector]) sectorTotals[sector] = { value: 0, count: 0 };
        sectorTotals[sector].value += investment.estimated_value || 0;
        sectorTotals[sector].count++;
      });
      const bySector = Object.entries(sectorTotals)
        .map(([name, { value, count }]) => ({ name, value: Math.round(value), count }))
        .sort((left, right) => right.value - left.value);

      const companyTotals: Record<string, { value: number; count: number; sector: string }> = {};
      invData.forEach((investment: any) => {
        const company = investment.company_name;
        if (!company) return;
        if (!companyTotals[company]) companyTotals[company] = { value: 0, count: 0, sector: investment.sector || '' };
        companyTotals[company].value += investment.estimated_value || 0;
        companyTotals[company].count++;
      });
      const topCompanies = Object.entries(companyTotals)
        .map(([name, { value, count, sector }]) => ({ name, value: Math.round(value), investors: count, sector }))
        .sort((left, right) => right.investors - left.investors)
        .slice(0, 15);

      const salaryBySource: Record<string, { total: number; count: number }> = {};
      finances.forEach((finance: any) => {
        if (!Number(finance.annual_salary || 0)) return;
        const source = finance.salary_source || 'Unknown';
        if (!salaryBySource[source]) salaryBySource[source] = { total: 0, count: 0 };
        salaryBySource[source].total += Number(finance.annual_salary || 0);
        salaryBySource[source].count++;
      });
      const avgSalaryBySource = Object.entries(salaryBySource)
        .map(([name, { total, count }]) => ({ name, avgSalary: Math.round(total / count), count }))
        .sort((left, right) => right.avgSalary - left.avgSalary);

      const latestOfficePay = [...officeCompensation.reduce((acc: Map<string, any>, row: any) => {
        if (!row.country_code || !row.office_type || !Number.isFinite(Number(row.annual_amount))) return acc;
        const key = `${row.country_code}:${row.office_type}:${row.office_title}`;
        const existing = acc.get(key);
        if (!existing || Number(row.year || 0) > Number(existing.year || 0) || String(row.effective_date || '') > String(existing.effective_date || '')) {
          acc.set(key, row);
        }
        return acc;
      }, new Map<string, any>()).values()]
        .map((row: any) => ({
          countryCode: row.country_code,
          countryName: row.country_name || row.country_code,
          officeType: row.office_type,
          officeTitle: row.office_title,
          year: row.year,
          amount: Number(row.annual_amount || 0),
          amountEur: row.annual_amount_eur === null || row.annual_amount_eur === undefined ? null : Number(row.annual_amount_eur),
          currency: row.currency || 'UNKNOWN',
          sourceType: row.source_type || 'unknown',
          sourceLabel: row.source_label || 'Source',
          sourceUrl: row.source_url || null,
        }))
        .sort((left, right) => left.countryCode.localeCompare(right.countryCode) || left.officeType.localeCompare(right.officeType));

      const latestMemberPayEur = latestOfficePay
        .filter((row) => row.officeType === 'member_of_parliament' && row.currency === 'EUR')
        .sort((left, right) => right.amount - left.amount)
        .slice(0, 8);
      const officePayTrendKeys = latestMemberPayEur.map((row) => `${row.countryCode} MP`);
      const trendCountries = new Set(latestMemberPayEur.map((row) => row.countryCode));
      const officePayTrendRows = officeCompensation
        .filter((row: any) => row.office_type === 'member_of_parliament')
        .filter((row: any) => trendCountries.has(row.country_code))
        .filter((row: any) => row.currency === 'EUR' || Number(row.annual_amount_eur || 0) > 0)
        .filter((row: any) => Number(row.year || 0) >= 2013);
      const trendByYear = new Map<number, Record<string, number | string>>();
      const latestPointByKey = new Map<string, any>();
      officePayTrendRows.forEach((row: any) => {
        const year = Number(row.year);
        const seriesKey = `${row.country_code} MP`;
        const pointKey = `${year}:${seriesKey}`;
        const existing = latestPointByKey.get(pointKey);
        if (!existing || String(row.effective_date || '') > String(existing.effective_date || '')) latestPointByKey.set(pointKey, row);
      });
      latestPointByKey.forEach((row: any, pointKey: string) => {
        const [yearText, seriesKey] = pointKey.split(':');
        const year = Number(yearText);
        if (!trendByYear.has(year)) trendByYear.set(year, { year });
        trendByYear.get(year)![seriesKey] = Math.round(Number(row.annual_amount_eur || row.annual_amount || 0));
      });
      const officePayTrend = [...trendByYear.values()].sort((left: any, right: any) => Number(left.year) - Number(right.year));

      const withSideIncome = finances.filter((finance: any) => (finance.side_income || 0) > 0);
      const totalInvestmentValue = invData.reduce((sum: number, investment: any) => sum + (investment.estimated_value || 0), 0);
      const officeTypeForRole = (role: string | null | undefined) => {
        const normalized = String(role || '').toLowerCase();
        if (normalized.includes('head of government') || normalized.includes('prime minister')) return 'head_of_government';
        if (normalized.includes('head of state') || normalized.includes('president')) return 'head_of_state';
        if (normalized.includes('european parliament') || normalized === 'mep') return 'member_of_european_parliament';
        if (normalized.includes('senator')) return 'senator';
        if (normalized.includes('parliament')) return 'member_of_parliament';
        return null;
      };
      const latestPayByCountryRole = new Map<string, number>();
      latestOfficePay.forEach((row) => {
        const amount = Number(row.amountEur || row.amount || 0);
        if (amount > 0) latestPayByCountryRole.set(`${row.countryCode}:${row.officeType}`, amount);
      });
      const wealthRows = finances
        .map((finance: any) => {
          const assets = Number(finance.declared_assets || finance.property_value || 0);
          const debt = Number(finance.declared_debt || 0);
          const netWorth = assets - debt;
          const roleOfficeType = officeTypeForRole(finance.politicians?.role);
          const rolePay = roleOfficeType ? latestPayByCountryRole.get(`${finance.politicians?.country_code}:${roleOfficeType}`) : null;
          const comparablePay = Number(finance.annual_salary || rolePay || 0);
          return { ...finance, assets, debt, netWorth, comparablePay };
        })
        .filter((finance: any) => finance.assets > 0 || finance.debt > 0);
      const wealthPayRatios = wealthRows
        .filter((finance: any) => finance.netWorth > 0 && Number(finance.comparablePay || 0) > 0)
        .map((finance: any) => ({
          name: finance.politicians?.name || finance.politician_id,
          country: finance.politicians?.country_code || '—',
          netWorth: Math.round(finance.netWorth),
          salary: Math.round(Number(finance.comparablePay || 0)),
          ratio: finance.netWorth / Number(finance.comparablePay || 1),
        }))
        .sort((left: any, right: any) => right.ratio - left.ratio)
        .slice(0, 10);
      const totalDeclaredNetWorth = wealthRows.reduce((sum: number, finance: any) => sum + finance.netWorth, 0);

      const positions = positionsData.map((position: any) =>
        resolvePoliticalPosition(
          position,
          position.politicians?.party_name,
          position.politicians?.party_abbreviation,
          position.politicians?.country_code,
        ),
      );

      const ideologyCounts: Record<string, number> = {};
      positions.forEach((position: any) => {
        const label = getIdeologyFamily(position?.ideology_label);
        ideologyCounts[label] = (ideologyCounts[label] || 0) + 1;
      });
      const byIdeology = Object.entries(ideologyCounts)
        .map(([name, count]) => ({ name, count }))
        .sort((left, right) => right.count - left.count);

      const compassSample = positions
        .filter((position: any) => Number.isFinite(Number(position?.economic_score)) && Number.isFinite(Number(position?.social_score)))
        .filter((_: any, index: number) => index % 3 === 0)
        .map((position: any) => ({
          x: Number(position.economic_score),
          y: Number(position.social_score),
          ideology: getIdeologyFamily(position.ideology_label),
        }));

      const averagePriority = (field: string) => {
        const values = positions
          .map((position: any) => Number(position?.[field]))
          .filter((value: number) => Number.isFinite(value));
        if (values.length === 0) return 0;
        return parseFloat((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(1));
      };

      const avgPriorities = positions.length > 0 ? [
        { domain: 'Education', value: averagePriority('education_priority') },
        { domain: 'Science', value: averagePriority('science_priority') },
        { domain: 'Healthcare', value: averagePriority('healthcare_priority') },
        { domain: 'Defense', value: averagePriority('defense_priority') },
        { domain: 'Economy', value: averagePriority('economy_priority') },
        { domain: 'Justice', value: averagePriority('justice_priority') },
        { domain: 'Social Welfare', value: averagePriority('social_welfare_priority') },
        { domain: 'Environment', value: averagePriority('environment_priority') },
      ] : [];

      const euBuckets: { range: string; test: (value: number) => boolean; count: number }[] = [
        { range: 'Strong Eurosceptic', test: (value) => value <= -5, count: 0 },
        { range: 'Eurosceptic', test: (value) => value > -5 && value < -1, count: 0 },
        { range: 'Neutral', test: (value) => value >= -1 && value <= 1, count: 0 },
        { range: 'Pro-EU', test: (value) => value > 1 && value < 5, count: 0 },
        { range: 'Strong Pro-EU', test: (value) => value >= 5, count: 0 },
      ];
      positions.forEach((position: any) => {
        if (!Number.isFinite(Number(position?.eu_integration_score))) return;
        const value = Number(position.eu_integration_score);
        const bucket = euBuckets.find((entry) => entry.test(value));
        if (bucket) bucket.count++;
      });
      const euDistribution = euBuckets.map((bucket) => ({ name: bucket.range, count: bucket.count }));

      const financeIds = new Set(finances.map((finance: any) => finance.politician_id));
      const investIds = new Set(invData.map((investment: any) => investment.politician_id));
      const positionIds = new Set(positionsData.map((position: any) => position.politician_id || ''));
      const coverage = buildCoverageModel({
        politicians: coveragePoliticians,
        financeIds,
        investmentIds: investIds,
        positionIds,
      });

      const availByCountry: Record<string, { total: number; bio: number; photo: number; wiki: number; enriched: number; finance: number; invest: number; birth: number; twitter: number }> = {};
      coveragePoliticians.forEach((politician) => {
        const key = politician.country_code;
        if (!availByCountry[key]) {
          availByCountry[key] = { total: 0, bio: 0, photo: 0, wiki: 0, enriched: 0, finance: 0, invest: 0, birth: 0, twitter: 0 };
        }
        const aggregate = availByCountry[key];
        aggregate.total++;
        if (politician.biography) aggregate.bio++;
        if (politician.photo_url) aggregate.photo++;
        if (politician.wikipedia_url) aggregate.wiki++;
        if (politician.enriched_at) aggregate.enriched++;
        if (politician.birth_year) aggregate.birth++;
        if (politician.twitter_handle) aggregate.twitter++;
        if (financeIds.has(politician.id)) aggregate.finance++;
        if (investIds.has(politician.id)) aggregate.invest++;
      });

      const dataAvailability = Object.entries(availByCountry)
        .filter(([code]) => EU_COUNTRY_DATA[code])
        .map(([code, aggregate]) => {
          const fields = [aggregate.bio, aggregate.photo, aggregate.wiki, aggregate.enriched, aggregate.finance, aggregate.birth];
          const avgCompleteness = aggregate.total > 0
            ? (fields.reduce((sum, value) => sum + value / aggregate.total, 0) / fields.length) * 100
            : 0;
          const gapScore = 100 - avgCompleteness;
          return {
            code,
            name: byCountry.find((country) => country.code === code)?.name || code,
            total: aggregate.total,
            bioRate: aggregate.total > 0 ? Math.round((aggregate.bio / aggregate.total) * 100) : 0,
            photoRate: aggregate.total > 0 ? Math.round((aggregate.photo / aggregate.total) * 100) : 0,
            wikiRate: aggregate.total > 0 ? Math.round((aggregate.wiki / aggregate.total) * 100) : 0,
            financeRate: aggregate.total > 0 ? Math.round((aggregate.finance / aggregate.total) * 100) : 0,
            investRate: aggregate.total > 0 ? Math.round((aggregate.invest / aggregate.total) * 100) : 0,
            enrichedRate: aggregate.total > 0 ? Math.round((aggregate.enriched / aggregate.total) * 100) : 0,
            birthRate: aggregate.total > 0 ? Math.round((aggregate.birth / aggregate.total) * 100) : 0,
            twitterRate: aggregate.total > 0 ? Math.round((aggregate.twitter / aggregate.total) * 100) : 0,
            completeness: Math.round(avgCompleteness),
            gap: Math.round(gapScore),
          };
        })
        .sort((left, right) => right.gap - left.gap);

      const proposalsByCountry = proposalStats.byCountry;
      const proposalsByStatus = proposalStats.byStatus;
      const proposalsByArea = proposalStats.byArea;
      const proposalsByType = proposalStats.byType;

      return {
        totalPoliticians: total,
        totalEvents: politicalEventStats.total,
        totalCountries: byCountry.length,
        totalParties: Object.keys(nationalParties).length,
        enriched,
        enrichmentPct: total > 0 ? Math.round((enriched / total) * 100) : 0,
        byCountry,
        byGroup,
        byJurisdiction,
        byEventType,
        perCapita,
        perGdp,
        scatterData,
        representationIndex,
        gdpPerPol,
        salaryDistribution,
        bySector,
        topCompanies,
        avgSalaryBySource,
        financialDisclosureCount: finances.length,
        financialDisclosurePct: total > 0 ? Math.round((finances.length / total) * 100) : 0,
        salaryDataCount,
        officeCompensationCount: officeCompensation.length,
        officeCompensationCountries: new Set(officeCompensation.map((row: any) => row.country_code)).size,
        officeCompensationOfficialCount: officeCompensation.filter((row: any) => row.source_type === 'official').length,
        officePayLatestByCountry: latestOfficePay,
        officePayTrend,
        officePayTrendKeys,
        sideIncomeCount: withSideIncome.length,
        sideIncomePct: finances.length > 0 ? Math.round((withSideIncome.length / finances.length) * 100) : 0,
        declaredWealthCount: wealthRows.length,
        wealthPayRatioCount: wealthPayRatios.length,
        totalDeclaredNetWorth,
        wealthPayRatios,
        totalInvestmentValue,
        totalInvestments: invData.length,
        politiciansWithInvestments: new Set(invData.map((investment: any) => investment.politician_id)).size,
        byIdeology,
        compassSample,
        avgPriorities,
        euDistribution,
        totalPositions: positions.length,
        totalProposals: proposalStats.total,
        proposalsByCountry,
        proposalsByStatus,
        proposalsByArea,
        proposalsByType,
        proposalCountries: proposalsByCountry.length,
        dataAvailability,
        coverage,
      };
    },
  });
}
