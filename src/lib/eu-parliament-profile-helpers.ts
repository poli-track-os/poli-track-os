import { JSDOM } from 'jsdom';

const EP_PROFILE_SOURCE_LABEL = 'European Parliament profile';
const EP_PROFILE_DATASET_URL = 'https://www.europarl.europa.eu/meps/en/full-list/xml';

export type EuParliamentHomeProfile = {
  canonicalUrl: string | null;
  countryName: string | null;
  nationalParty: string | null;
  politicalGroup: string | null;
  politicalRole: string | null;
  birthDate: string | null;
  birthYear: number | null;
  birthPlace: string | null;
  twitterHandle: string | null;
  websiteUrl: string | null;
  statuses: string[];
};

export type EuParliamentCvSection = {
  title: string;
  items: string[];
};

export type EuParliamentCvProfile = {
  hasCv: boolean;
  sections: EuParliamentCvSection[];
  updatedAt: string | null;
};

export type ExistingEuParliamentRow = {
  biography: string | null;
  birth_year: number | null;
  enriched_at: string | null;
  external_id: string | null;
  source_attribution: Record<string, unknown> | null;
  source_url: string | null;
  twitter_handle: string | null;
};

export type EuParliamentProfileUpdatePlan = {
  biography: string | null;
  changedFields: string[];
  payload: Record<string, unknown>;
};

function normalizeText(value: string | null | undefined) {
  if (!value) return '';
  return value.replace(/\s+/g, ' ').trim();
}

function parseDisplayCountryAndParty(value: string | null | undefined) {
  const cleaned = normalizeText(value);
  if (!cleaned) return { countryName: null, nationalParty: null };
  const parts = cleaned.split(/\s+-\s+/);
  if (parts.length < 2) return { countryName: cleaned || null, nationalParty: null };

  const countryName = normalizeText(parts[0]) || null;
  let nationalParty = normalizeText(parts.slice(1).join(' - ')) || null;
  if (countryName && nationalParty) {
    nationalParty = nationalParty.replace(new RegExp(`\\s*\\(${countryName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\)$`), '').trim() || nationalParty;
  }

  return { countryName, nationalParty };
}

function extractTwitterHandle(rawUrl: string | null | undefined) {
  if (!rawUrl) return null;
  const match = rawUrl.match(/(?:twitter\.com|x\.com)\/([A-Za-z0-9_]{1,15})(?:[/?#]|$)/i);
  return match ? match[1] : null;
}

function isUrlLikeTwitterHandle(value: string | null | undefined) {
  const cleaned = normalizeText(value);
  return /(?:https?:\/\/)?(?:www\.)?(?:twitter\.com|x\.com)\//i.test(cleaned);
}

function parseDateToIso(raw: string | null | undefined) {
  const cleaned = normalizeText(raw);
  if (!cleaned) return null;
  const isoDate = cleaned.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoDate) return cleaned;
  const dmyDate = cleaned.match(/^(\d{2})-(\d{2})-(\d{4})$/);
  if (!dmyDate) return null;
  const [, day, month, year] = dmyDate;
  return `${year}-${month}-${day}`;
}

function toIsoFromSlashDate(raw: string | null | undefined) {
  const cleaned = normalizeText(raw);
  const match = cleaned.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!match) return null;
  const [, day, month, year] = match;
  return `${year}-${month}-${day}`;
}

function buildStatusSummary(doc: Document) {
  return [...doc.querySelectorAll('.erpl_meps-status')]
    .flatMap((node) => {
      const heading = normalizeText(node.querySelector('h4')?.textContent);
      const badges = [...node.querySelectorAll('.es_badge')]
        .map((badge) => normalizeText(badge.textContent))
        .filter((value) => value.length > 0);
      if (badges.length === 0) return heading ? [heading] : [];
      if (!heading) return badges;
      return badges.map((badge) => `${heading} of ${badge}`);
    })
    .filter((value, index, array) => value.length > 0 && array.indexOf(value) === index);
}

export function parseEuParliamentHomeHtml(html: string): EuParliamentHomeProfile {
  const doc = new JSDOM(html).window.document;
  const canonicalUrl = doc.querySelector('link[rel="canonical"]')?.getAttribute('href') || null;
  const { countryName, nationalParty } = parseDisplayCountryAndParty(
    doc.querySelector('.es_title-h3.mt-1.mb-1')?.textContent,
  );
  const birthDate = parseDateToIso(
    doc.querySelector('.sln-birth-date')?.getAttribute('datetime')
      || doc.querySelector('.sln-birth-date')?.textContent,
  );

  return {
    canonicalUrl,
    countryName,
    nationalParty,
    politicalGroup: normalizeText(doc.querySelector('.sln-political-group-name')?.textContent) || null,
    politicalRole: normalizeText(doc.querySelector('.sln-political-group-role')?.textContent) || null,
    birthDate,
    birthYear: birthDate ? Number.parseInt(birthDate.slice(0, 4), 10) : null,
    birthPlace: normalizeText(doc.querySelector('.sln-birth-place')?.textContent) || null,
    twitterHandle: extractTwitterHandle(doc.querySelector('a.link_twitt')?.getAttribute('href')),
    websiteUrl: doc.querySelector('a.link_website')?.getAttribute('href') || null,
    statuses: buildStatusSummary(doc),
  };
}

export function parseEuParliamentCvHtml(html: string): EuParliamentCvProfile {
  const doc = new JSDOM(html).window.document;
  const noCv = Boolean(doc.querySelector('#no_cv_available'));
  const sections = [...doc.querySelectorAll('.erpl_meps-activity')]
    .map((node) => ({
      title: normalizeText(node.querySelector('h4')?.textContent),
      items: [...node.querySelectorAll('li')]
        .map((item) => normalizeText(item.textContent))
        .filter((value) => value.length > 0),
    }))
    .filter((section) => section.title.length > 0 && section.items.length > 0);
  const updatedText = [...doc.querySelectorAll('p.small')]
    .map((node) => normalizeText(node.textContent))
    .find((value) => value.startsWith('Updated:'));
  const updatedAt = toIsoFromSlashDate(updatedText?.replace(/^Updated:\s*/, '') ?? null);

  return {
    hasCv: !noCv && sections.length > 0,
    sections,
    updatedAt,
  };
}

function summarizeCvSections(sections: EuParliamentCvSection[]) {
  const interesting = sections
    .filter((section) =>
      /education|professional career|national political career|international political career/i.test(section.title),
    )
    .slice(0, 2)
    .map((section) => {
      const items = section.items.slice(0, 2).join('; ');
      return items ? `${section.title}: ${items}.` : null;
    })
    .filter((value): value is string => Boolean(value));

  return interesting;
}

export function buildEuParliamentBiography(
  name: string,
  home: EuParliamentHomeProfile,
  cv: EuParliamentCvProfile,
) {
  const sentences: string[] = [];
  const intro = [
    `${name} is ${home.politicalRole ? `a ${home.politicalRole.toLowerCase()}` : 'a member'} of the European Parliament`,
    home.countryName ? `from ${home.countryName}` : null,
    home.nationalParty ? `representing ${home.nationalParty}` : null,
    home.politicalGroup ? `in the ${home.politicalGroup}` : null,
  ].filter((value): value is string => Boolean(value));

  if (intro.length > 0) sentences.push(`${intro.join(', ')}.`);
  if (home.birthDate || home.birthPlace) {
    const birthBits = [
      home.birthDate ? `born on ${home.birthDate}` : null,
      home.birthPlace ? `in ${home.birthPlace}` : null,
    ].filter((value): value is string => Boolean(value));
    if (birthBits.length > 0) sentences.push(`The official EP profile lists ${birthBits.join(' ')}.`);
  }
  if (home.statuses.length > 0) {
    sentences.push(`Current parliamentary roles listed on the EP profile include ${home.statuses.slice(0, 2).join('; ')}.`);
  }

  if (cv.hasCv) {
    sentences.push(...summarizeCvSections(cv.sections));
  }

  const biography = normalizeText(sentences.join(' '));
  if (!biography) return null;
  return biography.length > 1600 ? `${biography.slice(0, 1597).trimEnd()}...` : biography;
}

function buildSourceAttribution(
  existing: Record<string, unknown> | null | undefined,
  sourceUrl: string,
  externalId: string | null,
  fieldNames: string[],
  cv: EuParliamentCvProfile,
  now: string,
) {
  const next: Record<string, unknown> = existing && typeof existing === 'object' && !Array.isArray(existing)
    ? structuredClone(existing)
    : {};
  const sourceMeta = {
    source_type: 'eu_parliament',
    source_label: EP_PROFILE_SOURCE_LABEL,
    source_url: sourceUrl,
    dataset_url: EP_PROFILE_DATASET_URL,
    record_id: externalId,
    fetched_at: now,
  };

  next._eu_parliament_profile = {
    ...sourceMeta,
    cv_updated_at: cv.updatedAt,
    has_cv: cv.hasCv,
  };

  for (const fieldName of fieldNames) {
    next[fieldName] = sourceMeta;
  }

  return next;
}

export function buildEuParliamentProfileUpdate(
  existing: ExistingEuParliamentRow,
  biography: string | null,
  home: EuParliamentHomeProfile,
  cv: EuParliamentCvProfile,
  now: string = new Date().toISOString(),
): EuParliamentProfileUpdatePlan | null {
  const payload: Record<string, unknown> = {};
  const changedFields: string[] = [];
  const sourceUrl = home.canonicalUrl || existing.source_url || '';

  const assignIfMissing = (field: keyof ExistingEuParliamentRow | 'source_url', value: unknown, options?: { alwaysReplace?: boolean }) => {
    if (value === null || value === undefined || value === '') return;
    const currentValue = (existing as Record<string, unknown>)[field] ?? null;
    const shouldReplace = options?.alwaysReplace === true;
    const isMissing = currentValue === null || currentValue === undefined || currentValue === '';
    if (!shouldReplace && !isMissing) return;
    if (JSON.stringify(currentValue) === JSON.stringify(value)) return;
    payload[field] = value;
    changedFields.push(field);
  };

  assignIfMissing('source_url', sourceUrl, { alwaysReplace: true });
  assignIfMissing('biography', biography);
  assignIfMissing('birth_year', home.birthYear);
  const existingTwitter = normalizeText(existing.twitter_handle);
  if (home.twitterHandle) {
    if (!existingTwitter || isUrlLikeTwitterHandle(existingTwitter)) {
      assignIfMissing('twitter_handle', home.twitterHandle, { alwaysReplace: true });
    }
  }

  const hasSignal = Boolean(
    biography ||
    home.birthYear ||
    home.twitterHandle ||
    sourceUrl,
  );
  if (!existing.enriched_at && hasSignal) {
    payload.enriched_at = now;
    changedFields.push('enriched_at');
  }

  if (changedFields.length === 0) return null;

  payload.source_attribution = buildSourceAttribution(
    existing.source_attribution,
    sourceUrl,
    existing.external_id,
    changedFields,
    cv,
    now,
  );
  changedFields.push('source_attribution');

  return {
    biography,
    changedFields,
    payload,
  };
}
