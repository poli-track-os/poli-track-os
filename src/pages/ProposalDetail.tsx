import { useParams, Link } from 'react-router-dom';
import SiteHeader from '@/components/SiteHeader';
import SiteFooter from '@/components/SiteFooter';
import { useProposal, statusLabels, statusColors } from '@/hooks/use-proposals';
import { ExternalLink } from 'lucide-react';
import { ProvenanceBar } from '@/components/SourceBadge';

const ProposalDetail = () => {
  const { id } = useParams();
  const { data: proposal, isLoading } = useProposal(id);

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
              ...(proposal.source_url ? [{ label: 'Official source', url: proposal.source_url, type: 'official' as const }] : []),
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
        {proposal.source_url && (
          <section className="mb-6">
            <a href={proposal.source_url} target="_blank" rel="noopener noreferrer"
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
