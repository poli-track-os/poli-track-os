export interface HatvpAssetItem {
  itemKind: string;
  label: string;
  sector: string;
  value: number | null;
  currency: string;
  isLiability: boolean;
  sourceCategory: string;
  rawData: Record<string, unknown>;
}

export interface HatvpFinancialInterest {
  companyName: string;
  value: number | null;
  capitalHeld: number | null;
  shareCount: number | null;
  remuneration: string | null;
  rawData: Record<string, unknown>;
}

export interface HatvpIncomeEntry {
  year: number;
  amount: number;
  label: string;
  category: string;
  isPublicOfficePay: boolean;
  rawData: Record<string, unknown>;
}

export interface ParsedHatvpAssetDeclaration {
  declarationType: string;
  declarationDate: string | null;
  declarationYear: number | null;
  declaredAssets: number;
  propertyValue: number;
  declaredDebt: number;
  netWorth: number;
  items: HatvpAssetItem[];
}

export interface ParsedHatvpInterestDeclaration {
  declarationType: string;
  declarationDate: string | null;
  declarationYear: number | null;
  financialInterests: HatvpFinancialInterest[];
  incomeEntries: HatvpIncomeEntry[];
  sideIncomeByYear: Record<number, number>;
}

type CategoryConfig = {
  key: string;
  itemKind: string;
  sector: string;
  label: string;
  isLiability?: boolean;
  amountFields: string[];
  labelFields: string[];
};

const ASSET_CATEGORIES: CategoryConfig[] = [
  {
    key: 'immeubleDto',
    itemKind: 'real_estate',
    sector: 'Real estate',
    label: 'Real estate',
    amountFields: ['valeurVenale', 'valeur'],
    labelFields: ['nature', 'localite', 'codePostal', 'droitReel', 'origine'],
  },
  {
    key: 'sciDto',
    itemKind: 'real_estate_company',
    sector: 'Real estate',
    label: 'Real-estate company',
    amountFields: ['valeurVenale', 'valeurActuelle', 'valeur'],
    labelFields: ['denomination', 'nomSociete', 'nature', 'localisation'],
  },
  {
    key: 'valeursNonEnBourseDto',
    itemKind: 'private_company_share',
    sector: 'Private company',
    label: 'Unlisted securities',
    amountFields: ['valeurActuelle', 'valeur'],
    labelFields: ['denomination', 'nomSociete', 'nature'],
  },
  {
    key: 'valeursEnBourseDto',
    itemKind: 'listed_security',
    sector: 'Securities',
    label: 'Listed securities',
    amountFields: ['valeur', 'valeurActuelle'],
    labelFields: ['naturePlacement', 'etablissement', 'titulaire'],
  },
  {
    key: 'assuranceVieDto',
    itemKind: 'life_insurance',
    sector: 'Insurance',
    label: 'Life insurance',
    amountFields: ['valeurRachat', 'valeur'],
    labelFields: ['etablissement', 'souscripteur', 'dateSouscription'],
  },
  {
    key: 'comptesBancaireDto',
    itemKind: 'bank_account',
    sector: 'Banking',
    label: 'Bank account',
    amountFields: ['valeur'],
    labelFields: ['typeCompte', 'etablissement', 'titulaire'],
  },
  {
    key: 'bienDiverDto',
    itemKind: 'movable_asset',
    sector: 'Other assets',
    label: 'Other movable asset',
    amountFields: ['valeur', 'valeurAchat'],
    labelFields: ['description', 'denomination', 'nature'],
  },
  {
    key: 'vehiculeDto',
    itemKind: 'vehicle',
    sector: 'Vehicle',
    label: 'Vehicle',
    amountFields: ['valeur', 'valeurAchat'],
    labelFields: ['marque', 'nature', 'anneeAchat'],
  },
  {
    key: 'fondDto',
    itemKind: 'business_asset',
    sector: 'Business asset',
    label: 'Business asset',
    amountFields: ['valeur', 'valeurActuelle'],
    labelFields: ['denomination', 'nature', 'description'],
  },
  {
    key: 'autreBienDto',
    itemKind: 'other_asset',
    sector: 'Other assets',
    label: 'Other asset',
    amountFields: ['valeur'],
    labelFields: ['description', 'denomination'],
  },
  {
    key: 'bienEtrangerDto',
    itemKind: 'foreign_asset',
    sector: 'Foreign assets',
    label: 'Foreign asset',
    amountFields: ['valeur'],
    labelFields: ['nature', 'localisation', 'description'],
  },
  {
    key: 'passifDto',
    itemKind: 'liability',
    sector: 'Debt',
    label: 'Liability',
    isLiability: true,
    amountFields: ['restantDu', 'montant'],
    labelFields: ['nature', 'nomCreancier', 'objetDette', 'datePassif'],
  },
];

const INCOME_CATEGORIES = [
  { key: 'activProfCinqDerniereDto', label: 'Professional activity', publicOffice: false },
  { key: 'activConsultantDto', label: 'Consulting activity', publicOffice: false },
  { key: 'participationDirigeantDto', label: 'Governance role', publicOffice: false },
  { key: 'mandatElectifDto', label: 'Elective mandate', publicOffice: true },
];

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function asArray(value: unknown): unknown[] {
  if (value === undefined || value === null || value === '') return [];
  return Array.isArray(value) ? value : [value];
}

function dtoItems(dto: unknown): Record<string, unknown>[] {
  const record = asRecord(dto);
  if (record.neant === true || record.neant === 'true') return [];
  return asArray(asRecord(record.items).items).map(asRecord).filter((item) => Object.keys(item).length > 0);
}

function cleanText(value: unknown) {
  return String(value ?? '')
    .replace(/\s+/g, ' ')
    .replace(/\[Données non publiées\]/gi, '')
    .trim();
}

export function parseHatvpNumber(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const raw = cleanText(value);
  if (!raw) return null;
  const match = raw.match(/-?\d[\d\s.,']*/);
  if (!match) return null;
  const compact = match[0].replace(/[\s']/g, '');
  const comma = compact.lastIndexOf(',');
  const dot = compact.lastIndexOf('.');
  let normalized = compact;
  if (comma > -1 && dot > -1) normalized = comma > dot ? compact.replace(/\./g, '').replace(',', '.') : compact.replace(/,/g, '');
  else if (comma > -1) normalized = compact.replace(',', '.');
  const amount = Number(normalized);
  return Number.isFinite(amount) ? amount : null;
}

function firstNumber(item: Record<string, unknown>, fields: string[]) {
  for (const field of fields) {
    const amount = parseHatvpNumber(item[field]);
    if (amount !== null) return amount;
  }
  return null;
}

function labelFromFields(item: Record<string, unknown>, fields: string[], fallback: string) {
  const parts = fields
    .map((field) => cleanText(item[field]))
    .filter((part) => part && part.toLowerCase() !== 'neant');
  return parts.length > 0 ? parts.join(' · ').slice(0, 300) : fallback;
}

export function parseHatvpDate(value: unknown): string | null {
  const text = cleanText(value);
  const match = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (!match) return null;
  return `${match[3]}-${match[2].padStart(2, '0')}-${match[1].padStart(2, '0')}`;
}

function declarationType(declaration: Record<string, unknown>) {
  return cleanText(asRecord(asRecord(declaration.general).typeDeclaration).id).toUpperCase();
}

export function parseHatvpAssetDeclaration(declaration: Record<string, unknown>): ParsedHatvpAssetDeclaration {
  const items = ASSET_CATEGORIES.flatMap((category) => dtoItems(declaration[category.key]).map((raw): HatvpAssetItem => ({
    itemKind: category.itemKind,
    label: labelFromFields(raw, category.labelFields, category.label),
    sector: category.sector,
    value: firstNumber(raw, category.amountFields),
    currency: 'EUR',
    isLiability: Boolean(category.isLiability),
    sourceCategory: category.key,
    rawData: raw,
  })));
  const declaredAssets = Math.round(items.filter((item) => !item.isLiability).reduce((sum, item) => sum + (item.value || 0), 0));
  const propertyValue = Math.round(items
    .filter((item) => !item.isLiability && ['real_estate', 'real_estate_company'].includes(item.itemKind))
    .reduce((sum, item) => sum + (item.value || 0), 0));
  const declaredDebt = Math.round(items.filter((item) => item.isLiability).reduce((sum, item) => sum + (item.value || 0), 0));
  const declarationDate = parseHatvpDate(declaration.dateDepot);

  return {
    declarationType: declarationType(declaration),
    declarationDate,
    declarationYear: declarationDate ? Number(declarationDate.slice(0, 4)) : null,
    declaredAssets,
    propertyValue,
    declaredDebt,
    netWorth: declaredAssets - declaredDebt,
    items,
  };
}

function remunerationAmounts(item: Record<string, unknown>) {
  const montant = asRecord(asRecord(item.remuneration).montant).montant;
  return asArray(montant).map(asRecord).flatMap((entry) => {
    const year = parseHatvpNumber(entry.annee);
    const amount = parseHatvpNumber(entry.montant);
    if (!year || amount === null || amount <= 0) return [];
    return [{ year, amount }];
  });
}

function incomeLabel(item: Record<string, unknown>) {
  return labelFromFields(item, [
    'description',
    'descriptionActivite',
    'descriptionMandat',
    'activite',
    'employeur',
    'nomSociete',
    'nomStructure',
  ], 'Declared income');
}

function isPublicOfficeIncome(label: string, defaultPublicOffice: boolean) {
  const normalized = label.toLowerCase();
  return defaultPublicOffice ||
    normalized.includes('député au parlement européen') ||
    normalized.includes('parlement européen') ||
    normalized.includes('conseiller régional') ||
    normalized.includes('mandat');
}

export function parseHatvpInterestDeclaration(declaration: Record<string, unknown>): ParsedHatvpInterestDeclaration {
  const financialInterests = dtoItems(declaration.participationFinanciereDto).flatMap((raw): HatvpFinancialInterest[] => {
    const companyName = labelFromFields(raw, ['nomSociete', 'denomination'], '');
    if (!companyName || companyName.toLowerCase() === 'neant') return [];
    return [{
      companyName,
      value: firstNumber(raw, ['evaluation', 'valeurActuelle', 'valeur']),
      capitalHeld: parseHatvpNumber(raw.capitalDetenu),
      shareCount: parseHatvpNumber(raw.nombreParts),
      remuneration: cleanText(raw.remuneration) || null,
      rawData: raw,
    }];
  });

  const incomeEntries = INCOME_CATEGORIES.flatMap((category) => dtoItems(declaration[category.key]).flatMap((raw) => {
    const label = incomeLabel(raw);
    const isPublicOfficePay = isPublicOfficeIncome(label, category.publicOffice);
    return remunerationAmounts(raw).map((amount) => ({
      ...amount,
      label,
      category: category.key,
      isPublicOfficePay,
      rawData: raw,
    }));
  }));

  const sideIncomeByYear: Record<number, number> = {};
  for (const entry of incomeEntries) {
    if (entry.isPublicOfficePay) continue;
    sideIncomeByYear[entry.year] = Math.round((sideIncomeByYear[entry.year] || 0) + entry.amount);
  }

  const declarationDate = parseHatvpDate(declaration.dateDepot);
  return {
    declarationType: declarationType(declaration),
    declarationDate,
    declarationYear: declarationDate ? Number(declarationDate.slice(0, 4)) : null,
    financialInterests,
    incomeEntries,
    sideIncomeByYear,
  };
}
