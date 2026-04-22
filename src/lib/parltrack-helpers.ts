// Pure helpers for Parltrack dump ingestion. No I/O, no Supabase — just
// parsing and row-shape construction. Vitest-testable under Node + Vite.
//
// Parltrack dump format: a JSON array serialized with one record per
// (usually-tall) line:
//   Line 1: "[{...}"             first record prefixed with "["
//   Line 2..n-1: ",{...}"        subsequent records prefixed with ","
//   Line n: "]"                  just the closing bracket
//
// Some older dumps have "[" alone on line 1, so handle both cases.
// To parse streaming, strip leading "[", ",", or whitespace and parse
// whatever is left as JSON. If the line is empty or just "]"/"[", skip.
//
// License: Parltrack data is ODBL v1.0. Attribution required — the repo's
// INGESTION.md carries the credit.

export function parseParltrackLine(raw: string): unknown | null {
  const line = raw.trim();
  if (!line || line === '[' || line === ']') return null;
  // Strip a leading "[" or "," if present.
  let cleaned = line;
  if (cleaned.startsWith('[')) cleaned = cleaned.slice(1);
  else if (cleaned.startsWith(',')) cleaned = cleaned.slice(1);
  cleaned = cleaned.trim();
  if (!cleaned) return null;
  return JSON.parse(cleaned);
}

// Parltrack MEP record shape. A real MEP record has many more fields; we
// only pull what we actually use. Everything else can be accessed via
// the raw Parltrack record if needed later.
export interface ParltrackMep {
  UserID?: number | string;
  Name?: { full?: string; familylc?: string; aliases?: string[] };
  Gender?: string;
  Birth?: { date?: string; place?: string };
  Photo?: string;
  Constituencies?: Array<{
    country?: string;
    party?: string;
    end?: string;
    start?: string;
    role?: string;
    term?: number;
  }>;
  Groups?: Array<{
    Organization?: string;
    groupid?: string | string[];
    role?: string;
    country?: string;
    party?: string;
    end?: string;
    start?: string;
  }>;
  Twitter?: string[] | string;
  Homepage?: string[] | string;
  Mail?: string[] | string;
  active?: boolean;
  changes?: Record<string, unknown>;
}

// Parltrack activity record shape. Each record groups activity entries
// keyed by type (REPORT, OPINION, MOTION, QUESTION, SPEECH, ...).
// Entries include `ts` (timestamp), `committee`, `title`, `reference`, etc.
export interface ParltrackActivity {
  mep_id?: number | string;
  REPORT?: ParltrackActivityEntry[];
  'REPORT-SHADOW'?: ParltrackActivityEntry[];
  OPINION?: ParltrackActivityEntry[];
  'OPINION-SHADOW'?: ParltrackActivityEntry[];
  MOTION?: ParltrackActivityEntry[];
  QUESTION?: ParltrackActivityEntry[];
  SPEECH?: ParltrackActivityEntry[];
  [otherKey: string]: unknown;
}

export interface ParltrackActivityEntry {
  ts?: string;
  url?: string;
  title?: string;
  dossiers?: string[];
  committee?: string[] | string;
  reference?: string;
  term?: number;
  updated?: string;
}

export interface ParltrackDossierProcedure {
  reference?: string;
  title?: string;
  subject?: string[];
  stage_reached?: string;
  type?: string;
  dossier_of_the_committee?: string;
  final?: { title?: string; url?: string };
}

export interface ParltrackDossierCommitteeMember {
  name?: string;
  mepref?: string;
  group?: string;
}

export interface ParltrackDossierCommittee {
  committee?: string;
  type?: string;
  rapporteur?: ParltrackDossierCommitteeMember[];
  shadows?: ParltrackDossierCommitteeMember[];
  date?: string;
}

export interface ParltrackDossier {
  procedure?: ParltrackDossierProcedure;
  committees?: ParltrackDossierCommittee[];
  activities?: Array<{ type?: string; date?: string; body?: string }>;
  docs?: Array<{ type?: string; url?: string; title?: string; date?: string }>;
  votes?: ParltrackVote[];
  [key: string]: unknown;
}

const DOSSIER_STAGE_MAP: Record<string, string> = {
  'adopted': 'adopted',
  'completed': 'adopted',
  'rejected': 'rejected',
  'withdrawn': 'withdrawn',
  'lapsed': 'withdrawn',
};

const DOSSIER_SUBJECT_TO_AREA: Array<[RegExp, string]> = [
  [/^3\.(?:40|50)/,  'energy'],
  [/^2\.80/,         'health'],
  [/^7\.10/,         'migration'],
  [/^3\.70|^6\.10/,  'defence'],
  [/^3\.30|^4\.60/,  'digital'],
  [/^3\.10/,         'agriculture'],
  [/^2\.(?:10|70)/,  'trade'],
  [/^2\.50|^2\.60/,  'finance'],
  [/^3\.20/,         'transport'],
  [/^3\.60|^3\.70/,  'environment'],
  [/^4\.15/,         'labour'],
  [/^7\.40/,         'justice'],
];

function mapDossierPolicyArea(subjects: string[]): string | null {
  for (const subj of subjects) {
    for (const [re, area] of DOSSIER_SUBJECT_TO_AREA) {
      if (re.test(subj)) return area;
    }
  }
  return null;
}

function mapDossierStatus(stageReached: string): string {
  const lower = stageReached.toLowerCase();
  for (const [key, value] of Object.entries(DOSSIER_STAGE_MAP)) {
    if (lower.includes(key)) return value;
  }
  if (lower.includes('awaiting')) return 'parliamentary_deliberation';
  if (lower.includes('committee')) return 'committee';
  return 'committee';
}

/**
 * Build a proposals-table row from a Parltrack dossier record.
 *
 * Returns null if the dossier lacks a reference or title.
 *
 * @param dossier - Raw Parltrack dossier record.
 * @returns Proposal row suitable for supabase upsert, or null.
 */
export function buildProposalFromDossier(dossier: ParltrackDossier): {
  title: string;
  official_title: string;
  status: string;
  proposal_type: string;
  jurisdiction: string;
  country_code: string;
  country_name: string;
  vote_date: string | null;
  submitted_date: string;
  sponsors: string[];
  affected_laws: string[];
  evidence_count: number;
  summary: string;
  policy_area: string | null;
  source_url: string;
  data_source: string;
} | null {
  const proc = dossier.procedure;
  if (!proc?.reference || !proc?.title) return null;

  const responsible = (dossier.committees ?? []).find(
    (c) => c.type?.toLowerCase().includes('responsible'),
  );
  const sponsors: string[] = [];
  for (const r of responsible?.rapporteur ?? []) {
    const label = [r.name, r.group ? `(${r.group})` : null].filter(Boolean).join(' ');
    if (label) sponsors.push(label);
  }

  const dates = (dossier.activities ?? [])
    .map((a) => a.date)
    .filter((d): d is string => !!d)
    .sort();
  const submittedDate = dates[0] ?? new Date().toISOString().slice(0, 10);
  const lastDate = dates.at(-1) ?? null;

  return {
    title: proc.title.slice(0, 500),
    official_title: proc.title,
    status: mapDossierStatus(proc.stage_reached ?? ''),
    proposal_type: proc.type?.toLowerCase().includes('budget') ? 'budget'
      : proc.type?.toLowerCase().includes('consent') ? 'resolution' : 'bill',
    jurisdiction: 'eu',
    country_code: 'EU',
    country_name: 'European Union',
    vote_date: lastDate,
    submitted_date: submittedDate,
    sponsors,
    affected_laws: [],
    evidence_count: 1,
    summary: proc.title,
    policy_area: mapDossierPolicyArea(proc.subject ?? []),
    source_url: `https://oeil.secure.europarl.europa.eu/oeil/popups/ficheprocedure.do?reference=${encodeURIComponent(proc.reference)}`,
    data_source: 'parltrack',
  };
}

export interface ParltrackVote {
  ts?: string;
  url?: string;
  title?: string;
  rcv_id?: number | string;
  reference?: string;
  dossier?: string;
  report?: string;
  votes?: {
    '+'?: { total?: number; groups?: Record<string, Array<{ id?: number | string; name?: string }>> };
    '-'?: { total?: number; groups?: Record<string, Array<{ id?: number | string; name?: string }>> };
    '0'?: { total?: number; groups?: Record<string, Array<{ id?: number | string; name?: string }>> };
  };
}

/**
 * Build normalized vote bundles from a Parltrack dossier vote list.
 *
 * Args:
 *   dossier: Raw Parltrack dossier record.
 *
 * Returns:
 *   Normalized vote bundles ready for proposal_vote_* upserts.
 */
export function buildVoteBundlesFromDossier(dossier: ParltrackDossier): Array<{
  source_event_id: string;
  chamber: string | null;
  vote_method: string | null;
  happened_at: string | null;
  result: string | null;
  for_count: number | null;
  against_count: number | null;
  abstain_count: number | null;
  absent_count: number | null;
  total_eligible: number | null;
  total_cast: number | null;
  quorum_required: number | null;
  quorum_reached: boolean | null;
  source_url: string | null;
  source_payload: Record<string, unknown>;
  groups: Array<{
    source_group_id: string;
    group_type: string;
    group_name: string;
    for_count: number | null;
    against_count: number | null;
    abstain_count: number | null;
    absent_count: number | null;
    source_payload: Record<string, unknown>;
  }>;
  records: Array<{
    source_record_id: string;
    politician_id: string | null;
    voter_name: string;
    party: string | null;
    vote_position: 'for' | 'against' | 'abstain' | 'absent' | 'paired' | 'other';
    confidence: number | null;
    source_payload: Record<string, unknown>;
  }>;
}> {
  const votes = dossier.votes ?? [];
  const normalizeMember = (member: { id?: number | string; name?: string }, fallbackId: string) => ({
    source_record_id: String(member.id ?? member.name ?? fallbackId),
    politician_id: null,
    voter_name: member.name ?? 'Unknown',
    party: null,
    vote_position: 'other' as const,
    confidence: member.name ? 1 : 0.5,
    source_payload: member as Record<string, unknown>,
  });
  return votes.map((vote, voteIndex) => {
    const plus = vote.votes?.['+'];
    const minus = vote.votes?.['-'];
    const zero = vote.votes?.['0'];
    const castTotal = (plus?.total ?? 0) + (minus?.total ?? 0) + (zero?.total ?? 0);
    const sourceEventId = String(vote.rcv_id ?? vote.reference ?? `${vote.ts ?? 'unknown'}-${voteIndex}`);
    const groups = new Map<string, {
      source_group_id: string;
      group_type: string;
      group_name: string;
      for_count: number;
      against_count: number;
      abstain_count: number;
      absent_count: number;
      source_payload: Record<string, unknown>;
    }>();
    const records: Array<{
      source_record_id: string;
      politician_id: string | null;
      voter_name: string;
      party: string | null;
      vote_position: 'for' | 'against' | 'abstain' | 'absent' | 'paired' | 'other';
      confidence: number | null;
      source_payload: Record<string, unknown>;
    }> = [];

    const ingestByGroup = (
      groupMap: Record<string, Array<{ id?: number | string; name?: string }>> | undefined,
      position: 'for' | 'against' | 'abstain',
    ) => {
      for (const [groupName, members] of Object.entries(groupMap ?? {})) {
        const existing = groups.get(groupName) ?? {
          source_group_id: `${sourceEventId}-${groupName}`,
          group_type: 'party',
          group_name: groupName,
          for_count: 0,
          against_count: 0,
          abstain_count: 0,
          absent_count: 0,
          source_payload: { groupName },
        };
        if (position === 'for') existing.for_count += members.length;
        if (position === 'against') existing.against_count += members.length;
        if (position === 'abstain') existing.abstain_count += members.length;
        groups.set(groupName, existing);
        for (let memberIndex = 0; memberIndex < members.length; memberIndex += 1) {
          const member = members[memberIndex];
          const base = normalizeMember(member, `${sourceEventId}-${groupName}-${position}-${memberIndex}`);
          records.push({ ...base, vote_position: position, party: groupName, source_record_id: `${base.source_record_id}-${position}` });
        }
      }
    };

    ingestByGroup(plus?.groups, 'for');
    ingestByGroup(minus?.groups, 'against');
    ingestByGroup(zero?.groups, 'abstain');

    return {
      source_event_id: sourceEventId,
      chamber: 'European Parliament',
      vote_method: vote.rcv_id ? 'roll_call' : 'aggregate',
      happened_at: vote.ts ? normalizeTimestamp(vote.ts) : null,
      result: null,
      for_count: plus?.total ?? null,
      against_count: minus?.total ?? null,
      abstain_count: zero?.total ?? null,
      absent_count: null,
      total_eligible: null,
      total_cast: castTotal > 0 ? castTotal : null,
      quorum_required: null,
      quorum_reached: null,
      source_url: vote.url ?? null,
      source_payload: vote as Record<string, unknown>,
      groups: [...groups.values()],
      records,
    };
  });
}

// Build a political_events row from a Parltrack activity entry.
// Used for REPORT / OPINION / MOTION / QUESTION / SPEECH entries.
// Returns null when the entry is too empty to write.
export function buildEventRowFromActivity(
  politicianId: string,
  mepExternalId: string,
  category: string,
  entry: ParltrackActivityEntry,
): {
  politician_id: string;
  event_type: 'legislation_sponsored' | 'speech' | 'public_statement';
  title: string;
  description: string;
  source: 'parliamentary_record';
  source_url: string;
  event_timestamp: string;
  valid_from: string;
  raw_data: Record<string, unknown>;
  evidence_count: number;
  trust_level: number;
  entities: string[];
} | null {
  if (!entry.title && !entry.reference) return null;

  const title = [entry.reference, entry.title].filter(Boolean).join(': ').slice(0, 240);
  const sourceUrl = entry.url || `https://parltrack.org/mep/${mepExternalId}#${category}:${entry.reference || entry.title || ''}`;
  const rawTs = entry.ts || entry.updated || null;
  const ts = rawTs ? normalizeTimestamp(rawTs) : STABLE_UNKNOWN_TIMESTAMP;

  let eventType: 'legislation_sponsored' | 'speech' | 'public_statement' = 'legislation_sponsored';
  if (category === 'SPEECH') eventType = 'speech';
  else if (category === 'QUESTION') eventType = 'public_statement';

  const committee = Array.isArray(entry.committee) ? entry.committee.join(', ') : entry.committee || null;
  const description = [
    `Parltrack ${category}`,
    committee ? `committee: ${committee}` : null,
    entry.reference ? `ref: ${entry.reference}` : null,
    entry.dossiers && entry.dossiers.length ? `dossiers: ${entry.dossiers.slice(0, 3).join(', ')}` : null,
  ].filter(Boolean).join(' · ');

  return {
    politician_id: politicianId,
    event_type: eventType,
    title,
    description,
    source: 'parliamentary_record',
    source_url: sourceUrl,
    event_timestamp: ts,
    valid_from: ts,
    raw_data: { category, committee, reference: entry.reference, dossiers: entry.dossiers, term: entry.term },
    evidence_count: 1,
    trust_level: 1,
    entities: committee ? [`#${committee}`] : [],
  };
}

export const STABLE_UNKNOWN_TIMESTAMP = '1970-01-01T00:00:00Z';

export function normalizeTimestamp(raw: string): string {
  // Parltrack uses various formats: "2024-01-15", "2024-01-15T14:30:00",
  // "2024-01-15 14:30:00+02:00". Convert to ISO UTC.
  const trimmed = raw.trim();
  if (!trimmed) return STABLE_UNKNOWN_TIMESTAMP;
  // Accept YYYY-MM-DD as midnight UTC.
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return `${trimmed}T00:00:00Z`;
  const d = new Date(trimmed);
  if (Number.isNaN(d.getTime())) return STABLE_UNKNOWN_TIMESTAMP;
  return d.toISOString();
}

// Flatten an activity record into a sequence of category+entry pairs.
export function* iterateActivityEntries(activity: ParltrackActivity): Generator<{
  category: string;
  entry: ParltrackActivityEntry;
}> {
  const interesting = ['REPORT', 'REPORT-SHADOW', 'OPINION', 'OPINION-SHADOW', 'MOTION', 'QUESTION', 'SPEECH'];
  for (const cat of interesting) {
    const arr = (activity as unknown as Record<string, unknown>)[cat];
    if (!Array.isArray(arr)) continue;
    for (const entry of arr) {
      if (entry && typeof entry === 'object') {
        yield { category: cat, entry: entry as ParltrackActivityEntry };
      }
    }
  }
}

// Extract the canonical party/group history from a Parltrack MEP record
// as claims. Each Group entry becomes one {key:'party', value:<label>, valid_from, valid_to}.
export function extractPartyHistory(mep: ParltrackMep): Array<{
  key: 'party' | 'political_group' | 'role';
  value: string;
  valid_from: string | null;
  valid_to: string | null;
}> {
  const out: Array<{ key: 'party' | 'political_group' | 'role'; value: string; valid_from: string | null; valid_to: string | null }> = [];
  for (const group of mep.Groups ?? []) {
    if (group.Organization) {
      out.push({
        key: 'political_group',
        value: group.Organization,
        valid_from: group.start ? normalizeTimestamp(group.start) : null,
        valid_to: group.end ? normalizeTimestamp(group.end) : null,
      });
    }
    if (group.role) {
      out.push({
        key: 'role',
        value: group.role,
        valid_from: group.start ? normalizeTimestamp(group.start) : null,
        valid_to: group.end ? normalizeTimestamp(group.end) : null,
      });
    }
  }
  for (const constituency of mep.Constituencies ?? []) {
    if (constituency.party) {
      out.push({
        key: 'party',
        value: constituency.party,
        valid_from: constituency.start ? normalizeTimestamp(constituency.start) : null,
        valid_to: constituency.end ? normalizeTimestamp(constituency.end) : null,
      });
    }
  }
  return out;
}
