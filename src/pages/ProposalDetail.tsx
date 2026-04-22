import { useParams, Link } from 'react-router-dom';
import SiteHeader from '@/components/SiteHeader';
import SiteFooter from '@/components/SiteFooter';
import { useProposal, useProposalVotes, statusLabels, statusColors } from '@/hooks/use-proposals';
import { ExternalLink } from 'lucide-react';
import { ProvenanceBar } from '@/components/SourceBadge';
import { resolveProposalSourceUrl } from '@/lib/proposal-source-url';

const ProposalDetail = () => {
  const { id } = useParams();
  const { data: proposal, isLoading } = useProposal(id);
  const { data: votes } = useProposalVotes(id);
  const sourceUrl = proposal ? resolveProposalSourceUrl(proposal) : null;

  const latestVote = votes?.latestEvent ?? null;
  const latestRecords = votes?.latestEventRecords ?? [];
  const latestGroups = votes?.latestEventGroups ?? [];

  const partyMatrix = latestRecords.reduce<Record<string, { for: number; against: number; abstain: number; absent: number; total: number }>>((acc, record) => {
    const key = (record.party ?? 'Unknown').trim() || 'Unknown';
    if (!acc[key]) acc[key] = { for: 0, against: 0, abstain: 0, absent: 0, total: 0 };
    if (record.vote_position === 'for') acc[key].for += 1;
    if (record.vote_position === 'against') acc[key].against += 1;
    if (record.vote_position === 'abstain') acc[key].abstain += 1;
    if (record.vote_position === 'absent') acc[key].absent += 1;
    acc[key].total += 1;
    return acc;
  }, {});
  const coalitionSupport = latestGroups
    .filter((group) => ['government', 'coalition', 'majority'].includes(group.group_type.toLowerCase()))
    .reduce((sum, group) => sum + (group.for_count ?? 0), 0);
  const oppositionAgainst = latestGroups
    .filter((group) => ['opposition', 'minority'].includes(group.group_type.toLowerCase()))
    .reduce((sum, group) => sum + (group.against_count ?? 0), 0);

  if (isLoading) {
    return (
      <div className="min-h-screen flex flex-col">
        <SiteHeader />
        <main className="container flex-1 py-8">
          <p className="font-mono text-sm text-muted-foreground">Loading...</p>
        </main>
        <SiteFooter />
      </div>
    );
  }

  if (!proposal) {
    return (
      <div className="min-h-screen flex flex-col">
        <SiteHeader />
        <main className="container flex-1 py-8">
          <p className="font-mono text-sm text-muted-foreground">Proposal not found.</p>
          <Link to="/proposals" className="text-accent underline text-sm mt-2 inline-block">
            ← Back to proposals
          </Link>
        </main>
        <SiteFooter />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col">
      <SiteHeader />
      <main className="container flex-1 py-8 max-w-3xl">
        <Link to="/proposals" className="text-accent underline text-xs font-mono mb-4 inline-block">
          ← PROPOSALS
        </Link>

        <div className="brutalist-border-b pb-4 mb-6">
          <div className="flex gap-2 mb-2 flex-wrap">
            <span className={`evidence-tag ${statusColors[proposal.status] || 'bg-muted'}`}>
              {statusLabels[proposal.status] || proposal.status.toUpperCase()}
            </span>
            <span className="evidence-tag">{proposal.proposal_type.toUpperCase()}</span>
            <span className="evidence-tag">{proposal.country_code}</span>
            <span className="evidence-tag">{proposal.jurisdiction.toUpperCase()}</span>
            {proposal.policy_area && (
              <span className="evidence-tag bg-primary/5">{proposal.policy_area.replace(/_/g, ' ').toUpperCase()}</span>
            )}
          </div>
          <h1 className="text-2xl font-extrabold tracking-tight mb-1">{proposal.title}</h1>
          <p className="text-sm font-mono text-muted-foreground">{proposal.official_title}</p>
        </div>

        {/* Summary */}
        {proposal.summary && (
          <section className="mb-6">
            <h2 className="text-xs font-mono font-bold text-muted-foreground mb-2">SUMMARY</h2>
            <p className="text-sm leading-relaxed">{proposal.summary}</p>
            <ProvenanceBar sources={[
              ...(sourceUrl ? [{ label: 'Official source', url: sourceUrl, type: 'official' as const }] : []),
              { label: 'Legislative record', type: 'fact' as const },
            ]} />
          </section>
        )}

        {/* Key details */}
        <section className="brutalist-border p-4 mb-6">
          <h2 className="text-xs font-mono font-bold mb-3">KEY DETAILS</h2>
          <div className="space-y-2 font-mono text-xs">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Country</span>
              <span className="font-bold">{proposal.country_name} ({proposal.country_code})</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Jurisdiction</span>
              <span>{proposal.jurisdiction}</span>
            </div>
            {proposal.vote_date && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Vote date</span>
                <span className="font-bold">{proposal.vote_date}</span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-muted-foreground">Submitted</span>
              <span>{proposal.submitted_date}</span>
            </div>
            {proposal.sponsors.length > 0 && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Sponsors</span>
                <span className="text-right max-w-[300px]">{proposal.sponsors.join(', ')}</span>
              </div>
            )}
            {proposal.policy_area && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Policy area</span>
                <span className="capitalize">{proposal.policy_area.replace(/_/g, ' ')}</span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-muted-foreground">Evidence packets</span>
              <span className="font-bold">{proposal.evidence_count}</span>
            </div>
          </div>
        </section>

        {votes && votes.events.length > 0 && (
          <section className="mb-6 space-y-4">
            <div className="brutalist-border p-4">
              <h2 className="text-xs font-mono font-bold mb-3">LATEST VOTE</h2>
              {latestVote && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 font-mono text-xs">
                  <div>
                    <div className="text-muted-foreground">Result</div>
                    <div className="font-bold">{latestVote.result ?? 'unknown'}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">For / Against</div>
                    <div className="font-bold">{latestVote.for_count ?? '-'} / {latestVote.against_count ?? '-'}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">Abstain / Absent</div>
                    <div>{latestVote.abstain_count ?? '-'} / {latestVote.absent_count ?? '-'}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">Attendance</div>
                    <div>{votes.integrity.attendanceRate === null ? '-' : `${Math.round(votes.integrity.attendanceRate * 100)}%`}</div>
                  </div>
                </div>
              )}
            </div>

            <div className="brutalist-border p-4">
              <h2 className="text-xs font-mono font-bold mb-3">VOTE TIMELINE</h2>
              <div className="space-y-2">
                {votes.events.map((event) => (
                  <div key={event.id} className="flex items-center justify-between font-mono text-xs border-b border-border pb-2">
                    <span>{event.happened_at ? new Date(event.happened_at).toLocaleDateString() : 'Date unknown'}</span>
                    <span>{event.chamber ?? 'Chamber unknown'}</span>
                    <span>{event.result ?? 'Result unknown'}</span>
                    <span>{event.for_count ?? '-'} / {event.against_count ?? '-'}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="brutalist-border p-4">
              <h2 className="text-xs font-mono font-bold mb-3">PARTY SPLIT MATRIX</h2>
              <div className="overflow-x-auto">
                <table className="w-full text-xs font-mono">
                  <thead>
                    <tr className="text-left text-muted-foreground">
                      <th className="py-1 pr-2">Party</th>
                      <th className="py-1 pr-2">For</th>
                      <th className="py-1 pr-2">Against</th>
                      <th className="py-1 pr-2">Abstain</th>
                      <th className="py-1 pr-2">Absent</th>
                      <th className="py-1 pr-2">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(partyMatrix)
                      .sort((a, b) => b[1].total - a[1].total)
                      .map(([party, counts]) => (
                        <tr key={party} className="border-t border-border">
                          <td className="py-1 pr-2 font-bold">{party}</td>
                          <td className="py-1 pr-2">{counts.for}</td>
                          <td className="py-1 pr-2">{counts.against}</td>
                          <td className="py-1 pr-2">{counts.abstain}</td>
                          <td className="py-1 pr-2">{counts.absent}</td>
                          <td className="py-1 pr-2">{counts.total}</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="brutalist-border p-4">
              <h2 className="text-xs font-mono font-bold mb-3">ROLL CALL</h2>
              <div className="max-h-72 overflow-auto space-y-1">
                {latestRecords.map((record) => (
                  <div key={record.id} className="grid grid-cols-[1fr_auto_auto] gap-2 border-b border-border pb-1 text-xs font-mono">
                    <span className="truncate">{record.voter_name}</span>
                    <span className="text-muted-foreground">{record.party ?? 'Unknown'}</span>
                    <span className="font-bold uppercase">{record.vote_position}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="brutalist-border p-4">
              <h2 className="text-xs font-mono font-bold mb-3">COALITION / OPPOSITION</h2>
              <div className="grid grid-cols-2 gap-3 text-xs font-mono">
                <div>
                  <div className="text-muted-foreground">Coalition support</div>
                  <div className="font-bold">{coalitionSupport}</div>
                </div>
                <div>
                  <div className="text-muted-foreground">Opposition against</div>
                  <div className="font-bold">{oppositionAgainst}</div>
                </div>
                <div>
                  <div className="text-muted-foreground">Rebellion flags</div>
                  <div>{votes.integrity.rebellionCount}</div>
                </div>
                <div>
                  <div className="text-muted-foreground">Data integrity issues</div>
                  <div>{votes.integrity.issues.length}</div>
                </div>
              </div>
              {votes.integrity.issues.length > 0 && (
                <div className="mt-3 text-xs font-mono space-y-1">
                  {votes.integrity.issues.map((issue) => (
                    <div key={issue} className="text-destructive">{issue}</div>
                  ))}
                </div>
              )}
            </div>
          </section>
        )}

        {/* Affected laws */}
        {proposal.affected_laws.length > 0 && (
          <section className="mb-6">
            <h2 className="text-xs font-mono font-bold text-muted-foreground mb-2">AFFECTED LAWS</h2>
            <div className="space-y-1">
              {proposal.affected_laws.map((law) => (
                <div key={law} className="font-mono text-sm brutalist-border px-3 py-1.5 bg-secondary">
                  {law}
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Source link */}
        {sourceUrl && (
          <section className="mb-6">
            <a href={sourceUrl} target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs font-mono text-accent hover:underline">
              <ExternalLink className="w-3 h-3" /> View official source
            </a>
          </section>
        )}

        {/* Revision info */}
        <section className="brutalist-border-t pt-4 mt-8">
          <div className="font-mono text-xs text-muted-foreground flex flex-wrap gap-4">
            <span>id: {proposal.id.slice(0, 8)}</span>
            <span>sources: {proposal.evidence_count}</span>
            <span>status: {proposal.status}</span>
            <span>updated: {new Date(proposal.updated_at).toLocaleDateString()}</span>
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
};

export default ProposalDetail;
