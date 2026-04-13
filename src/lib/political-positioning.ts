export interface PoliticalPositionLike {
  id?: string;
  politician_id?: string;
  economic_score?: number | null;
  social_score?: number | null;
  eu_integration_score?: number | null;
  environmental_score?: number | null;
  immigration_score?: number | null;
  education_priority?: number | null;
  science_priority?: number | null;
  healthcare_priority?: number | null;
  defense_priority?: number | null;
  economy_priority?: number | null;
  justice_priority?: number | null;
  social_welfare_priority?: number | null;
  environment_priority?: number | null;
  ideology_label?: string | null;
  key_positions?: Record<string, string> | null;
  data_source?: string | null;
}

export type IdeologyFamily =
  | 'Social Democrat'
  | 'Green / Ecologist'
  | 'Democratic Socialist'
  | 'Christian Democrat / Centre-Right'
  | 'Liberal'
  | 'Centrist'
  | 'National Conservative'
  | 'Right-Wing Populist'
  | 'Unclassified';

export const IDEOLOGY_COLORS: Record<IdeologyFamily, string> = {
  'Social Democrat': 'hsl(0, 65%, 50%)',
  'Green / Ecologist': 'hsl(140, 55%, 40%)',
  'Democratic Socialist': 'hsl(345, 60%, 45%)',
  'Christian Democrat / Centre-Right': 'hsl(215, 45%, 50%)',
  Liberal: 'hsl(45, 75%, 50%)',
  Centrist: 'hsl(35, 70%, 58%)',
  'National Conservative': 'hsl(25, 60%, 45%)',
  'Right-Wing Populist': 'hsl(270, 40%, 40%)',
  Unclassified: 'hsl(0, 0%, 55%)',
};

export const IDEOLOGY_IDEAL_X: Record<IdeologyFamily, number> = {
  'Democratic Socialist': -7,
  'Social Democrat': -4,
  'Green / Ecologist': -3,
  Liberal: 2,
  Centrist: 0,
  'Christian Democrat / Centre-Right': 4,
  'National Conservative': 5,
  'Right-Wing Populist': 3,
  Unclassified: 0,
};

interface PartyProfile {
  ideology: string;
  economic: number;
  social: number;
  eu: number;
  environment: number;
  immigration: number;
  priorities: {
    education: number;
    science: number;
    healthcare: number;
    defense: number;
    economy: number;
    justice: number;
    social_welfare: number;
    environment: number;
  };
}

type PartyProfileDefinition = PartyProfile & {
  aliases?: string[];
  countries?: string[];
};

const PARTY_PROFILES: Record<string, PartyProfileDefinition> = {
  "European People's Party": {
    ideology: 'Christian-democratic / centre-right',
    economic: 4, social: 2, eu: 8, environment: 4, immigration: -2,
    priorities: { education: 6, science: 6, healthcare: 6, defense: 6, economy: 8, justice: 6, social_welfare: 5, environment: 5 },
    aliases: ['Group of the European People\'s Party (Christian Democrats)', 'EPP'],
  },
  'Socialists and Democrats': {
    ideology: 'Social-democratic',
    economic: -4, social: -3, eu: 7, environment: 6, immigration: 4,
    priorities: { education: 8, science: 7, healthcare: 8, defense: 4, economy: 6, justice: 6, social_welfare: 8, environment: 7 },
    aliases: ['Group of the Progressive Alliance of Socialists and Democrats in the European Parliament', 'S&D'],
  },
  'Renew Europe': {
    ideology: 'Liberal / centrist',
    economic: 2, social: -4, eu: 9, environment: 5, immigration: 3,
    priorities: { education: 7, science: 8, healthcare: 6, defense: 5, economy: 8, justice: 6, social_welfare: 5, environment: 6 },
    aliases: ['Renew Europe Group'],
  },
  'Greens/European Free Alliance': {
    ideology: 'Green / regionalist',
    economic: -5, social: -6, eu: 6, environment: 10, immigration: 6,
    priorities: { education: 8, science: 8, healthcare: 7, defense: 2, economy: 4, justice: 7, social_welfare: 8, environment: 10 },
    aliases: ['Group of the Greens/European Free Alliance', 'Greens/EFA'],
  },
  'The Left': {
    ideology: 'Democratic socialist / communist',
    economic: -8, social: -5, eu: 2, environment: 7, immigration: 7,
    priorities: { education: 8, science: 6, healthcare: 9, defense: 1, economy: 4, justice: 7, social_welfare: 10, environment: 8 },
    aliases: ['The Left group in the European Parliament - GUE/NGL', 'GUE/NGL', 'The Left group in the European Parliament'],
  },
  'European Conservatives and Reformists': {
    ideology: 'Conservative / soft-eurosceptic',
    economic: 6, social: 5, eu: -2, environment: 2, immigration: -5,
    priorities: { education: 5, science: 5, healthcare: 5, defense: 8, economy: 8, justice: 7, social_welfare: 3, environment: 3 },
    aliases: ['European Conservatives and Reformists Group', 'ECR'],
  },
  'Patriots for Europe': {
    ideology: 'National-conservative / right-wing populist',
    economic: 5, social: 7, eu: -6, environment: -1, immigration: -8,
    priorities: { education: 4, science: 4, healthcare: 5, defense: 9, economy: 7, justice: 8, social_welfare: 4, environment: 2 },
    aliases: ['Patriots for Europe Group'],
  },
  'Europe of Sovereign Nations': {
    ideology: 'Hard-right / hard-eurosceptic',
    economic: 5, social: 8, eu: -9, environment: -2, immigration: -9,
    priorities: { education: 4, science: 3, healthcare: 5, defense: 9, economy: 6, justice: 8, social_welfare: 4, environment: 1 },
  },
  'Non-attached': {
    ideology: 'Non-attached',
    economic: 0, social: 0, eu: 0, environment: 0, immigration: 0,
    priorities: { education: 5, science: 5, healthcare: 5, defense: 5, economy: 5, justice: 5, social_welfare: 5, environment: 5 },
    aliases: ['Non-attached Members', 'NI'],
  },

  CDU: {
    ideology: 'Christian-democratic',
    economic: 5, social: 3, eu: 8, environment: 4, immigration: -2,
    priorities: { education: 6, science: 6, healthcare: 6, defense: 7, economy: 8, justice: 6, social_welfare: 5, environment: 5 },
    aliases: ['Christian Democratic Union of Germany'],
  },
  CSU: {
    ideology: 'Christian-democratic / Bavarian conservative',
    economic: 5, social: 5, eu: 6, environment: 3, immigration: -4,
    priorities: { education: 6, science: 5, healthcare: 6, defense: 8, economy: 8, justice: 7, social_welfare: 4, environment: 4 },
  },
  SPD: {
    ideology: 'Social-democratic',
    economic: -4, social: -3, eu: 8, environment: 6, immigration: 4,
    priorities: { education: 8, science: 7, healthcare: 8, defense: 5, economy: 6, justice: 6, social_welfare: 9, environment: 7 },
    aliases: ['Social Democratic Party of Germany'],
  },
  "Bündnis 90/Die Grünen": {
    ideology: 'Green',
    economic: -4, social: -6, eu: 8, environment: 10, immigration: 6,
    priorities: { education: 8, science: 8, healthcare: 7, defense: 3, economy: 5, justice: 7, social_welfare: 8, environment: 10 },
    aliases: ['Die Grünen', 'Alliance 90/The Greens'],
  },
  FDP: {
    ideology: 'Liberal',
    economic: 6, social: -4, eu: 6, environment: 3, immigration: 3,
    priorities: { education: 7, science: 8, healthcare: 5, defense: 6, economy: 9, justice: 5, social_welfare: 3, environment: 5 },
    aliases: ['Free Democratic Party'],
  },
  AfD: {
    ideology: 'Right-wing populist',
    economic: 4, social: 8, eu: -8, environment: -3, immigration: -9,
    priorities: { education: 4, science: 3, healthcare: 4, defense: 9, economy: 6, justice: 8, social_welfare: 4, environment: 1 },
    aliases: ['Alternative for Germany'],
  },
  'Die Linke': {
    ideology: 'Democratic socialist',
    economic: -8, social: -5, eu: 3, environment: 7, immigration: 7,
    priorities: { education: 8, science: 6, healthcare: 9, defense: 1, economy: 4, justice: 7, social_welfare: 10, environment: 8 },
    aliases: ['The Left'],
  },
  BSW: {
    ideology: 'Left-nationalist',
    economic: -5, social: 4, eu: -3, environment: 3, immigration: -3,
    priorities: { education: 6, science: 5, healthcare: 8, defense: 4, economy: 6, justice: 6, social_welfare: 9, environment: 5 },
  },

  Renaissance: {
    ideology: 'Liberal / centrist (Macronist)',
    economic: 3, social: -3, eu: 9, environment: 5, immigration: 3,
    priorities: { education: 7, science: 8, healthcare: 6, defense: 6, economy: 8, justice: 6, social_welfare: 5, environment: 6 },
    aliases: ['La République En Marche'],
  },
  'Rassemblement National': {
    ideology: 'National-populist',
    economic: 2, social: 7, eu: -7, environment: 0, immigration: -9,
    priorities: { education: 4, science: 3, healthcare: 5, defense: 9, economy: 7, justice: 8, social_welfare: 6, environment: 2 },
    aliases: ['RN'],
  },
  'La France insoumise': {
    ideology: 'Democratic socialist',
    economic: -8, social: -4, eu: 3, environment: 8, immigration: 7,
    priorities: { education: 8, science: 7, healthcare: 9, defense: 2, economy: 4, justice: 7, social_welfare: 10, environment: 9 },
    aliases: ['LFI'],
  },
  'Les Républicains': {
    ideology: 'Gaullist / conservative',
    economic: 5, social: 4, eu: 5, environment: 3, immigration: -4,
    priorities: { education: 6, science: 5, healthcare: 6, defense: 8, economy: 8, justice: 7, social_welfare: 4, environment: 4 },
    aliases: ['LR'],
  },
  'Parti socialiste': {
    ideology: 'Social-democratic',
    economic: -5, social: -3, eu: 7, environment: 6, immigration: 4,
    priorities: { education: 8, science: 7, healthcare: 8, defense: 4, economy: 6, justice: 6, social_welfare: 8, environment: 7 },
    aliases: ['PS'],
  },
  'Europe Écologie Les Verts': {
    ideology: 'Green',
    economic: -5, social: -6, eu: 7, environment: 10, immigration: 6,
    priorities: { education: 8, science: 8, healthcare: 7, defense: 3, economy: 4, justice: 7, social_welfare: 8, environment: 10 },
    aliases: ['EELV'],
  },

  "Fratelli d'Italia": {
    ideology: 'National-conservative',
    economic: 4, social: 7, eu: -3, environment: 0, immigration: -7,
    priorities: { education: 5, science: 4, healthcare: 5, defense: 8, economy: 7, justice: 8, social_welfare: 5, environment: 3 },
    aliases: ['FDI'],
  },
  Lega: {
    ideology: 'Right-wing populist / regionalist',
    economic: 4, social: 6, eu: -6, environment: -1, immigration: -8,
    priorities: { education: 4, science: 4, healthcare: 5, defense: 8, economy: 7, justice: 8, social_welfare: 5, environment: 2 },
  },
  'Forza Italia': {
    ideology: 'Centre-right / liberal-conservative',
    economic: 5, social: 3, eu: 6, environment: 3, immigration: -2,
    priorities: { education: 6, science: 5, healthcare: 6, defense: 7, economy: 8, justice: 6, social_welfare: 5, environment: 4 },
    aliases: ['FI'],
  },
  'Partito Democratico': {
    ideology: 'Social-democratic',
    economic: -4, social: -3, eu: 8, environment: 6, immigration: 4,
    priorities: { education: 8, science: 7, healthcare: 8, defense: 5, economy: 6, justice: 6, social_welfare: 8, environment: 7 },
    aliases: ['PD'],
  },
  'Movimento 5 Stelle': {
    ideology: 'Populist / big-tent',
    economic: -2, social: 0, eu: 2, environment: 5, immigration: 2,
    priorities: { education: 7, science: 6, healthcare: 7, defense: 4, economy: 6, justice: 7, social_welfare: 7, environment: 6 },
    aliases: ['M5S'],
  },

  'Partido Popular': {
    ideology: 'Christian-democratic / centre-right',
    economic: 5, social: 3, eu: 7, environment: 3, immigration: -2,
    priorities: { education: 6, science: 5, healthcare: 6, defense: 7, economy: 8, justice: 7, social_welfare: 5, environment: 4 },
    aliases: ['People\'s Party', 'PP'],
  },
  PSOE: {
    ideology: 'Social-democratic',
    economic: -4, social: -3, eu: 8, environment: 6, immigration: 4,
    priorities: { education: 8, science: 7, healthcare: 8, defense: 5, economy: 6, justice: 6, social_welfare: 9, environment: 7 },
    aliases: ['Partido Socialista Obrero Español', 'Socialist Party'],
  },
  Vox: {
    ideology: 'Right-wing populist',
    economic: 5, social: 8, eu: -5, environment: -2, immigration: -8,
    priorities: { education: 4, science: 3, healthcare: 5, defense: 9, economy: 7, justice: 8, social_welfare: 4, environment: 2 },
    aliases: ['VOX'],
  },
  Sumar: {
    ideology: 'Left-wing / progressive',
    economic: -7, social: -5, eu: 5, environment: 8, immigration: 6,
    priorities: { education: 8, science: 7, healthcare: 9, defense: 2, economy: 4, justice: 7, social_welfare: 10, environment: 9 },
    aliases: ['Movimiento Sumar'],
  },
  Podemos: {
    ideology: 'Democratic socialist',
    economic: -7, social: -5, eu: 3, environment: 7, immigration: 7,
    priorities: { education: 8, science: 6, healthcare: 9, defense: 1, economy: 4, justice: 7, social_welfare: 10, environment: 8 },
    aliases: ['PODEMOS'],
  },

  'Prawo i Sprawiedliwość': {
    ideology: 'National-conservative',
    economic: 2, social: 7, eu: -3, environment: 0, immigration: -5,
    priorities: { education: 5, science: 4, healthcare: 6, defense: 9, economy: 6, justice: 8, social_welfare: 7, environment: 3 },
    aliases: ['PiS'],
  },
  'Platforma Obywatelska': {
    ideology: 'Liberal-conservative',
    economic: 4, social: 2, eu: 8, environment: 4, immigration: 2,
    priorities: { education: 7, science: 6, healthcare: 6, defense: 7, economy: 8, justice: 6, social_welfare: 5, environment: 5 },
    aliases: ['PO'],
  },
  Konfederacja: {
    ideology: 'Libertarian / nationalist',
    economic: 8, social: 7, eu: -7, environment: -3, immigration: -8,
    priorities: { education: 4, science: 4, healthcare: 4, defense: 8, economy: 9, justice: 7, social_welfare: 2, environment: 1 },
  },

  VVD: {
    ideology: 'Liberal-conservative',
    economic: 6, social: 2, eu: 6, environment: 4, immigration: -2,
    priorities: { education: 7, science: 7, healthcare: 6, defense: 7, economy: 9, justice: 6, social_welfare: 4, environment: 5 },
  },
  PVV: {
    ideology: 'Right-wing populist',
    economic: 3, social: 7, eu: -8, environment: -2, immigration: -9,
    priorities: { education: 4, science: 3, healthcare: 6, defense: 8, economy: 6, justice: 8, social_welfare: 5, environment: 2 },
  },
  D66: {
    ideology: 'Social-liberal / progressive',
    economic: 2, social: -5, eu: 9, environment: 7, immigration: 5,
    priorities: { education: 9, science: 9, healthcare: 7, defense: 5, economy: 7, justice: 6, social_welfare: 6, environment: 8 },
  },
  'GroenLinks-PvdA': {
    ideology: 'Green social-democratic',
    economic: -5, social: -5, eu: 8, environment: 9, immigration: 6,
    priorities: { education: 8, science: 7, healthcare: 8, defense: 3, economy: 5, justice: 7, social_welfare: 9, environment: 10 },
  },

  PSD: {
    ideology: 'Centre-right / social-democratic',
    economic: 4, social: 2, eu: 7, environment: 4, immigration: 0,
    priorities: { education: 7, science: 6, healthcare: 7, defense: 6, economy: 8, justice: 6, social_welfare: 6, environment: 5 },
    countries: ['PT'],
    aliases: ['Partido Social Democrata', 'Partido Social Democrático', 'Partido Social Democrata (Portugal)', 'Aliança Democrática'],
  },
  PS: {
    ideology: 'Social-democratic',
    economic: -4, social: -3, eu: 8, environment: 6, immigration: 4,
    priorities: { education: 8, science: 7, healthcare: 8, defense: 4, economy: 6, justice: 6, social_welfare: 9, environment: 7 },
    countries: ['PT'],
    aliases: ['Partido Socialista', 'Socialist Party'],
  },
  Chega: {
    ideology: 'Right-wing populist',
    economic: 4, social: 8, eu: -4, environment: -2, immigration: -8,
    priorities: { education: 4, science: 3, healthcare: 5, defense: 9, economy: 7, justice: 8, social_welfare: 4, environment: 2 },
    countries: ['PT'],
    aliases: ['CH'],
  },
  'Iniciativa Liberal': {
    ideology: 'Classical liberal',
    economic: 8, social: -3, eu: 6, environment: 3, immigration: 4,
    priorities: { education: 7, science: 7, healthcare: 5, defense: 6, economy: 10, justice: 6, social_welfare: 2, environment: 4 },
    countries: ['PT'],
    aliases: ['IL', 'Liberal Initiative'],
  },
  'Bloco de Esquerda': {
    ideology: 'Democratic socialist',
    economic: -8, social: -5, eu: 3, environment: 8, immigration: 7,
    priorities: { education: 8, science: 6, healthcare: 9, defense: 1, economy: 4, justice: 7, social_welfare: 10, environment: 9 },
    countries: ['PT'],
    aliases: ['BE', 'Left Bloc'],
  },
  PAN: {
    ideology: 'Green / social-liberal',
    economic: -2, social: -5, eu: 7, environment: 10, immigration: 5,
    priorities: { education: 7, science: 6, healthcare: 8, defense: 2, economy: 4, justice: 7, social_welfare: 7, environment: 10 },
    countries: ['PT'],
    aliases: ['People-Animals-Nature'],
  },
  PCP: {
    ideology: 'Communist',
    economic: -9, social: -3, eu: -2, environment: 5, immigration: 3,
    priorities: { education: 7, science: 5, healthcare: 9, defense: 3, economy: 4, justice: 7, social_welfare: 10, environment: 6 },
    countries: ['PT'],
    aliases: ['Partido Comunista Português', 'Portuguese Communist Party'],
  },
  Livre: {
    ideology: 'Green / progressive',
    economic: -5, social: -6, eu: 8, environment: 9, immigration: 6,
    priorities: { education: 8, science: 7, healthcare: 8, defense: 3, economy: 5, justice: 7, social_welfare: 8, environment: 10 },
    countries: ['PT'],
    aliases: ['L'],
  },
  'Partido do Centro Democrático Social-Partido Popular': {
    ideology: 'Christian-democratic / conservative',
    economic: 5, social: 5, eu: 2, environment: 2, immigration: -5,
    priorities: { education: 5, science: 4, healthcare: 5, defense: 8, economy: 8, justice: 7, social_welfare: 4, environment: 3 },
    countries: ['PT'],
    aliases: ['CDS-PP'],
  },
};

function normalizeToken(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function hasKeys(value: Record<string, string> | null | undefined) {
  return Boolean(value && Object.keys(value).length > 0);
}

function normalizeIdeologyInput(label: string | null | undefined) {
  return normalizeToken(label || '');
}

function longAliasInCandidate(candidate: string, alias: string) {
  return alias.length >= 10 && candidate.includes(alias);
}

export function getIdeologyDisplayLabel(label: string | null | undefined) {
  if (!label || !label.trim()) return 'Unclassified';
  if (normalizeIdeologyInput(label) === 'centrist unclassified') return 'Unclassified';
  return label.trim();
}

export function getIdeologyFamily(label: string | null | undefined): IdeologyFamily {
  const normalized = normalizeIdeologyInput(label);
  if (!normalized || normalized === 'unknown' || normalized === 'centrist unclassified' || normalized === 'non attached') {
    return 'Unclassified';
  }
  if (normalized.includes('green') || normalized.includes('ecologist') || normalized.includes('regionalist')) {
    return 'Green / Ecologist';
  }
  if (normalized.includes('social democratic') || normalized.includes('social democrat')) {
    return 'Social Democrat';
  }
  if (
    normalized.includes('democratic socialist') ||
    normalized.includes('communist') ||
    normalized.includes('left wing') ||
    normalized.includes('progressive')
  ) {
    return 'Democratic Socialist';
  }
  if (
    normalized.includes('right wing populist') ||
    normalized.includes('national populist') ||
    normalized.includes('hard right') ||
    normalized.includes('hard eurosceptic') ||
    normalized.includes('far right') ||
    normalized.includes('extreme right') ||
    normalized.includes('libertarian nationalist')
  ) {
    return 'Right-Wing Populist';
  }
  if (normalized.includes('national conservative') || normalized.includes('soft eurosceptic')) {
    return 'National Conservative';
  }
  if (
    normalized.includes('christian democratic') ||
    normalized.includes('centre right') ||
    normalized.includes('center right') ||
    normalized.includes('gaullist') ||
    (normalized.includes('conservative') && !normalized.includes('national conservative'))
  ) {
    return 'Christian Democrat / Centre-Right';
  }
  if (normalized.includes('centrist') || normalized.includes('macronist')) {
    return 'Centrist';
  }
  if (normalized.includes('liberal')) {
    return 'Liberal';
  }
  return 'Unclassified';
}

export function getIdeologyColor(label: string | null | undefined) {
  return IDEOLOGY_COLORS[getIdeologyFamily(label)];
}

export function isLegacyCombinedEstimate(position: PoliticalPositionLike | null | undefined) {
  if (!position) return false;

  const label = normalizeIdeologyInput(position.ideology_label);
  return label === 'centrist unclassified' || position.data_source === 'party_family_mapping';
}

export function hasRenderableCompassPosition(position: PoliticalPositionLike | null | undefined) {
  if (!position) return false;
  return isFiniteNumber(position.economic_score) && isFiniteNumber(position.social_score);
}

export function hasRenderablePolicyAxes(position: PoliticalPositionLike | null | undefined) {
  if (!position) return false;

  return [
    position.economic_score,
    position.social_score,
    position.eu_integration_score,
    position.environmental_score,
    position.immigration_score,
  ].every(isFiniteNumber);
}

function axisStance(value: number, negative: string, positive: string, threshold = 4) {
  if (value <= -threshold) return negative;
  if (value >= threshold) return positive;
  return null;
}

function priorityStance(value: number, low: string, high: string, lowThreshold = 3, highThreshold = 7) {
  if (value <= lowThreshold) return low;
  if (value >= highThreshold) return high;
  return null;
}

export function lookupPartyProfile(
  partyName?: string | null,
  partyAbbreviation?: string | null,
  countryCode?: string | null,
) {
  const candidates = [partyAbbreviation, partyName]
    .filter((value): value is string => Boolean(value && value.trim()))
    .map(normalizeToken);

  if (candidates.length === 0) return null;

  const upperCountry = countryCode?.toUpperCase() || null;

  for (const [key, profile] of Object.entries(PARTY_PROFILES)) {
    if (profile.countries && upperCountry && !profile.countries.includes(upperCountry)) {
      continue;
    }

    const aliases = [key, ...(profile.aliases || [])].map(normalizeToken);
    if (aliases.some((alias) => candidates.some((candidate) => candidate === alias))) {
      return profile;
    }
  }

  for (const [key, profile] of Object.entries(PARTY_PROFILES)) {
    if (profile.countries && upperCountry && !profile.countries.includes(upperCountry)) {
      continue;
    }

    const aliases = [key, ...(profile.aliases || [])].map(normalizeToken);
    if (aliases.some((alias) => candidates.some((candidate) => longAliasInCandidate(candidate, alias)))) {
      return profile;
    }
  }

  return null;
}

export function deriveKeyPositions(profile: PartyProfile) {
  const keyPositions: Record<string, string> = {};

  const eu = axisStance(profile.eu, 'eurosceptic', 'pro-EU');
  if (eu) keyPositions.eu_integration = eu;

  const climate = axisStance(profile.environment, 'anti-green', 'pro-green');
  if (climate) keyPositions.climate_policy = climate;

  const immigration = axisStance(profile.immigration, 'restrictive', 'open');
  if (immigration) keyPositions.immigration = immigration;

  const economic = axisStance(profile.economic, 'redistribution / public spending', 'tax cuts / market liberalism');
  if (economic) keyPositions.economic_model = economic;

  const welfare = priorityStance(profile.priorities.social_welfare, 'limit expansion', 'expand social welfare');
  if (welfare) keyPositions.social_welfare = welfare;

  const defense = priorityStance(profile.priorities.defense, 'deprioritize', 'increase');
  if (defense) keyPositions.defense_spending = defense;

  return keyPositions;
}

export function buildEstimatedPoliticalPosition(
  partyName?: string | null,
  partyAbbreviation?: string | null,
  countryCode?: string | null,
): PoliticalPositionLike | null {
  const profile = lookupPartyProfile(partyName, partyAbbreviation, countryCode);
  if (!profile) return null;

  return {
    economic_score: profile.economic,
    social_score: profile.social,
    eu_integration_score: profile.eu,
    environmental_score: profile.environment,
    immigration_score: profile.immigration,
    education_priority: profile.priorities.education,
    science_priority: profile.priorities.science,
    healthcare_priority: profile.priorities.healthcare,
    defense_priority: profile.priorities.defense,
    economy_priority: profile.priorities.economy,
    justice_priority: profile.priorities.justice,
    social_welfare_priority: profile.priorities.social_welfare,
    environment_priority: profile.priorities.environment,
    ideology_label: profile.ideology,
    key_positions: deriveKeyPositions(profile),
    data_source: 'party_profile_estimate',
  };
}

function buildUnclassifiedPosition(position: PoliticalPositionLike | null | undefined) {
  return {
    ...position,
    economic_score: null,
    social_score: null,
    eu_integration_score: null,
    environmental_score: null,
    immigration_score: null,
    education_priority: null,
    science_priority: null,
    healthcare_priority: null,
    defense_priority: null,
    economy_priority: null,
    justice_priority: null,
    social_welfare_priority: null,
    environment_priority: null,
    ideology_label: 'Unclassified',
    key_positions: {},
    data_source: 'unclassified_party_profile',
  };
}

export function resolvePoliticalPosition(
  position: PoliticalPositionLike | null | undefined,
  partyName?: string | null,
  partyAbbreviation?: string | null,
  countryCode?: string | null,
) {
  const fallback = buildEstimatedPoliticalPosition(partyName, partyAbbreviation, countryCode);

  if (!position) return fallback;

  if (isLegacyCombinedEstimate(position)) {
    if (fallback) {
      return {
        ...position,
        ...fallback,
      };
    }

    return buildUnclassifiedPosition(position);
  }

  if (fallback && !hasKeys(position.key_positions)) {
    return {
      ...position,
      key_positions: fallback.key_positions,
      data_source: position.data_source || fallback.data_source,
      ideology_label: position.ideology_label || fallback.ideology_label,
    };
  }

  return {
    ...position,
    ideology_label: getIdeologyDisplayLabel(position.ideology_label),
  };
}
