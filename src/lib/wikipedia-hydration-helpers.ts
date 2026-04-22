// Pure helpers for backfill-wikipedia-links. Lives in src/lib/ so vitest
// can verify them without typechecking the CLI script (which imports the
// Supabase client and trips on overload inference).

const HYDRATION_SOURCE_TYPE = 'wikipedia';
const HYDRATION_SOURCE_LABEL = 'Wikipedia REST summary';

export type PoliticianRow = {
  id: string;
  name: string;
  source_url: string | null;
  wikipedia_url: string | null;
  wikipedia_summary: string | null;
  biography: string | null;
  wikipedia_image_url: string | null;
  wikipedia_data: Record<string, unknown> | null;
  enriched_at: string | null;
  photo_url: string | null;
  source_attribution: Record<string, unknown> | null;
};

export type HydrationPlan = {
  politicianId: string;
  name: string;
  wikipediaUrl: string;
  changedFields: string[];
  payload: Record<string, unknown>;
};

export type WikiSummary = {
  title?: string;
  extract?: string;
  description?: string;
  originalimage?: { source?: string };
  thumbnail?: { source?: string };
  content_urls?: { desktop?: { page?: string } };
};

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function buildSourceAttribution(
  existing: Record<string, unknown> | null | undefined,
  wikipediaUrl: string,
  datasetUrl: string,
  title: string,
  fieldNames: string[],
) {
  const next: Record<string, unknown> = isRecord(existing) ? structuredClone(existing) : {};
  const fetchedAt = new Date().toISOString();
  const sourceMeta = {
    source_type: HYDRATION_SOURCE_TYPE,
    source_label: HYDRATION_SOURCE_LABEL,
    source_url: wikipediaUrl,
    dataset_url: datasetUrl,
    record_id: `wikipedia:${title}`,
    fetched_at: fetchedAt,
  };

  next._wikipedia_summary = {
    ...sourceMeta,
    title,
  };

  for (const fieldName of fieldNames) {
    next[fieldName] = sourceMeta;
  }

  return next;
}

export function buildHydrationPlan(
  row: PoliticianRow,
  wikipediaUrl: string,
  datasetUrl: string,
  title: string,
  summary: WikiSummary,
): HydrationPlan | null {
  const payload: Record<string, unknown> = {};
  const changedFields: string[] = [];
  const canonicalUrl = summary.content_urls?.desktop?.page || wikipediaUrl;
  const imageUrl = summary.originalimage?.source || summary.thumbnail?.source || null;
  const extract = summary.extract?.trim() || null;
  const description = summary.description?.trim() || null;

  // Strip volatile keys before comparing so the per-run timestamp doesn't
  // make every row look "changed". Otherwise `last_fetched` (which we
  // bump every call) would dominate the diff and force a write on every
  // politician on every run, even when nothing else changed.
  const stripVolatile = (value: unknown): unknown => {
    if (!isRecord(value)) return value;
    const { last_fetched: _ignored, ...rest } = value as Record<string, unknown>;
    return rest;
  };

  const assignIfDifferent = (field: keyof PoliticianRow | 'wikipedia_data', nextValue: unknown) => {
    if (nextValue === null || nextValue === undefined || nextValue === '') return;
    const currentValue = field === 'wikipedia_data' ? row.wikipedia_data : row[field];
    const before = field === 'wikipedia_data' ? stripVolatile(currentValue) : currentValue;
    const after = field === 'wikipedia_data' ? stripVolatile(nextValue) : nextValue;
    if (JSON.stringify(before ?? null) !== JSON.stringify(after)) {
      payload[field] = nextValue;
      changedFields.push(field);
    }
  };

  assignIfDifferent('wikipedia_url', canonicalUrl);
  if (!row.wikipedia_summary && extract) assignIfDifferent('wikipedia_summary', extract);
  if (!row.biography && extract) assignIfDifferent('biography', extract);
  if (!row.wikipedia_image_url && imageUrl) assignIfDifferent('wikipedia_image_url', imageUrl);
  if (!row.photo_url && imageUrl) assignIfDifferent('photo_url', imageUrl);

  const nextWikipediaData = {
    ...(isRecord(row.wikipedia_data) ? row.wikipedia_data : {}),
    title: summary.title || title,
    description,
    last_fetched: new Date().toISOString(),
  };
  assignIfDifferent('wikipedia_data', nextWikipediaData);

  if (!row.enriched_at) {
    payload.enriched_at = new Date().toISOString();
    changedFields.push('enriched_at');
  }

  if (changedFields.length === 0) return null;

  payload.source_attribution = buildSourceAttribution(
    row.source_attribution,
    canonicalUrl,
    datasetUrl,
    title,
    [...changedFields, 'source_attribution'],
  );
  changedFields.push('source_attribution');

  return {
    politicianId: row.id,
    name: row.name,
    wikipediaUrl: canonicalUrl,
    changedFields,
    payload,
  };
}
