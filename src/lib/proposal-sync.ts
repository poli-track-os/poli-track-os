import type { SupabaseClient } from '@supabase/supabase-js';

export async function fetchExistingProposalIdsBySourceUrl(
  supabase: SupabaseClient,
  sourceUrls: string[],
  chunkSize = 25,
) {
  const existingByUrl = new Map<string, string>();
  const uniqueSourceUrls = [...new Set(sourceUrls.filter(Boolean))];

  for (let index = 0; index < uniqueSourceUrls.length; index += chunkSize) {
    const chunk = uniqueSourceUrls.slice(index, index + chunkSize);
    const { data, error } = await supabase
      .from('proposals')
      .select('id, source_url')
      .in('source_url', chunk);

    if (error) throw error;

    for (const row of data ?? []) {
      if (row.source_url) existingByUrl.set(row.source_url, row.id);
    }
  }

  return existingByUrl;
}

export type ProposalVoteEventInput = {
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
};

export type ProposalVoteGroupInput = {
  source_group_id: string;
  group_type: string;
  group_name: string;
  for_count: number | null;
  against_count: number | null;
  abstain_count: number | null;
  absent_count: number | null;
  source_payload: Record<string, unknown>;
};

export type ProposalVoteRecordInput = {
  source_record_id: string;
  politician_id: string | null;
  voter_name: string;
  party: string | null;
  vote_position: 'for' | 'against' | 'abstain' | 'absent' | 'paired' | 'other';
  confidence: number | null;
  source_payload: Record<string, unknown>;
};

export type ProposalVoteBundleInput = {
  proposal_id: string;
  event: ProposalVoteEventInput;
  groups?: ProposalVoteGroupInput[];
  records?: ProposalVoteRecordInput[];
};

/**
 * Persist structured vote bundles for a proposal in one transaction-like flow.
 *
 * Args:
 *   supabase: Supabase client used for writes.
 *   bundles: Vote bundles to upsert, one per source event.
 *
 * Returns:
 *   Object with count of inserted/updated vote events.
 */
export async function upsertProposalVoteBundles(
  supabase: SupabaseClient,
  bundles: ProposalVoteBundleInput[],
) {
  let eventsUpserted = 0;
  for (const bundle of bundles) {
    const { data: eventRow, error: eventError } = await supabase
      .from('proposal_vote_events')
      .upsert({
        proposal_id: bundle.proposal_id,
        source_event_id: bundle.event.source_event_id,
        chamber: bundle.event.chamber,
        vote_method: bundle.event.vote_method,
        happened_at: bundle.event.happened_at,
        result: bundle.event.result,
        for_count: bundle.event.for_count,
        against_count: bundle.event.against_count,
        abstain_count: bundle.event.abstain_count,
        absent_count: bundle.event.absent_count,
        total_eligible: bundle.event.total_eligible,
        total_cast: bundle.event.total_cast,
        quorum_required: bundle.event.quorum_required,
        quorum_reached: bundle.event.quorum_reached,
        source_url: bundle.event.source_url,
        source_payload: bundle.event.source_payload,
      }, { onConflict: 'proposal_id,source_event_id' })
      .select('id')
      .single();
    if (eventError) throw eventError;
    eventsUpserted += 1;

    const eventId = eventRow.id as string;
    const groups = bundle.groups ?? [];
    if (groups.length > 0) {
      const { error } = await supabase
        .from('proposal_vote_groups')
        .upsert(groups.map((group) => ({
          proposal_id: bundle.proposal_id,
          event_id: eventId,
          source_group_id: group.source_group_id,
          group_type: group.group_type,
          group_name: group.group_name,
          for_count: group.for_count,
          against_count: group.against_count,
          abstain_count: group.abstain_count,
          absent_count: group.absent_count,
          source_payload: group.source_payload,
        })), { onConflict: 'event_id,source_group_id' });
      if (error) throw error;
    }

    const records = bundle.records ?? [];
    if (records.length > 0) {
      const { error } = await supabase
        .from('proposal_vote_records')
        .upsert(records.map((record) => ({
          proposal_id: bundle.proposal_id,
          event_id: eventId,
          source_record_id: record.source_record_id,
          politician_id: record.politician_id,
          voter_name: record.voter_name,
          party: record.party,
          vote_position: record.vote_position,
          confidence: record.confidence,
          source_payload: record.source_payload,
        })), { onConflict: 'event_id,source_record_id' });
      if (error) throw error;
    }
  }
  return { eventsUpserted };
}
