import { useDeferredValue, useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ChevronDown, ExternalLink, Landmark, Search, Users, FileText } from 'lucide-react';
import SiteHeader from '@/components/SiteHeader';
import SiteFooter from '@/components/SiteFooter';
import ActorCard from '@/components/ActorCard';
import LinkedPersonTextList, { type LinkedPersonEntry } from '@/components/LinkedPersonTextList';
import OfficeholderCard from '@/components/OfficeholderCard';
import CountryShapeCard from '@/components/CountryShapeCard';
import CountryMiniGlobe from '@/components/CountryMiniGlobe';
import { useCountryStats, usePoliticiansByCountry } from '@/hooks/use-politicians';
import { useCountryMetadata } from '@/hooks/use-country-metadata';
import { usePartiesMetadata } from '@/hooks/use-party-metadata';
import ProposalCard from '@/components/ProposalCard';
import { useProposalsByCountry } from '@/hooks/use-proposals';
import { buildPartyDescription, getTopCommittees, slugifyPartyName } from '@/lib/party-summary';
import { getDisplayPersonName } from '@/lib/person-display';
import { formatTimestampLabel } from '@/lib/date-display';
import {
  buildTrackedLeadershipEntries,
  getLeadershipCategory,
  getLeadershipPriority,
  normalizePersonName,
  type LeadershipEntry,
} from '@/lib/country-leadership';

function formatCompactNumber(value: number | undefined) {
  if (value === undefined) return '—';
  return new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(value);
}

function formatNumber(value: number | undefined) {
  if (value === undefined) return '—';
  return new Intl.NumberFormat('en').format(Math.round(value));
}

function getSummaryPreview(value: string | undefined, maxLength = 220) {
  if (!value) return undefined;

  const preview = value.split(/(?<=[.!?])\s+/).slice(0, 2).join(' ').trim();
  if (preview.length <= maxLength) return preview;
  return `${preview.slice(0, maxLength).trimEnd()}…`;
}

function getActorSearchText(actor: {
  name: string;
  party: string;
  role: string;
  committees: string[];
}) {
  return [actor.name, actor.party, actor.role, ...actor.committees].join(' ').toLowerCase();
}

function renderMaybeLinkedName(entry: { href?: string; personName: string } | undefined, fallback: string) {
  const displayName = getDisplayPersonName(entry?.personName || fallback, entry?.href, 'Unresolved profile');
  if (!entry?.href) return displayName;

  if (entry.href.startsWith('/')) {
    return (
      <Link to={entry.href} className="hover:underline">
        {displayName}
      </Link>
    );
  }

  return (
    <a href={entry.href} target="_blank" rel="noopener noreferrer" className="hover:underline">
      {displayName}
    </a>
  );
}

function isCanonicalLeadershipOffice(office: string) {
  const lower = office.toLowerCase();
  return lower === 'head of state' || lower === 'head of government';
}

function mergeLeadershipEntry(existing: LeadershipEntry, incoming: LeadershipEntry): LeadershipEntry {
  const incomingCanonical = isCanonicalLeadershipOffice(incoming.office);
  const existingCanonical = isCanonicalLeadershipOffice(existing.office);
  const office =
    existingCanonical ? existing.office
    : incomingCanonical ? incoming.office
    : incoming.priority > existing.priority ? incoming.office
    : existing.office;
  const personName = existing.personName.length >= incoming.personName.length ? existing.personName : incoming.personName;
  const href =
    existing.href?.startsWith('/') ? existing.href
    : incoming.href?.startsWith('/') ? incoming.href
    : existing.href || incoming.href;
  const source = href?.startsWith('/') ? 'tracked' : existing.source === 'tracked' || incoming.source === 'tracked' ? 'tracked' : 'wikidata';

  return {
    category: existing.category,
    office,
    personName,
    href,
    source,
    priority: Math.max(existing.priority, incoming.priority),
  };
}

const CountryDetail = () => {
  const { id } = useParams();
  const countryCode = id?.toUpperCase();
  const countryRouteId = id?.toLowerCase() || '';
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedParties, setExpandedParties] = useState<string[]>([]);
  const [hasManualPartyLayout, setHasManualPartyLayout] = useState(false);
  const deferredSearchQuery = useDeferredValue(searchQuery.trim().toLowerCase());
  const { data: actors = [], isLoading } = usePoliticiansByCountry(id);
  const { data: countryStats = [] } = useCountryStats();
  const country = countryStats.find((entry) => entry.code === countryCode);
  const countryName = country?.name || actors[0]?.canton || countryCode || 'Unknown';
  const continent = country?.continent || 'Unknown';
  const { data: metadata } = useCountryMetadata(countryCode, countryName !== countryCode ? countryName : undefined);
  const metadataUpdatedAt = metadata?.sourceUpdatedAt || metadata?.databaseUpdatedAt;
  const { data: proposals = [] } = useProposalsByCountry(countryCode);

  const actorsByParty = actors.reduce<Record<string, typeof actors>>((groups, actor) => {
    const party = actor.party?.trim() || 'Independent / unaligned';
    if (!groups[party]) groups[party] = [];
    groups[party].push(actor);
    return groups;
  }, {});

  const partyGroups = Object.entries(actorsByParty)
    .map(([party, members]) => ({
      party,
      members,
      share: actors.length > 0 ? Math.round((members.length / actors.length) * 100) : 0,
      roles: Array.from(new Set(members.map((member) => member.role).filter(Boolean))).slice(0, 2),
      topCommittees: getTopCommittees(members, 3),
      description: buildPartyDescription(party, countryName, members),
    }))
    .sort((left, right) => right.members.length - left.members.length || left.party.localeCompare(right.party));

  const filteredActors = deferredSearchQuery
    ? actors.filter((actor) => getActorSearchText(actor).includes(deferredSearchQuery))
    : actors;

  const filteredActorGroups = partyGroups
    .map((group) => ({
      ...group,
      members: group.members.filter((actor) => filteredActors.some((candidate) => candidate.id === actor.id)),
    }))
    .filter((group) => group.members.length > 0);

  const committeeCount = new Set(actors.flatMap((actor) => actor.committees)).size;
  const partyNames = partyGroups.map((group) => group.party);
  const { data: partyMetadataByName = {} } = usePartiesMetadata(countryName, partyNames);
  const actorsByNormalizedName = new Map(
    actors.map((actor) => [normalizePersonName(actor.name), actor]),
  );
  const trackedLeadership = buildTrackedLeadershipEntries(actors);
  const leadershipEntries = [...trackedLeadership];

  for (const officeholder of metadata?.officeholders || []) {
    const personName = getDisplayPersonName(
      officeholder.personName,
      officeholder.personUrl,
      officeholder.personEntityId || 'Unresolved profile',
    );
    const actor = actorsByNormalizedName.get(normalizePersonName(personName));
    const href = actor ? `/actors/${actor.id}` : officeholder.personUrl;
    const incomingEntry: LeadershipEntry = {
      category: getLeadershipCategory(officeholder.office) || officeholder.office.toLowerCase(),
      office: officeholder.office,
      personName,
      href,
      source: actor ? 'tracked' : 'wikidata',
      priority: Math.max(getLeadershipPriority(officeholder.office), actor ? 110 : 80),
    };
    const duplicateIndex = leadershipEntries.findIndex(
      (entry) =>
        entry.category === incomingEntry.category &&
        normalizePersonName(entry.personName) === normalizePersonName(incomingEntry.personName),
    );

    if (duplicateIndex === -1) {
      leadershipEntries.push(incomingEntry);
      continue;
    }

    leadershipEntries[duplicateIndex] = mergeLeadershipEntry(leadershipEntries[duplicateIndex], incomingEntry);
  }

  leadershipEntries.sort((left, right) => right.priority - left.priority || left.office.localeCompare(right.office));
  const headOfStateEntry = leadershipEntries.find((entry) => entry.category === 'head_of_state');
  const headOfGovernmentEntry = leadershipEntries.find((entry) => entry.category === 'head_of_government');
  const visibleExpandedParties = deferredSearchQuery
    ? filteredActorGroups.map((group) => group.party)
    : expandedParties;

  useEffect(() => {
    setExpandedParties([]);
    setHasManualPartyLayout(false);
  }, [countryCode]);

  useEffect(() => {
    setExpandedParties((current) => {
      const available = new Set(partyNames);
      const kept = current.filter((party) => available.has(party));
      if (kept.length === current.length && kept.every((party, index) => party === current[index])) {
        return current;
      }
      if (kept.length > 0) return kept;
      if (!hasManualPartyLayout && partyNames[0]) return [partyNames[0]];
      return current.length === 0 ? current : [];
    });
  }, [partyNames, hasManualPartyLayout]);

  const toggleParty = (party: string) => {
    setHasManualPartyLayout(true);
    setExpandedParties((current) =>
      current.includes(party) ? current.filter((entry) => entry !== party) : [...current, party],
    );
  };

  const openPartyFromSidebar = (party: string) => {
    const sectionId = `party-${slugifyPartyName(party)}`;
    setHasManualPartyLayout(true);
    setExpandedParties((current) => (current.includes(party) ? current : [...current, party]));

    requestAnimationFrame(() => {
      document.getElementById(sectionId)?.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      });
    });
  };

  const scrollToProposals = () => {
    requestAnimationFrame(() => {
      document.getElementById('country-proposals')?.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      });
    });
  };

  const buildPartyLeaderLinks = (party: string): LinkedPersonEntry[] => {
    const leaders = partyMetadataByName[party]?.leaders || [];
    return leaders.map((leader) => {
      const actor = actorsByNormalizedName.get(normalizePersonName(leader.name));
      return {
        name: leader.name,
        href: actor ? `/actors/${actor.id}` : leader.url,
      };
    });
  };

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

  return (
    <div className="min-h-screen flex flex-col">
      <SiteHeader />
      <main className="container flex-1 py-8 max-w-4xl">
        <Link to="/explore" className="text-accent underline text-xs font-mono mb-4 inline-block">← EXPLORE</Link>

        <div className="brutalist-border-b pb-4 mb-6">
          <div className="flex flex-col lg:flex-row gap-5 lg:items-start">
            <div className="flex-1 min-w-0">
              <div className="flex gap-4 items-start">
                <div className="w-20 h-20 brutalist-border bg-card flex items-center justify-center overflow-hidden flex-shrink-0">
                  {metadata?.flagImageUrl ? (
                    <img
                      src={metadata.flagImageUrl}
                      alt={`${countryName} flag`}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <span className="text-4xl leading-none">{metadata?.flagEmoji || countryCode}</span>
                  )}
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex gap-2 mb-2 flex-wrap">
                    <span className="evidence-tag">{countryCode}</span>
                    <span className="evidence-tag">{continent}</span>
                    {metadata?.capital && <span className="evidence-tag">CAPITAL · {metadata.capital}</span>}
                  </div>
                  <h1 className="text-2xl font-extrabold tracking-tight">{countryName}</h1>
                  {metadata?.description && (
                    <p className="text-xs font-mono text-muted-foreground mt-1 uppercase tracking-wide">
                      {metadata.description}
                    </p>
                  )}
                  {metadata?.summary && (
                    <p className="text-sm text-muted-foreground leading-relaxed mt-3 max-w-2xl">
                      {metadata.summary}
                    </p>
                  )}
                  {(metadata?.wikipediaUrl || proposals.length > 0 || metadataUpdatedAt || metadata?.dataSource) && (
                    <div className="flex gap-2 flex-wrap mt-3">
                      {metadata?.wikipediaUrl && (
                        <a
                          href={metadata.wikipediaUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-xs font-mono text-accent hover:underline"
                        >
                          SOURCE · WIKIPEDIA
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      )}
                      {proposals.length > 0 && (
                        <button
                          type="button"
                          onClick={scrollToProposals}
                          className="evidence-tag hover:bg-secondary"
                        >
                          JUMP TO PROPOSALS
                        </button>
                      )}
                      {metadataUpdatedAt && (
                        <span className="evidence-tag">
                          LAST UPDATED · {formatTimestampLabel(metadataUpdatedAt)}
                        </span>
                      )}
                      {metadata?.dataSource === 'supabase' && <span className="evidence-tag">CACHED · SUPABASE</span>}
                      {metadata?.dataSource === 'live' && <span className="evidence-tag">LIVE LOOKUP · NOT YET CACHED</span>}
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 w-full lg:max-w-[320px]">
              <div className="brutalist-border p-3 bg-secondary">
                <div className="font-mono text-[10px] text-muted-foreground">ACTORS</div>
                <div className="font-mono text-xl font-bold">{actors.length}</div>
              </div>
              <div className="brutalist-border p-3 bg-secondary">
                <div className="font-mono text-[10px] text-muted-foreground">PARTIES</div>
                <div className="font-mono text-xl font-bold">{partyGroups.length}</div>
              </div>
              <div className="brutalist-border p-3 bg-secondary">
                <div className="font-mono text-[10px] text-muted-foreground">PROPOSALS</div>
                <div className="font-mono text-xl font-bold">{proposals.length}</div>
              </div>
              <div className="brutalist-border p-3 bg-secondary">
                <div className="font-mono text-[10px] text-muted-foreground">COMMITTEES</div>
                <div className="font-mono text-xl font-bold">{committeeCount}</div>
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.45fr)_320px] gap-6">
          <div className="space-y-6">
            <section className="brutalist-border p-4 bg-card">
              <div className="flex flex-col md:flex-row md:items-center gap-3 justify-between">
                <div>
                  <h2 className="text-xs font-mono font-bold text-muted-foreground">PARLIAMENT COMPOSITION</h2>
                  <p className="text-sm mt-1">
                    {deferredSearchQuery
                      ? `Showing ${filteredActors.length} of ${actors.length} tracked actors`
                      : `${actors.length} tracked actors across ${partyGroups.length} parties`}
                  </p>
                </div>

                <div className="w-full md:max-w-sm">
                  <div className="brutalist-border flex items-center bg-background">
                    <div className="px-3 py-2.5 brutalist-border border-t-0 border-b-0 border-l-0 bg-secondary">
                      <Search className="w-4 h-4 text-muted-foreground" />
                    </div>
                    <input
                      aria-label="Filter actors in this country"
                      type="text"
                      value={searchQuery}
                      onChange={(event) => setSearchQuery(event.target.value)}
                      placeholder="Search actors, parties, roles, committees..."
                      className="flex-1 px-3 py-2.5 bg-transparent text-sm font-mono placeholder:text-muted-foreground focus:outline-none"
                    />
                    {searchQuery && (
                      <button
                        onClick={() => setSearchQuery('')}
                        className="px-3 font-mono text-xs text-muted-foreground hover:text-foreground"
                      >
                        CLEAR
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {partyGroups.length > 0 && !deferredSearchQuery && (
                <div className="flex gap-2 flex-wrap mt-3">
                  <button
                    type="button"
                    onClick={() => {
                      setHasManualPartyLayout(true);
                      setExpandedParties(partyGroups.map((group) => group.party));
                    }}
                    className="evidence-tag hover:bg-secondary"
                  >
                    EXPAND ALL
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setHasManualPartyLayout(true);
                      setExpandedParties([]);
                    }}
                    className="evidence-tag hover:bg-secondary"
                  >
                    COLLAPSE ALL
                  </button>
                </div>
              )}
            </section>

            {actors.length === 0 ? (
              <section className="brutalist-border p-6 text-center bg-secondary">
                <p className="font-mono text-sm text-muted-foreground">No politicians found for this country yet.</p>
              </section>
            ) : filteredActorGroups.length === 0 ? (
              <section className="brutalist-border p-6 text-center bg-secondary">
                <p className="font-mono text-sm text-muted-foreground">
                  No actors match the current search in {countryName}.
                </p>
              </section>
            ) : (
              filteredActorGroups.map((group) => (
                <section key={group.party} id={`party-${slugifyPartyName(group.party)}`} className="brutalist-border overflow-hidden bg-card">
                  {(() => {
                    const partyMetadata = partyMetadataByName[group.party];
                    const leaderLinks = buildPartyLeaderLinks(group.party);

                    return (
                      <div className="px-4 py-3 brutalist-border-b bg-secondary flex flex-col sm:flex-row sm:items-start gap-3 justify-between">
                        <div className="min-w-0">
                          <Link
                            to={`/country/${countryRouteId}/party/${slugifyPartyName(group.party)}`}
                            className="text-sm font-bold hover:underline"
                          >
                            {group.party}
                          </Link>
                          <p className="text-[11px] font-mono text-muted-foreground mt-1">
                            {group.members.length} actors
                            {group.roles.length > 0 ? ` · ${group.roles.join(' · ')}` : ''}
                          </p>
                          <p className="text-[11px] text-muted-foreground mt-1 max-w-2xl">
                            {partyMetadata?.description || group.description}
                          </p>
                          {leaderLinks.length > 0 && (
                            <p className="text-[11px] font-mono text-muted-foreground mt-1">
                              {leaderLinks.length === 1 ? 'Leader' : 'Leaders'}:{' '}
                              <LinkedPersonTextList people={leaderLinks} linkAriaLabelPrefix="Party leader" />
                            </p>
                          )}
                        </div>
                        <div className="flex items-center gap-2 flex-wrap sm:justify-end">
                          <span className="evidence-tag">{group.share}% OF COUNTRY PAGE</span>
                          <span className="evidence-tag">{group.members.length} MEMBERS</span>
                          <Link
                            to={`/country/${countryRouteId}/party/${slugifyPartyName(group.party)}`}
                            className="evidence-tag hover:bg-background"
                          >
                            PAGE
                          </Link>
                          <button
                            type="button"
                            onClick={() => toggleParty(group.party)}
                            aria-expanded={visibleExpandedParties.includes(group.party)}
                            className="evidence-tag gap-1 hover:bg-background"
                          >
                            {visibleExpandedParties.includes(group.party) ? 'HIDE' : 'SHOW'}
                            <ChevronDown
                              className={`w-3 h-3 transition-transform ${
                                visibleExpandedParties.includes(group.party) ? 'rotate-180' : ''
                              }`}
                            />
                          </button>
                        </div>
                      </div>
                    );
                  })()}

                  {visibleExpandedParties.includes(group.party) && (
                    <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                      {group.members.map((actor) => (
                        <ActorCard key={actor.id} actor={actor} />
                      ))}
                    </div>
                  )}
                </section>
              ))
            )}

            {proposals.length > 0 && (
              <section id="country-proposals" className="space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <h2 className="text-xs font-mono font-bold text-muted-foreground flex items-center gap-2">
                    <FileText className="w-3 h-3" />
                    RECENT PROPOSALS
                  </h2>
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
              <h2 className="text-xs font-mono font-bold text-muted-foreground mb-3 flex items-center gap-2">
                <Landmark className="w-3 h-3" />
                COUNTRY FACTS
              </h2>

              <div className="grid grid-cols-2 gap-3">
                <div className="brutalist-border p-3 bg-secondary/40">
                  <div className="text-[10px] font-mono text-muted-foreground">CAPITAL</div>
                  <div className="text-sm font-bold mt-1">{metadata?.capital || '—'}</div>
                </div>
                <div className="brutalist-border p-3 bg-secondary/40">
                  <div className="text-[10px] font-mono text-muted-foreground">POPULATION</div>
                  <div className="text-sm font-bold mt-1">{formatCompactNumber(metadata?.population)}</div>
                </div>
                <div className="brutalist-border p-3 bg-secondary/40">
                  <div className="text-[10px] font-mono text-muted-foreground">AREA KM²</div>
                  <div className="text-sm font-bold mt-1">{formatCompactNumber(metadata?.areaKm2)}</div>
                </div>
                <div className="brutalist-border p-3 bg-secondary/40">
                  <div className="text-[10px] font-mono text-muted-foreground">ISO CODE</div>
                  <div className="text-sm font-bold mt-1">{countryCode}</div>
                </div>
              </div>

              <div className="space-y-3 mt-4">
                <div className="brutalist-border p-3">
                  <div className="text-[10px] font-mono text-muted-foreground uppercase">Head of State</div>
                  <div className="text-sm font-bold mt-1">
                    {renderMaybeLinkedName(headOfStateEntry, metadata?.headOfState || '—')}
                  </div>
                </div>
                <div className="brutalist-border p-3">
                  <div className="text-[10px] font-mono text-muted-foreground uppercase">Head of Government</div>
                  <div className="text-sm font-bold mt-1">
                    {renderMaybeLinkedName(headOfGovernmentEntry, metadata?.headOfGovernment || '—')}
                  </div>
                </div>
              </div>
            </section>

            {leadershipEntries.length > 0 && (
              <section className="brutalist-border p-4 bg-card">
                <div className="flex items-start justify-between gap-3 mb-3">
                  <h2 className="text-xs font-mono font-bold text-muted-foreground flex items-center gap-2">
                    <Landmark className="w-3 h-3" />
                    PEOPLE AT THE TOP OF THE PYRAMID
                  </h2>
                </div>
                <p className="text-[10px] font-mono text-muted-foreground mb-3">
                  Head of state, head of government, and top cabinet / military offices. Tracked profiles first, Wikipedia / Wikidata as fallback.
                </p>
                <div className="space-y-3">
                  {leadershipEntries.map((entry) => (
                    <OfficeholderCard
                      key={`${entry.office}-${entry.personName}`}
                      office={entry.office}
                      personName={entry.personName}
                      href={entry.href}
                      source={entry.source}
                    />
                  ))}
                </div>
              </section>
            )}

            <section className="space-y-4">
              {metadata?.locatorMapUrl && (
                <CountryShapeCard countryName={countryName} locatorMapUrl={metadata.locatorMapUrl} />
              )}

              <CountryMiniGlobe coordinates={metadata?.coordinates} countryName={countryName} />
            </section>

            {partyGroups.length > 0 && (
              <section className="brutalist-border p-4 bg-card">
                <h2 className="text-xs font-mono font-bold text-muted-foreground mb-3 flex items-center gap-2">
                  <Users className="w-3 h-3" />
                  PARTY COMPOSITION
                </h2>

                <div className="space-y-3">
                  {partyGroups.map((group) => (
                    <div key={group.party} className="relative group">
                      {(() => {
                        const partyMetadata = partyMetadataByName[group.party];
                        const leaderLinks = buildPartyLeaderLinks(group.party);
                        const preview = getSummaryPreview(partyMetadata?.summary) || partyMetadata?.description || group.description;

                        return (
                          <>
                            <div className="flex items-start gap-2">
                              <button
                                type="button"
                                onClick={() => openPartyFromSidebar(group.party)}
                                className="flex-1 block hover:bg-secondary/50 transition-colors p-2 -m-2 text-left"
                                title={preview}
                              >
                                <div className="flex items-center justify-between gap-3 font-mono text-xs mb-1.5">
                                  <span className="font-bold text-foreground">{group.party}</span>
                                  <span className="text-muted-foreground">{group.members.length}</span>
                                </div>
                                {partyMetadata?.description && (
                                  <p className="text-[10px] text-muted-foreground mb-1.5">{partyMetadata.description}</p>
                                )}
                                <div className="h-3 brutalist-border bg-secondary overflow-hidden">
                                  <div className="h-full bg-accent" style={{ width: `${Math.max(group.share, 6)}%` }} />
                                </div>
                              </button>
                              <Link
                                to={`/country/${countryRouteId}/party/${slugifyPartyName(group.party)}`}
                                className="evidence-tag hover:bg-secondary shrink-0"
                              >
                                PAGE
                              </Link>
                            </div>
                            <div className="hidden group-hover:block absolute right-0 top-full mt-2 z-20 w-[280px] brutalist-border bg-background p-3 shadow-lg">
                              <p className="text-[10px] font-mono font-bold text-muted-foreground mb-1">PARTY SNAPSHOT</p>
                              <p className="text-xs leading-relaxed">{preview}</p>
                              {leaderLinks.length > 0 && (
                                <div className="mt-2 text-[10px] font-mono text-muted-foreground">
                                  {leaderLinks.length === 1 ? 'Leader' : 'Leaders'}:{' '}
                                  <LinkedPersonTextList people={leaderLinks} linkAriaLabelPrefix="Party snapshot leader" />
                                </div>
                              )}
                              {partyMetadata?.politicalPosition && (
                                <div className="mt-2 text-[10px] font-mono text-muted-foreground">
                                  Position: {partyMetadata.politicalPosition}
                                </div>
                              )}
                              {group.topCommittees.length > 0 && (
                                <div className="mt-2 text-[10px] font-mono text-muted-foreground">
                                  Committees: {group.topCommittees.join(', ')}
                                </div>
                              )}
                            </div>
                          </>
                        );
                      })()}
                    </div>
                  ))}
                </div>
              </section>
            )}

            <section className="brutalist-border p-4 bg-card">
              <h2 className="text-xs font-mono font-bold text-muted-foreground mb-3">AT A GLANCE</h2>
              <div className="space-y-2 font-mono text-xs text-muted-foreground">
                <div className="flex items-center justify-between gap-3">
                  <span>Tracked actors</span>
                  <span className="text-foreground font-bold">{actors.length}</span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span>Unique parties</span>
                  <span className="text-foreground font-bold">{partyGroups.length}</span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span>Country proposals</span>
                  <span className="text-foreground font-bold">{proposals.length}</span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span>Population</span>
                  <span className="text-foreground font-bold">{formatNumber(metadata?.population)}</span>
                </div>
              </div>
            </section>
          </aside>
        </div>
      </main>
      <SiteFooter lastUpdatedAt={metadataUpdatedAt} lastUpdatedLabel={`${countryName} facts`} />
    </div>
  );
};

export default CountryDetail;
