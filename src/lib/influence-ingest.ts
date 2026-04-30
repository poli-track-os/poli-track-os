export type TrustLevel = 1 | 2 | 3 | 4;

export interface InfluenceActorInput {
  actor_kind: 'person' | 'organisation' | 'company' | 'foreign_principal' | 'state_body' | 'religious_org' | 'media' | 'other';
  name: string;
  country_code?: string | null;
  country_name?: string | null;
  jurisdiction?: string | null;
  sector?: string | null;
  description?: string | null;
  website?: string | null;
  is_pep?: boolean;
  is_state_linked?: boolean;
  external_id?: string | null;
  data_source: string;
  source_url?: string | null;
  trust_level?: TrustLevel | null;
  raw_data?: Record<string, unknown>;
}

export interface CompanyInput {
  name: string;
  registry: string;
  jurisdiction_code?: string | null;
  company_number?: string | null;
  legal_form?: string | null;
  status?: string | null;
  sector?: string | null;
  incorporation_date?: string | null;
  dissolution_date?: string | null;
  website?: string | null;
  source_url?: string | null;
  data_source: string;
  raw_data?: Record<string, unknown>;
}

export interface CompanyOfficerInput {
  company_external_key: string;
  actor_external_id?: string | null;
  name: string;
  role: string;
  start_date?: string | null;
  end_date?: string | null;
  source_url?: string | null;
  data_source: string;
  raw_data?: Record<string, unknown>;
}

export interface BeneficialOwnershipInput {
  owned_company_external_key: string;
  owner_actor_external_id?: string | null;
  owner_company_external_key?: string | null;
  ownership_percent?: number | null;
  control_type?: string | null;
  valid_from?: string | null;
  valid_to?: string | null;
  source_url?: string | null;
  data_source: string;
  trust_level?: TrustLevel | null;
  raw_data?: Record<string, unknown>;
}

export interface InfluenceClientInput {
  external_client_id?: string | null;
  name: string;
  client_kind?: string;
  country_code?: string | null;
  country_name?: string | null;
  principal_country_code?: string | null;
  principal_country_name?: string | null;
  sector?: string | null;
  is_foreign_principal?: boolean;
  data_source: string;
  source_url?: string | null;
  trust_level?: TrustLevel | null;
  raw_data?: Record<string, unknown>;
}

export interface InfluenceFilingInput {
  filing_id: string;
  filing_type: 'us_lda' | 'us_fara' | 'eu_transparency' | 'opencorporates' | 'opensanctions' | 'curated_media' | 'other';
  registrant_actor_external_id?: string | null;
  registrant_name?: string | null;
  client_external_id?: string | null;
  client_name?: string | null;
  principal_country_code?: string | null;
  principal_country_name?: string | null;
  year?: number | null;
  quarter?: number | null;
  period_start?: string | null;
  period_end?: string | null;
  issue_areas?: string[];
  target_institutions?: string[];
  amount_reported?: number | null;
  amount_low?: number | null;
  amount_high?: number | null;
  currency?: string;
  description?: string | null;
  source_url?: string | null;
  data_source: string;
  trust_level?: TrustLevel | null;
  raw_data?: Record<string, unknown>;
}

export interface InfluenceContactInput {
  filing_external_id?: string | null;
  lobby_actor_external_id?: string | null;
  client_external_id?: string | null;
  target_name?: string | null;
  target_institution?: string | null;
  target_country_code?: string | null;
  contact_date?: string | null;
  contact_type?: string | null;
  subject?: string | null;
  location?: string | null;
  source_url?: string | null;
  data_source: string;
  trust_level?: TrustLevel | null;
  raw_data?: Record<string, unknown>;
}

export interface InfluenceMoneyInput {
  filing_external_id?: string | null;
  payer_client_external_id?: string | null;
  recipient_actor_external_id?: string | null;
  recipient_company_external_key?: string | null;
  money_type: 'spend' | 'payment' | 'income' | 'expense' | 'contract' | 'donation' | 'other';
  amount_low?: number | null;
  amount_high?: number | null;
  amount_exact?: number | null;
  currency?: string;
  period_start?: string | null;
  period_end?: string | null;
  description?: string | null;
  source_url?: string | null;
  data_source: string;
  trust_level?: TrustLevel | null;
  raw_data?: Record<string, unknown>;
}

export interface PublicAffiliationInput {
  subject_actor_external_id?: string | null;
  subject_name?: string | null;
  affiliation_type: 'religion' | 'sect' | 'denomination' | 'religious_org' | 'other';
  affiliation_label: string;
  claim_text?: string | null;
  review_status?: 'pending' | 'approved' | 'rejected';
  visible?: boolean;
  data_source: string;
  source_url: string;
  source_title?: string | null;
  trust_level?: TrustLevel | null;
  confidence?: number | null;
  raw_data?: Record<string, unknown>;
}

export interface InfluenceBundle {
  actors: InfluenceActorInput[];
  companies: CompanyInput[];
  officers: CompanyOfficerInput[];
  ownership: BeneficialOwnershipInput[];
  clients: InfluenceClientInput[];
  filings: InfluenceFilingInput[];
  contacts: InfluenceContactInput[];
  money: InfluenceMoneyInput[];
  affiliations: PublicAffiliationInput[];
}

export function emptyInfluenceBundle(): InfluenceBundle {
  return {
    actors: [],
    companies: [],
    officers: [],
    ownership: [],
    clients: [],
    filings: [],
    contacts: [],
    money: [],
    affiliations: [],
  };
}

export function normalizeInfluenceName(value: string | null | undefined) {
  return (value || '')
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

function clean(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text.length > 0 ? text : null;
}

function parseNumber(value: unknown): number | null {
  const text = clean(value);
  if (!text) return null;
  const normalized = text.replace(/[$€£,\s]/g, '');
  if (!normalized || normalized === '-') return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseIntOrNull(value: unknown): number | null {
  const parsed = parseNumber(value);
  return parsed === null ? null : Math.trunc(parsed);
}

function splitList(value: unknown): string[] {
  const text = clean(value);
  if (!text) return [];
  return [...new Set(text.split(/[;|,]/).map((part) => part.trim()).filter(Boolean))];
}

export function parseDelimitedRows(text: string): Record<string, string>[] {
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (lines.length === 0) return [];
  const delimiter = lines[0].includes('\t') ? '\t' : ',';
  const parseLine = (line: string): string[] => {
    const cells: string[] = [];
    let current = '';
    let quoted = false;
    for (let i = 0; i < line.length; i += 1) {
      const char = line[i];
      if (char === '"') {
        if (quoted && line[i + 1] === '"') {
          current += '"';
          i += 1;
        } else {
          quoted = !quoted;
        }
        continue;
      }
      if (char === delimiter && !quoted) {
        cells.push(current);
        current = '';
        continue;
      }
      current += char;
    }
    cells.push(current);
    return cells.map((cell) => cell.trim());
  };
  const headers = parseLine(lines[0]).map((header) => header.trim());
  return lines.slice(1).map((line) => {
    const cells = parseLine(line);
    return Object.fromEntries(headers.map((header, index) => [header, cells[index] || '']));
  });
}

function rowsFromText(text: string): Record<string, unknown>[] {
  const trimmed = text.trim();
  if (!trimmed) return [];
  if (trimmed.startsWith('[')) return JSON.parse(trimmed) as Record<string, unknown>[];
  if (trimmed.startsWith('{')) {
    const parsed = JSON.parse(trimmed) as Record<string, unknown>;
    const firstArray = Object.values(parsed).find((value) =>
      Array.isArray(value) && value.every((item) => typeof item === 'object' && item !== null),
    );
    return (firstArray || [parsed]) as Record<string, unknown>[];
  }
  return parseDelimitedRows(text);
}

function sourceUrl(row: Record<string, unknown>, fallback?: string) {
  return clean(row.source_url) || clean(row.url) || fallback || null;
}

export function parseUsLda(text: string): InfluenceBundle {
  const bundle = emptyInfluenceBundle();
  for (const row of rowsFromText(text)) {
    const filingId = clean(row.filing_uuid) || clean(row.filing_id) || clean(row.report_id) || clean(row.id);
    const registrantName = clean(row.registrant_name) || clean(row.registrant);
    const clientName = clean(row.client_name) || clean(row.client);
    if (!filingId || !clientName) continue;
    const clientExternal = clean(row.client_id) || `${filingId}:client`;
    const registrantExternal = clean(row.registrant_id) || (registrantName ? `${filingId}:registrant` : null);
    const amount = parseNumber(row.amount) ?? parseNumber(row.income) ?? parseNumber(row.expenses);
    const year = parseIntOrNull(row.year);
    const quarter = parseIntOrNull(row.quarter);
    const url = sourceUrl(row, 'https://lda.senate.gov/');

    if (registrantName && registrantExternal) {
      bundle.actors.push({
        actor_kind: 'organisation',
        name: registrantName,
        normalized_name: normalizeInfluenceName(registrantName),
        external_id: registrantExternal,
        data_source: 'us_lda',
        source_url: url,
        trust_level: 1,
        raw_data: row,
      } as InfluenceActorInput & { normalized_name: string });
    }
    bundle.clients.push({
      external_client_id: clientExternal,
      name: clientName,
      client_kind: 'organisation',
      country_code: clean(row.client_country) || clean(row.country_code),
      principal_country_code: clean(row.principal_country_code),
      sector: clean(row.sector),
      is_foreign_principal: Boolean(clean(row.principal_country_code)),
      data_source: 'us_lda',
      source_url: url,
      trust_level: 1,
      raw_data: row,
    });
    bundle.filings.push({
      filing_id: filingId,
      filing_type: 'us_lda',
      registrant_actor_external_id: registrantExternal,
      registrant_name: registrantName,
      client_external_id: clientExternal,
      client_name: clientName,
      principal_country_code: clean(row.principal_country_code),
      year,
      quarter,
      period_start: clean(row.period_start),
      period_end: clean(row.period_end),
      issue_areas: splitList(row.issue_area || row.issue_areas),
      target_institutions: splitList(row.target_institution || row.target_institutions),
      amount_reported: amount,
      amount_low: amount,
      amount_high: amount,
      currency: clean(row.currency) || 'USD',
      description: clean(row.description),
      source_url: url,
      data_source: 'us_lda',
      trust_level: 1,
      raw_data: row,
    });
    if (amount !== null) {
      bundle.money.push({
        filing_external_id: filingId,
        payer_client_external_id: clientExternal,
        money_type: 'spend',
        amount_exact: amount,
        currency: clean(row.currency) || 'USD',
        period_start: clean(row.period_start),
        period_end: clean(row.period_end),
        description: clean(row.description) || `US LDA reported lobbying amount for ${clientName}`,
        source_url: url,
        data_source: 'us_lda',
        trust_level: 1,
        raw_data: row,
      });
    }
  }
  return bundle;
}

export function parseUsFara(text: string): InfluenceBundle {
  const bundle = emptyInfluenceBundle();
  for (const row of rowsFromText(text)) {
    const registration = clean(row.registration_number) || clean(row.registration_id) || clean(row.id);
    const principalName = clean(row.foreign_principal) || clean(row.principal_name) || clean(row.client_name);
    const registrantName = clean(row.registrant_name) || clean(row.registrant);
    if (!registration || !principalName) continue;
    const principalExternal = clean(row.foreign_principal_id) || `${registration}:principal`;
    const registrantExternal = clean(row.registrant_id) || (registrantName ? `${registration}:registrant` : null);
    const payment = parseNumber(row.payment_amount) ?? parseNumber(row.amount);
    const url = sourceUrl(row, 'https://efile.fara.gov/');

    if (registrantName && registrantExternal) {
      bundle.actors.push({
        actor_kind: 'organisation',
        name: registrantName,
        external_id: registrantExternal,
        data_source: 'us_fara',
        source_url: url,
        trust_level: 1,
        raw_data: row,
      });
    }
    bundle.clients.push({
      external_client_id: principalExternal,
      name: principalName,
      client_kind: 'foreign_principal',
      principal_country_code: clean(row.foreign_principal_country) || clean(row.principal_country_code),
      principal_country_name: clean(row.foreign_principal_country_name),
      is_foreign_principal: true,
      data_source: 'us_fara',
      source_url: url,
      trust_level: 1,
      raw_data: row,
    });
    bundle.filings.push({
      filing_id: registration,
      filing_type: 'us_fara',
      registrant_actor_external_id: registrantExternal,
      registrant_name: registrantName,
      client_external_id: principalExternal,
      client_name: principalName,
      principal_country_code: clean(row.foreign_principal_country) || clean(row.principal_country_code),
      period_start: clean(row.period_start),
      period_end: clean(row.period_end),
      issue_areas: splitList(row.activity || row.issue_areas),
      target_institutions: splitList(row.target_institution || row.target_institutions),
      amount_reported: payment,
      amount_low: payment,
      amount_high: payment,
      currency: clean(row.currency) || 'USD',
      description: clean(row.activity) || clean(row.description),
      source_url: url,
      data_source: 'us_fara',
      trust_level: 1,
      raw_data: row,
    });
    if (payment !== null) {
      bundle.money.push({
        filing_external_id: registration,
        payer_client_external_id: principalExternal,
        money_type: 'payment',
        amount_exact: payment,
        currency: clean(row.currency) || 'USD',
        period_start: clean(row.period_start),
        period_end: clean(row.period_end),
        description: clean(row.description) || `FARA payment involving ${principalName}`,
        source_url: url,
        data_source: 'us_fara',
        trust_level: 1,
        raw_data: row,
      });
    }
    const target = clean(row.contact_name) || clean(row.target_name) || clean(row.target_institution);
    if (target) {
      bundle.contacts.push({
        filing_external_id: registration,
        lobby_actor_external_id: registrantExternal,
        client_external_id: principalExternal,
        target_name: clean(row.contact_name) || clean(row.target_name),
        target_institution: clean(row.target_institution),
        target_country_code: clean(row.target_country_code) || 'US',
        contact_date: clean(row.activity_date) || clean(row.contact_date),
        contact_type: clean(row.contact_type) || 'fara_activity',
        subject: clean(row.activity) || clean(row.subject),
        source_url: url,
        data_source: 'us_fara',
        trust_level: 1,
        raw_data: row,
      });
    }
  }
  return bundle;
}

export function parseEuTransparency(text: string): InfluenceBundle {
  const bundle = emptyInfluenceBundle();
  for (const row of rowsFromText(text)) {
    const transparencyId = clean(row.transparency_id) || clean(row.id);
    const name = clean(row.name) || clean(row.organisation_name);
    if (!transparencyId || !name) continue;
    const amount = parseNumber(row.amount_eur) ?? parseNumber(row.declared_amount_eur_high);
    const year = parseIntOrNull(row.year);
    const url = sourceUrl(row, `https://www.lobbyfacts.eu/datacard/${transparencyId}`);

    bundle.actors.push({
      actor_kind: 'organisation',
      name,
      country_code: clean(row.country_code) || clean(row.country_of_hq),
      sector: clean(row.category) || clean(row.sector),
      external_id: transparencyId,
      data_source: 'eu_transparency_register',
      source_url: url,
      trust_level: 1,
      raw_data: row,
    });
    bundle.clients.push({
      external_client_id: transparencyId,
      name,
      client_kind: 'organisation',
      country_code: clean(row.country_code) || clean(row.country_of_hq),
      sector: clean(row.category) || clean(row.sector),
      data_source: 'eu_transparency_register',
      source_url: url,
      trust_level: 1,
      raw_data: row,
    });
    if (amount !== null) {
      const filingId = `${transparencyId}:${year || 'unknown'}`;
      bundle.filings.push({
        filing_id: filingId,
        filing_type: 'eu_transparency',
        registrant_actor_external_id: transparencyId,
        registrant_name: name,
        client_external_id: transparencyId,
        client_name: name,
        year,
        amount_reported: amount,
        amount_low: parseNumber(row.declared_amount_eur_low) ?? amount,
        amount_high: parseNumber(row.declared_amount_eur_high) ?? amount,
        currency: 'EUR',
        description: clean(row.subject),
        source_url: url,
        data_source: 'eu_transparency_register',
        trust_level: 1,
        raw_data: row,
      });
      bundle.money.push({
        filing_external_id: filingId,
        payer_client_external_id: transparencyId,
        money_type: 'spend',
        amount_low: parseNumber(row.declared_amount_eur_low) ?? amount,
        amount_high: parseNumber(row.declared_amount_eur_high) ?? amount,
        currency: 'EUR',
        period_start: year ? `${year}-01-01` : null,
        period_end: year ? `${year}-12-31` : null,
        source_url: url,
        data_source: 'eu_transparency_register',
        trust_level: 1,
        raw_data: row,
      });
    }
    if (clean(row.meeting_date) || clean(row.target_name) || clean(row.target_institution)) {
      bundle.contacts.push({
        lobby_actor_external_id: transparencyId,
        client_external_id: transparencyId,
        target_name: clean(row.target_name),
        target_institution: clean(row.target_institution) || clean(row.commissioner_org),
        target_country_code: clean(row.target_country_code) || 'EU',
        contact_date: clean(row.meeting_date),
        contact_type: 'meeting',
        subject: clean(row.subject),
        location: clean(row.location),
        source_url: url,
        data_source: 'eu_transparency_register',
        trust_level: 1,
        raw_data: row,
      });
    }
  }
  return bundle;
}

export function companyExternalKey(company: Pick<CompanyInput, 'registry' | 'jurisdiction_code' | 'company_number' | 'name'>): string {
  return [company.registry, company.jurisdiction_code || '', company.company_number || normalizeInfluenceName(company.name)].join(':');
}

export function parseOpenCorporates(text: string): InfluenceBundle {
  const bundle = emptyInfluenceBundle();
  for (const row of rowsFromText(text)) {
    const company = (row.company || row) as Record<string, unknown>;
    const name = clean(company.name) || clean(row.name);
    const number = clean(company.company_number) || clean(row.company_number);
    const jurisdiction = clean(company.jurisdiction_code) || clean(row.jurisdiction_code);
    if (!name) continue;
    const companyInput: CompanyInput = {
      name,
      registry: 'opencorporates',
      jurisdiction_code: jurisdiction,
      company_number: number,
      legal_form: clean(company.company_type) || clean(row.legal_form),
      status: clean(company.current_status) || clean(row.status),
      sector: clean(row.sector),
      incorporation_date: clean(company.incorporation_date) || clean(row.incorporation_date),
      dissolution_date: clean(company.dissolution_date) || clean(row.dissolution_date),
      source_url: sourceUrl(row, clean(company.opencorporates_url) || undefined),
      data_source: 'opencorporates',
      raw_data: row,
    };
    const key = companyExternalKey(companyInput);
    bundle.companies.push(companyInput);
    const officers = (row.officers || company.officers || []) as Record<string, unknown>[];
    for (const officer of Array.isArray(officers) ? officers : []) {
      const officerName = clean(officer.name);
      if (!officerName) continue;
      const officerExternal = clean(officer.id) || `${key}:officer:${normalizeInfluenceName(officerName)}`;
      bundle.actors.push({
        actor_kind: 'person',
        name: officerName,
        external_id: officerExternal,
        data_source: 'opencorporates',
        source_url: sourceUrl(officer, companyInput.source_url || undefined),
        trust_level: 2,
        raw_data: officer,
      });
      bundle.officers.push({
        company_external_key: key,
        actor_external_id: officerExternal,
        name: officerName,
        role: clean(officer.position) || clean(officer.role) || 'Officer',
        start_date: clean(officer.start_date),
        end_date: clean(officer.end_date),
        source_url: sourceUrl(officer, companyInput.source_url || undefined),
        data_source: 'opencorporates',
        raw_data: officer,
      });
    }
  }
  return bundle;
}

export function parseOpenSanctions(text: string): InfluenceBundle {
  const bundle = emptyInfluenceBundle();
  const trimmed = text.trim();
  const records = trimmed.startsWith('{') && trimmed.includes('\n')
    ? trimmed.split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line) as Record<string, unknown>)
    : rowsFromText(text);
  for (const row of records) {
    const id = clean(row.id) || clean(row.entity_id);
    const caption = clean(row.caption) || clean(row.name);
    if (!id || !caption) continue;
    const schema = clean(row.schema) || clean(row.type) || '';
    const props = (row.properties || {}) as Record<string, unknown>;
    const countries = Array.isArray(props.country) ? props.country : splitList(row.country || props.country);
    const topics = Array.isArray(row.datasets) ? row.datasets.join(',') : clean(row.datasets) || '';
    const isCompany = /company|organization|organisation/i.test(schema);
    bundle.actors.push({
      actor_kind: isCompany ? 'company' : 'person',
      name: caption,
      country_code: clean(countries[0]),
      description: clean(row.description) || topics,
      is_pep: /pep|poi/i.test(topics),
      is_state_linked: /sanction|state/i.test(topics),
      external_id: id,
      data_source: 'opensanctions',
      source_url: sourceUrl(row, `https://www.opensanctions.org/entities/${id}/`),
      trust_level: 2,
      raw_data: row,
    });
  }
  return bundle;
}

export function parsePublicAffiliations(text: string): InfluenceBundle {
  const bundle = emptyInfluenceBundle();
  for (const row of rowsFromText(text)) {
    const label = clean(row.affiliation_label) || clean(row.label) || clean(row.religion) || clean(row.sect);
    const source = sourceUrl(row);
    if (!label || !source) continue;
    const subjectExternal = clean(row.subject_actor_external_id) || clean(row.subject_external_id);
    const subjectName = clean(row.subject_name) || clean(row.name);
    if (subjectExternal && subjectName) {
      bundle.actors.push({
        actor_kind: 'person',
        name: subjectName,
        external_id: subjectExternal,
        data_source: clean(row.subject_data_source) || clean(row.data_source) || 'wikidata_affiliation',
        source_url: source,
        trust_level: (parseIntOrNull(row.trust_level) as TrustLevel | null) || 2,
        raw_data: row,
      });
    }
    const type = (clean(row.affiliation_type) || 'religion') as PublicAffiliationInput['affiliation_type'];
    bundle.affiliations.push({
      subject_actor_external_id: subjectExternal,
      subject_name: subjectName,
      affiliation_type: ['religion', 'sect', 'denomination', 'religious_org', 'other'].includes(type) ? type : 'other',
      affiliation_label: label,
      claim_text: clean(row.claim_text),
      review_status: (clean(row.review_status) as PublicAffiliationInput['review_status']) || 'pending',
      visible: row.visible === 'true' || row.visible === true,
      data_source: clean(row.data_source) || 'wikidata_affiliation',
      source_url: source,
      source_title: clean(row.source_title),
      trust_level: (parseIntOrNull(row.trust_level) as TrustLevel | null) || 2,
      confidence: parseNumber(row.confidence),
      raw_data: row,
    });
  }
  return bundle;
}

export function parseCuratedInfluenceMedia(text: string): InfluenceBundle {
  const bundle = emptyInfluenceBundle();
  for (const row of rowsFromText(text)) {
    const client = clean(row.client_name) || clean(row.company_name) || clean(row.principal_name);
    const target = clean(row.target_name) || clean(row.target_institution);
    const source = sourceUrl(row);
    if (!client || !source) continue;
    const clientExternal = clean(row.client_external_id) || `media:${normalizeInfluenceName(client)}:${source}`;
    const amountValue = parseNumber(row.amount) ?? parseNumber(row.contract_value);
    bundle.clients.push({
      external_client_id: clientExternal,
      name: client,
      client_kind: clean(row.client_kind) || 'organisation',
      country_code: clean(row.country_code),
      principal_country_code: clean(row.principal_country_code),
      sector: clean(row.sector),
      is_foreign_principal: Boolean(clean(row.principal_country_code)),
      data_source: 'curated_influence_media',
      source_url: source,
      trust_level: 2,
      raw_data: row,
    });
    const filingId = clean(row.claim_id) || `media:${source}`;
    bundle.filings.push({
      filing_id: filingId,
      filing_type: 'curated_media',
      client_external_id: clientExternal,
      client_name: client,
      principal_country_code: clean(row.principal_country_code),
      issue_areas: splitList(row.issue_areas || row.topic),
      target_institutions: splitList(row.target_institution),
      amount_reported: amountValue,
      amount_low: amountValue,
      amount_high: amountValue,
      currency: clean(row.currency) || 'USD',
      description: clean(row.description) || clean(row.claim_text),
      source_url: source,
      data_source: 'curated_influence_media',
      trust_level: 2,
      raw_data: row,
    });
    if (target) {
      bundle.contacts.push({
        filing_external_id: filingId,
        client_external_id: clientExternal,
        target_name: clean(row.target_name),
        target_institution: clean(row.target_institution),
        target_country_code: clean(row.target_country_code),
        contact_date: clean(row.contact_date),
        contact_type: clean(row.contact_type) || 'reported_contact',
        subject: clean(row.topic) || clean(row.subject),
        location: clean(row.location),
        source_url: source,
        data_source: 'curated_influence_media',
        trust_level: 2,
        raw_data: row,
      });
    }
    if (amountValue !== null) {
      bundle.money.push({
        filing_external_id: filingId,
        payer_client_external_id: clientExternal,
        money_type: (clean(row.money_type) as InfluenceMoneyInput['money_type']) || 'contract',
        amount_exact: amountValue,
        currency: clean(row.currency) || 'USD',
        period_start: clean(row.period_start),
        period_end: clean(row.period_end),
        description: clean(row.description),
        source_url: source,
        data_source: 'curated_influence_media',
        trust_level: 2,
        raw_data: row,
      });
    }
  }
  return bundle;
}

export function mergeInfluenceBundles(...bundles: InfluenceBundle[]): InfluenceBundle {
  const merged = emptyInfluenceBundle();
  for (const bundle of bundles) {
    merged.actors.push(...bundle.actors);
    merged.companies.push(...bundle.companies);
    merged.officers.push(...bundle.officers);
    merged.ownership.push(...bundle.ownership);
    merged.clients.push(...bundle.clients);
    merged.filings.push(...bundle.filings);
    merged.contacts.push(...bundle.contacts);
    merged.money.push(...bundle.money);
    merged.affiliations.push(...bundle.affiliations);
  }
  return merged;
}
