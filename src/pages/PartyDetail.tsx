import { Link, useParams } from 'react-router-dom';
import SiteHeader from '@/components/SiteHeader';
import SiteFooter from '@/components/SiteFooter';
import ActorCard from '@/components/ActorCard';
import LinkedPersonTextList, { type LinkedPersonEntry } from '@/components/LinkedPersonTextList';
import ProposalCard from '@/components/ProposalCard';
import { useCountryMetadata } from '@/hooks/use-country-metadata';
import { usePartyMetadata } from '@/hooks/use-party-metadata';
import { useCountryStats, usePoliticiansByCountry } from '@/hooks/use-politicians';
import { useProposalsByCountry } from '@/hooks/use-proposals';
import { normalizePersonName } from '@/lib/country-leadership';
import { formatTimestampLabel } from '@/lib/date-display';
import { buildCountryRoute, buildInternalPersonRoute } from '@/lib/internal-links';
import { buildPartyDescription, getTopCommittees, slugifyPartyName } from '@/lib/party-summary';

const PartyDetail = () => {
  const { countryId, partyId } = useParams();
  const countryCode = countryId?.toUpperCase();
  const { data: actors = [], isLoading } = usePoliticiansByCountry(countryId);
  const { data: countryStats = [] } = useCountryStats();
  const country = countryStats.find((entry) => entry.code === countryCode);
  const countryName = country?.name || actors[0]?.canton || countryCode || 'Unknown';
  const countryRoute = buildCountryRoute(countryId) || '/explore';
  const { data: metadata } = useCountryMetadata(countryCode, countryName !== countryCode ? countryName : undefined);
  const metadataUpdatedAt = metadata?.sourceUpdatedAt || metadata?.databaseUpdatedAt;
  const { data: proposals = [] } = useProposalsByCountry(countryCode);

  const partyGroups = Object.entries(
    actors.reduce<Record<string, typeof actors>>((groups, actor) => {
      const party = actor.party?.trim() || 'Independent / unaligned';
      if (!groups[party]) groups[party] = [];
      groups[party].push(actor);
      return groups;
    }, {}),
  );

  const partyEntry = partyGroups.find(([party]) => slugifyPartyName(party) === partyId);
  const partyName = partyEntry?.[0];
  const partyMembers = partyEntry?.[1] || [];
  const roles = Array.from(new Set(partyMembers.map((member) => member.role).filter(Boolean))).slice(0, 4);
  const topCommittees = getTopCommittees(partyMembers, 4);
  const derivedDescription = partyName ? buildPartyDescription(partyName, countryName, partyMembers) : null;
  const { data: partyMetadata } = usePartyMetadata(partyName, countryName);
  const actorsByNormalizedName = new Map(
    actors.map((actor) => [normalizePersonName(actor.name), actor]),
  );
  const leaderLinks: LinkedPersonEntry[] = (partyMetadata?.leaders || []).map((leader) => {
    const actor = actorsByNormalizedName.get(normalizePersonName(leader.name));
    return {
      name: leader.name,
      href: buildInternalPersonRoute({ actorId: actor?.id, personName: leader.name, countryCode }),
      sourceUrl: leader.url,
    };
  });

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

  if (!partyName) {
    return (
      <div className="min-h-screen flex flex-col">
        <SiteHeader />
        <main className="container flex-1 py-8 max-w-4xl">
          <p className="font-mono text-sm text-muted-foreground">Party not found for this country.</p>
          <Link to={countryRoute} className="text-accent underline text-sm mt-2 inline-block">
            ← Back to country
          </Link>
        </main>
        <SiteFooter />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col">
      <SiteHeader />
      <main className="container flex-1 py-8 max-w-4xl">
        <Link to={countryRoute} className="text-accent underline text-xs font-mono mb-4 inline-block">
          ← {countryCode} COUNTRY PAGE
        </Link>

        <div className="brutalist-border-b pb-4 mb-6">
          <div className="flex flex-col lg:flex-row gap-5 lg:items-start">
            <div className="flex-1 min-w-0">
              <div className="flex gap-2 mb-2 flex-wrap">
                <span className="evidence-tag">{countryCode}</span>
                <span className="evidence-tag">{country?.continent || 'Unknown'}</span>
                <span className="evidence-tag">{partyMembers.length} MEMBERS</span>
              </div>
              <h1 className="text-2xl font-extrabold tracking-tight">{partyName}</h1>
              <p className="text-xs font-mono text-muted-foreground mt-1 uppercase tracking-wide">
                <Link to={countryRoute} className="hover:text-accent">
                  {countryName}
                </Link>
              </p>
              {partyMetadata?.description && (
                <p className="text-xs font-mono text-muted-foreground mt-2 uppercase tracking-wide">
                  {partyMetadata.description}
                </p>
              )}
              {(partyMetadata?.summary || derivedDescription) && (
                <p className="text-sm text-muted-foreground leading-relaxed mt-3 max-w-2xl">
                  {partyMetadata?.summary || derivedDescription}
                </p>
              )}
              <div className="flex gap-2 flex-wrap mt-3">
                {leaderLinks.length > 0 && (
                  <span className="evidence-tag">
                    {leaderLinks.length === 1 ? 'LEADER' : 'LEADERS'} · {leaderLinks.map((leader) => leader.name).join(', ')}
                  </span>
                )}
                {partyMetadata?.politicalPosition && (
                  <span className="evidence-tag">POSITION · {partyMetadata.politicalPosition}</span>
                )}
                {metadataUpdatedAt && (
                  <span className="evidence-tag">COUNTRY FACTS · {formatTimestampLabel(metadataUpdatedAt)}</span>
                )}
                {partyMetadata?.wikipediaUrl && (
                  <a
                    href={partyMetadata.wikipediaUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="evidence-tag hover:bg-secondary"
                  >
                    SOURCE · WIKIPEDIA
                  </a>
                )}
              </div>
              {leaderLinks.length > 0 && (
                <p className="text-sm font-mono text-muted-foreground mt-3">
                  {leaderLinks.length === 1 ? 'Leader' : 'Leaders'}:{' '}
                  <LinkedPersonTextList
                    people={leaderLinks}
                    linkAriaLabelPrefix="Party leader"
                    sourceLinkAriaLabelPrefix="Open source for party leader"
                  />
                </p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3 w-full lg:max-w-[320px]">
              <div className="brutalist-border p-3 bg-secondary">
                <div className="font-mono text-[10px] text-muted-foreground">MEMBERS</div>
                <div className="font-mono text-xl font-bold">{partyMembers.length}</div>
              </div>
              <div className="brutalist-border p-3 bg-secondary">
                <div className="font-mono text-[10px] text-muted-foreground">ROLES</div>
                <div className="font-mono text-xl font-bold">{roles.length}</div>
              </div>
              <div className="brutalist-border p-3 bg-secondary">
                <div className="font-mono text-[10px] text-muted-foreground">COMMITTEES</div>
                <div className="font-mono text-xl font-bold">{topCommittees.length}</div>
              </div>
              <div className="brutalist-border p-3 bg-secondary">
                <div className="font-mono text-[10px] text-muted-foreground">COUNTRY PROPOSALS</div>
                <div className="font-mono text-xl font-bold">{proposals.length}</div>
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.45fr)_320px] gap-6">
          <div className="space-y-6">
            <section className="space-y-3">
              <h2 className="text-xs font-mono font-bold text-muted-foreground">MEMBERS</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {partyMembers.map((actor) => (
                  <ActorCard key={actor.id} actor={actor} />
                ))}
              </div>
            </section>

            {proposals.length > 0 && (
              <section className="space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <h2 className="text-xs font-mono font-bold text-muted-foreground">COUNTRY PROPOSALS CONTEXT</h2>
                  <Link to={`/proposals?country=${countryCode}`} className="text-xs font-mono text-accent hover:underline">
                    VIEW ALL →
                  </Link>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {proposals.slice(0, 4).map((proposal) => (
                    <ProposalCard key={proposal.id} proposal={proposal} />
                  ))}
                </div>
              </section>
            )}
          </div>

          <aside className="space-y-4">
            <section className="brutalist-border p-4 bg-card">
              <h2 className="text-xs font-mono font-bold text-muted-foreground mb-3">PARTY SNAPSHOT</h2>
              <div className="space-y-2 font-mono text-xs text-muted-foreground">
                <div className="flex items-start justify-between gap-3">
                  <span>{leaderLinks.length === 1 ? 'Leader' : 'Leaders'}</span>
                  <span className="text-foreground font-bold text-right">
                    <LinkedPersonTextList
                      people={leaderLinks}
                      linkAriaLabelPrefix="Party snapshot leader"
                      sourceLinkAriaLabelPrefix="Open source for party snapshot leader"
                    />
                  </span>
                </div>
                {partyMetadata?.politicalPosition && (
                  <div className="flex items-center justify-between gap-3">
                    <span>Position</span>
                    <span className="text-foreground font-bold text-right">{partyMetadata.politicalPosition}</span>
                  </div>
                )}
                {partyMetadata?.ideologies.length ? (
                  <div className="flex items-start justify-between gap-3">
                    <span>Ideology</span>
                    <span className="text-foreground font-bold text-right">{partyMetadata.ideologies.join(', ')}</span>
                  </div>
                ) : null}
                {partyMetadata?.foundedYear && (
                  <div className="flex items-center justify-between gap-3">
                    <span>Founded</span>
                    <span className="text-foreground font-bold">{partyMetadata.foundedYear}</span>
                  </div>
                )}
                {partyMetadata?.officialWebsite && (
                  <div className="flex items-start justify-between gap-3">
                    <span>Website</span>
                    <a
                      href={partyMetadata.officialWebsite}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-foreground font-bold text-right hover:underline"
                    >
                      {partyMetadata.officialWebsite.replace(/^https?:\/\//, '')}
                    </a>
                  </div>
                )}
                <div className="flex items-center justify-between gap-3">
                  <span>Country</span>
                  <span className="text-foreground font-bold">
                    <Link to={countryRoute} className="hover:text-accent">
                      {countryName}
                    </Link>
                  </span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span>Capital</span>
                  <span className="text-foreground font-bold">{metadata?.capital || '—'}</span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span>Head of government</span>
                  <span className="text-foreground font-bold text-right">{metadata?.headOfGovernment || '—'}</span>
                </div>
              </div>
            </section>

            {roles.length > 0 && (
              <section className="brutalist-border p-4 bg-card">
                <h2 className="text-xs font-mono font-bold text-muted-foreground mb-3">KEY ROLES</h2>
                <div className="flex flex-wrap gap-2">
                  {roles.map((role) => (
                    <span key={role} className="evidence-tag">{role}</span>
                  ))}
                </div>
              </section>
            )}

            {topCommittees.length > 0 && (
              <section className="brutalist-border p-4 bg-card">
                <h2 className="text-xs font-mono font-bold text-muted-foreground mb-3">TOP COMMITTEES</h2>
                <div className="space-y-2">
                  {topCommittees.map((committee) => (
                    <div key={committee} className="brutalist-border p-3 text-sm">
                      {committee}
                    </div>
                  ))}
                </div>
              </section>
            )}
          </aside>
        </div>
      </main>
      <SiteFooter lastUpdatedAt={metadataUpdatedAt} lastUpdatedLabel={`${countryName} facts`} />
    </div>
  );
};

export default PartyDetail;
