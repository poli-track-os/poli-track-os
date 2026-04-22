/**
 * Pure helpers for ingesting Sweden Riksdag propositions.
 * No I/O, no Supabase.
 */

export interface RiksdagDocument {
  dok_id?: string;
  titel?: string;
  datum?: string;
  rm?: string;
  organ?: string;
  summary?: string;
  dokument_url_html?: string;
}

export interface RiksdagDocumentStatusResponse {
  dokumentstatus?: {
    dokument?: {
      rm?: string;
      dok_id?: string;
    };
    dokforslag?: {
      forslag?: Array<{
        behandlas_i?: string;
      }> | {
        behandlas_i?: string;
      };
    };
  };
}

export interface RiksdagVoteringRow {
  rm?: string;
  beteckning?: string;
  punkt?: string;
  votering_id?: string;
  namn?: string;
  parti?: string;
  rost?: string;
  avser?: string;
  systemdatum?: string;
  dok_id?: string;
}

const TITLE_TO_POLICY: Array<[RegExp, string]> = [
  [/energi|el|gas|f[oö]rnybar|k[aä]rn|utsl[aä]pp|klimat|koldioxid/i, 'energy'],
  [/h[aä]lsa|medicin|farmac|vaccin|sjukhus|sjukdom/i, 'health'],
  [/asyl|migration|gr[aä]ns|invandring|flykting/i, 'migration'],
  [/f[oö]rsvar|milit[aä]r|s[aä]kerhet/i, 'defence'],
  [/digital|data|cyber|internet|ai|artificiell intelligens/i, 'digital'],
  [/jordbruk|lantbruk|fiske|livsmedel/i, 'agriculture'],
  [/handel|tull|import|export/i, 'trade'],
  [/finans|bank|skatt|budget|monet/i, 'finance'],
  [/transport|flyg|j[aä]rnv[aä]g|sj[oö]fart|v[aä]g/i, 'transport'],
  [/milj[oö]|biologisk m[aå]ngfald|f[oö]rorening|avfall|vatten|natur/i, 'environment'],
  [/arbete|syssels[aä]ttning|social|pension/i, 'labour'],
  [/justitie|domstol|brott|straff/i, 'justice'],
  [/utbildning|skola|universitet|forskning/i, 'education'],
];

function detectPolicyArea(title: string): string | null {
  for (const [re, area] of TITLE_TO_POLICY) {
    if (re.test(title)) return area;
  }
  return null;
}

/**
 * Build a proposal row from one Riksdag proposition document.
 *
 * @param doc Riksdag document item
 * @returns proposal row or null
 */
export function buildProposalFromRiksdagDocument(doc: RiksdagDocument): {
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
  const title = doc.titel?.replace(/\s+/g, ' ').trim();
  if (!title) return null;
  const sourceUrl = doc.dokument_url_html
    ? `https:${doc.dokument_url_html}`
    : `https://www.riksdagen.se/sv/dokument-lagar/dokument/proposition/${doc.dok_id ?? ''}`;
  return {
    title: title.slice(0, 500),
    official_title: title,
    status: 'consultation',
    proposal_type: 'bill',
    jurisdiction: 'federal',
    country_code: 'SE',
    country_name: 'Sweden',
    vote_date: null,
    submitted_date: (doc.datum || new Date().toISOString().slice(0, 10)).slice(0, 10),
    sponsors: doc.organ ? [doc.organ] : [],
    affected_laws: [],
    evidence_count: 1,
    summary: (doc.summary || title).replace(/\s+/g, ' ').trim().slice(0, 2000),
    policy_area: detectPolicyArea(title),
    source_url: sourceUrl,
    data_source: 'riksdag',
  };
}

/**
 * Extract committee-report code from Riksdag documentstatus payload.
 *
 * Args:
 *   status: Documentstatus API payload.
 *
 * Returns:
 *   Report code like "AU10", or null when unavailable.
 */
export function extractReportCodeFromDocumentStatus(status: RiksdagDocumentStatusResponse): string | null {
  const forslag = status.dokumentstatus?.dokforslag?.forslag;
  const list = Array.isArray(forslag) ? forslag : forslag ? [forslag] : [];
  for (const item of list) {
    const ref = item.behandlas_i?.trim();
    if (!ref) continue;
    const parts = ref.split(':');
    const code = (parts[1] ?? parts[0] ?? '').trim().toUpperCase();
    if (code) return code;
  }
  return null;
}

/**
 * Build vote bundles from Riksdag voteringlista member rows.
 *
 * Args:
 *   rows: Member-level voting rows for one committee report.
 *
 * Returns:
 *   Vote bundle array grouped by votering_id.
 */
export function buildVoteBundlesFromRiksdagRows(rows: RiksdagVoteringRow[]) {
  const byVote = new Map<string, RiksdagVoteringRow[]>();
  for (const row of rows) {
    if (!row.votering_id) continue;
    const group = byVote.get(row.votering_id) ?? [];
    group.push(row);
    byVote.set(row.votering_id, group);
  }
  const toPosition = (value: string | undefined) => {
    const normalized = (value ?? '').trim().toLowerCase();
    if (normalized === 'ja') return 'for' as const;
    if (normalized === 'nej') return 'against' as const;
    if (normalized.startsWith('avst')) return 'abstain' as const;
    if (normalized.startsWith('från') || normalized.startsWith('fran')) return 'absent' as const;
    return 'other' as const;
  };
  const bundles: Array<{
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
  }> = [];
  for (const [voteId, members] of byVote) {
    let forCount = 0;
    let againstCount = 0;
    let abstainCount = 0;
    let absentCount = 0;
    const partyMatrix = new Map<string, { for: number; against: number; abstain: number; absent: number }>();
    const records = members.map((member, index) => {
      const position = toPosition(member.rost);
      if (position === 'for') forCount += 1;
      if (position === 'against') againstCount += 1;
      if (position === 'abstain') abstainCount += 1;
      if (position === 'absent') absentCount += 1;
      const partyName = (member.parti ?? 'Unknown').trim() || 'Unknown';
      const partyRow = partyMatrix.get(partyName) ?? { for: 0, against: 0, abstain: 0, absent: 0 };
      if (position === 'for') partyRow.for += 1;
      if (position === 'against') partyRow.against += 1;
      if (position === 'abstain') partyRow.abstain += 1;
      if (position === 'absent') partyRow.absent += 1;
      partyMatrix.set(partyName, partyRow);
      return {
        source_record_id: `${voteId}-${index}-${member.namn ?? 'unknown'}`,
        politician_id: null,
        voter_name: member.namn ?? 'Unknown',
        party: partyName,
        vote_position: position,
        confidence: member.namn ? 1 : 0.4,
        source_payload: member as Record<string, unknown>,
      };
    });
    const groups = [...partyMatrix.entries()].map(([groupName, counts]) => ({
      source_group_id: `${voteId}-${groupName}`,
      group_type: 'party',
      group_name: groupName,
      for_count: counts.for,
      against_count: counts.against,
      abstain_count: counts.abstain,
      absent_count: counts.absent,
      source_payload: { groupName },
    }));
    const happenedAt = members[0]?.systemdatum ? new Date(members[0].systemdatum.replace(' ', 'T')).toISOString() : null;
    bundles.push({
      source_event_id: voteId,
      chamber: 'Riksdag',
      vote_method: 'roll_call',
      happened_at: happenedAt,
      result: forCount > againstCount ? 'adopted' : 'rejected',
      for_count: forCount,
      against_count: againstCount,
      abstain_count: abstainCount,
      absent_count: absentCount,
      total_eligible: members.length,
      total_cast: forCount + againstCount + abstainCount,
      quorum_required: null,
      quorum_reached: null,
      source_url: `https://data.riksdagen.se/votering/${voteId}`,
      source_payload: { voteId, members: members.length },
      groups,
      records,
    });
  }
  return bundles;
}
