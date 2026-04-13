import { useParams, Link } from 'react-router-dom';
import SiteHeader from '@/components/SiteHeader';
import SiteFooter from '@/components/SiteFooter';
import ActorTimeline from '@/components/ActorTimeline';
import ActorCharts from '@/components/ActorCharts';
import { usePolitician, usePoliticianEvents, usePoliticianFinances, usePoliticianInvestments, usePoliticianPosition, useAllPositions, usePoliticianAssociates } from '@/hooks/use-politicians';
import { useCountryMetadata } from '@/hooks/use-country-metadata';
import { usePartyMetadata } from '@/hooks/use-party-metadata';
import { useWikipediaPageSummary } from '@/hooks/use-wikipedia-page';
import { useProposalsByCountry } from '@/hooks/use-proposals';
import { statusLabels, statusColors } from '@/hooks/use-proposals';
import { ExternalLink, TrendingUp, Building2, Briefcase, DollarSign, Compass, Users, Globe, Handshake, FileText } from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { PoliticalCompassChart, IdeologyLegend } from '@/components/PoliticalCompass';
import { PolicyRadarChart, PoliticalAxesBar, KeyPositionsList } from '@/components/PolicyRadar';
import LinkedPersonTextList from '@/components/LinkedPersonTextList';
import { SourceBadge, ProvenanceBar } from '@/components/SourceBadge';
import { Link as RouterLink } from 'react-router-dom';
import { getIdeologyDisplayLabel, hasRenderablePolicyAxes } from '@/lib/political-positioning';
import { slugifyPartyName } from '@/lib/party-summary';

const SECTOR_COLORS: Record<string, string> = {
  Technology: 'hsl(215, 30%, 45%)',
  Energy: 'hsl(45, 70%, 50%)',
  Finance: 'hsl(150, 40%, 40%)',
  Healthcare: 'hsl(0, 55%, 45%)',
  'Real Estate': 'hsl(280, 30%, 50%)',
  Defense: 'hsl(30, 60%, 50%)',
  Consulting: 'hsl(180, 40%, 40%)',
};

function formatCurrency(value: number | null, currency = 'EUR') {
  if (value === null || value === undefined) return '—';
  return new Intl.NumberFormat('en-EU', { style: 'currency', currency, maximumFractionDigits: 0 }).format(value);
}

function formatDateLabel(value: string | undefined) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString();
}

function getDataSourceLabel(value: string | undefined) {
  switch (value) {
    case 'official_record':
      return 'Official roster';
    case 'parliamentary_record':
      return 'Parliamentary record';
    case 'eu_parliament':
      return 'European Parliament';
    case 'wikipedia':
      return 'Wikipedia';
    default:
      return value ? value.replace(/_/g, ' ') : 'Unknown';
  }
}

function getSourceHost(value: string | undefined) {
  if (!value) return null;
  try {
    return new URL(value).hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

type AttributionSourceSummary = {
  fieldCount: number;
  fields: string[];
  label: string;
  type?: string;
  url?: string;
};

function extractAttributionSourceSummaries(sourceAttribution: Record<string, unknown> | undefined) {
  if (!sourceAttribution) return [] as AttributionSourceSummary[];

  const grouped = new Map<string, AttributionSourceSummary>();
  for (const [fieldName, rawValue] of Object.entries(sourceAttribution)) {
    if (fieldName.startsWith('_') || !isRecord(rawValue)) continue;

    const label = typeof rawValue.source_label === 'string' ? rawValue.source_label : 'Source';
    const url = typeof rawValue.source_url === 'string' ? rawValue.source_url : undefined;
    const type = typeof rawValue.source_type === 'string' ? rawValue.source_type : undefined;
    const key = `${label}::${url || ''}::${type || ''}`;

    if (!grouped.has(key)) {
      grouped.set(key, {
        fieldCount: 0,
        fields: [],
        label,
        type,
        url,
      });
    }

    const current = grouped.get(key)!;
    current.fieldCount += 1;
    current.fields.push(fieldName);
  }

  return [...grouped.values()].sort((left, right) => right.fieldCount - left.fieldCount || left.label.localeCompare(right.label));
}

function findOfficeholderReference(
  officeholders: Array<{ office: string; personName: string; personUrl?: string }> | undefined,
  officePatterns: string[],
  fallbackName: string | undefined,
) {
  if (!officeholders?.length || !fallbackName) return undefined;

  const normalizedName = fallbackName.trim().toLowerCase();
  const matchingOfficeholder =
    officeholders.find((entry) => entry.personName.trim().toLowerCase() === normalizedName) ||
    officeholders.find((entry) => officePatterns.some((pattern) => entry.office.toLowerCase().includes(pattern)));

  if (!matchingOfficeholder) return undefined;

  return {
    href: matchingOfficeholder.personUrl,
    name: matchingOfficeholder.personName,
  };
}

const ActorDetail = () => {
  const { id } = useParams();
  const { data: actor, isLoading } = usePolitician(id);
  const { data: events = [] } = usePoliticianEvents(id);
  const { data: finances } = usePoliticianFinances(id);
  const { data: investments = [] } = usePoliticianInvestments(id);
  const { data: position } = usePoliticianPosition(id);
  const { data: allPositions = [] } = useAllPositions();
  const { data: associates = [] } = usePoliticianAssociates(id);
  const countryCode = actor?.countryId?.toUpperCase();
  const { data: countryMetadata } = useCountryMetadata(countryCode, actor?.canton);
  const partyLookupName =
    actor?.partyName ||
    (actor?.party && actor.party !== 'Independent' && actor.party !== 'unknown' ? actor.party : undefined);
  const { data: partyMetadata } = usePartyMetadata(partyLookupName, actor?.canton);
  const { data: countryProposals = [] } = useProposalsByCountry(countryCode);
  const needsWikipediaFallback = Boolean(
    actor?.wikipediaUrl && (!actor.wikipediaSummary || !actor.biography || !actor.photoUrl || !actor.wikipediaData?.description),
  );
  const { data: wikipediaFallback } = useWikipediaPageSummary(actor?.wikipediaUrl, needsWikipediaFallback);

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

  if (!actor) {
    return (
      <div className="min-h-screen flex flex-col">
        <SiteHeader />
        <main className="container flex-1 py-8">
          <p className="font-mono text-sm text-muted-foreground">Actor not found.</p>
          <Link to="/actors" className="text-accent underline text-sm mt-2 inline-block">← Back to actors</Link>
        </main>
        <SiteFooter />
      </div>
    );
  }

  const infobox = actor.wikipediaData?.infobox as Record<string, string> | undefined;
  const wikipediaDescription =
    (typeof actor.wikipediaData?.description === 'string' ? actor.wikipediaData.description : null) ||
    wikipediaFallback?.description ||
    null;
  const wikipediaSummary = actor.wikipediaSummary || wikipediaFallback?.extract || actor.biography || null;
  const actorPhotoUrl = actor.photoUrl || actor.wikipediaImageUrl || wikipediaFallback?.imageUrl || undefined;
  const wikipediaUrl = actor.wikipediaUrl || wikipediaFallback?.canonicalUrl || undefined;
  const partyLabel = actor.partyName || actor.party;
  const resolvedPartyName = partyMetadata?.partyName || partyLabel;
  const partyRoute =
    actor.countryId && resolvedPartyName && resolvedPartyName !== 'Independent'
      ? `/country/${actor.countryId}/party/${slugifyPartyName(resolvedPartyName)}`
      : null;
  const attributionSources = extractAttributionSourceSummaries(actor.sourceAttribution);
  const attributedFieldCount = Object.keys(actor.sourceAttribution || {}).filter((key) => !key.startsWith('_')).length;
  const recordHost = getSourceHost(actor.sourceUrl);
  const countryOfficeholderCount = countryMetadata?.officeholders?.length || 0;
  const headOfStateReference = findOfficeholderReference(
    countryMetadata?.officeholders,
    ['head of state', 'president', 'king', 'queen', 'monarch'],
    countryMetadata?.headOfState,
  );
  const headOfGovernmentReference = findOfficeholderReference(
    countryMetadata?.officeholders,
    ['head of government', 'prime minister', 'chancellor', 'premier'],
    countryMetadata?.headOfGovernment,
  );
  const partyLeaderLinks = (partyMetadata?.leaders || []).map((leader) => ({
    href: leader.url,
    name: leader.name,
  }));
  const totalInvestmentValue = investments.reduce((s, i) => s + (i.estimated_value || 0), 0);
  const totalIncome = (finances?.annual_salary || 0) + (finances?.side_income || 0);
  const displayedIdeology = getIdeologyDisplayLabel(position?.ideology_label);
  const hasOrientationEstimate = hasRenderablePolicyAxes(position);
  const isPartyEstimate = Boolean(position?.data_source?.includes('party_'));
  const orientationGapReason = !partyLabel || partyLabel === 'Independent' || partyLabel === 'unknown'
    ? 'The current roster record does not resolve a party alignment for this actor, so the model withholds an ideological estimate.'
    : position?.data_source === 'unclassified_party_profile' || displayedIdeology === 'Unclassified'
      ? 'The actor has a party assignment, but the current party-family mapping does not classify it with enough confidence to publish a defensible estimate yet.'
      : 'This actor is missing enough structured signal for a defensible political-position estimate right now.';
  const actorCoverage = [
    { label: 'Biography', value: Boolean(wikipediaSummary) },
    { label: 'Photo', value: Boolean(actorPhotoUrl) },
    { label: 'Country context', value: Boolean(countryMetadata) },
    { label: 'Party context', value: Boolean(partyMetadata || partyRoute) },
    { label: 'Policy model', value: Boolean(hasOrientationEstimate || (displayedIdeology && displayedIdeology !== 'Unclassified')) },
    { label: 'Committees', value: actor.committees.length > 0 },
    { label: 'Associates', value: associates.length > 0 },
    { label: 'Finances', value: Boolean(finances) },
    { label: 'Country proposals', value: countryProposals.length > 0 },
    { label: 'Source attribution', value: attributedFieldCount > 0 || Boolean(actor.sourceUrl) },
  ];

  // Sector breakdown for pie chart
  const sectorMap: Record<string, number> = {};
  investments.forEach(inv => {
    const sector = inv.sector || 'Other';
    sectorMap[sector] = (sectorMap[sector] || 0) + (inv.estimated_value || 0);
  });
  const sectorData = Object.entries(sectorMap)
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value);

  // Ensure current politician is always in the compass positions list
  const compassPositions = (() => {
    if (!position) return allPositions;
    const hasCurrentPolitician = allPositions.some((p: any) => p.politician_id === id);
    if (hasCurrentPolitician) return allPositions;
    return [...allPositions, { ...position, politician_id: id, name: actor.name }];
  })();

  return (
    <div className="min-h-screen flex flex-col">
      <SiteHeader />
      <main className="container flex-1 py-4 sm:py-8 max-w-4xl">
        <Link to="/actors" className="text-accent underline text-xs font-mono mb-4 inline-block">← ACTORS</Link>

        {/* Header with photo */}
        <div className="brutalist-border-b pb-4 mb-4 sm:mb-6">
          <div className="flex gap-3 sm:gap-4 items-start">
            {actorPhotoUrl && (
              <img
                src={actorPhotoUrl}
                alt={actor.name}
                className="w-16 h-16 sm:w-20 sm:h-20 rounded object-cover brutalist-border flex-shrink-0"
                onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
              />
            )}
            <div className="flex-1 min-w-0">
              <div className="flex gap-1 sm:gap-2 mb-2 flex-wrap">
                <span className="evidence-tag text-[10px] sm:text-xs">{actor.countryId.toUpperCase()}</span>
                <span className="evidence-tag text-[10px] sm:text-xs truncate max-w-[120px] sm:max-w-none">{actor.party}</span>
                <span className="evidence-tag text-[10px] sm:text-xs">{actor.jurisdiction.toUpperCase()}</span>
              </div>
              <h1 className="text-xl sm:text-2xl font-extrabold tracking-tight">{actor.name}</h1>
              <p className="text-xs sm:text-sm font-mono text-muted-foreground">{actor.role} · {actor.canton}</p>
              {wikipediaDescription && (
                <p className="text-xs text-muted-foreground mt-1 italic hidden sm:block">{wikipediaDescription}</p>
              )}
              <ProvenanceBar sources={[
                ...(wikipediaUrl ? [{ label: 'Wikipedia', url: wikipediaUrl, type: 'official' as const }] : []),
                ...(actor.enrichedAt ? [{ label: `Enriched ${new Date(actor.enrichedAt).toLocaleDateString()}`, type: 'fact' as const }] : []),
              ]} />
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_260px] gap-4 sm:gap-8">
          <div>
            {/* Wikipedia biography */}
            {wikipediaSummary && (
              <section className="mb-8">
                <h2 className="text-xs font-mono font-bold text-muted-foreground mb-3 flex items-center gap-2">
                  <span className="inline-block w-3 h-3 rounded-full bg-primary" />
                  BIOGRAPHY
                </h2>
                <div className="brutalist-border p-4 bg-secondary/30">
                  <p className="text-sm leading-relaxed">{wikipediaSummary}</p>
                  <ProvenanceBar sources={[
                    { label: 'Wikipedia', url: wikipediaUrl, type: 'official' },
                  ]} />
                </div>
              </section>
            )}

            <section className="mb-8">
              <h2 className="text-xs font-mono font-bold text-muted-foreground mb-3 flex items-center gap-2">
                <Briefcase className="w-3 h-3" />
                PROFILE DOSSIER
              </h2>
              <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
                <div className="brutalist-border p-4 bg-card">
                  <p className="text-[10px] font-mono font-bold text-muted-foreground mb-3">OFFICE RECORD</p>
                  <div className="space-y-2 font-mono text-xs">
                    <div className="flex items-start justify-between gap-3">
                      <span className="text-muted-foreground">Role</span>
                      <span className="font-bold text-right">{actor.role}</span>
                    </div>
                    <div className="flex items-start justify-between gap-3">
                      <span className="text-muted-foreground">Jurisdiction</span>
                      <span className="font-bold text-right">{actor.jurisdiction.toUpperCase()}</span>
                    </div>
                    <div className="flex items-start justify-between gap-3">
                      <span className="text-muted-foreground">Country</span>
                      <RouterLink to={`/country/${actor.countryId}`} className="font-bold text-right hover:text-accent">
                        {countryMetadata?.flagEmoji ? `${countryMetadata.flagEmoji} ` : ''}
                        {actor.canton}
                      </RouterLink>
                    </div>
                    <div className="flex items-start justify-between gap-3">
                      <span className="text-muted-foreground">Party</span>
                      {partyRoute ? (
                        <RouterLink to={partyRoute} className="font-bold text-right hover:text-accent">
                          {partyLabel}
                        </RouterLink>
                      ) : (
                        <span className="font-bold text-right">{partyLabel || 'Unresolved'}</span>
                      )}
                    </div>
                    <div className="flex items-start justify-between gap-3">
                      <span className="text-muted-foreground">In office since</span>
                      <span className="font-bold text-right">{formatDateLabel(actor.inOfficeSince)}</span>
                    </div>
                    <div className="flex items-start justify-between gap-3">
                      <span className="text-muted-foreground">Updated</span>
                      <span className="font-bold text-right">{formatDateLabel(actor.updatedAt)}</span>
                    </div>
                    <div className="flex items-start justify-between gap-3">
                      <span className="text-muted-foreground">Ingestion source</span>
                      <span className="font-bold text-right">{getDataSourceLabel(actor.dataSource)}</span>
                    </div>
                  </div>
                </div>

                <div className="brutalist-border p-4 bg-card">
                  <p className="text-[10px] font-mono font-bold text-muted-foreground mb-3">COUNTRY CONTEXT</p>
                  <div className="space-y-2 font-mono text-xs">
                    <div className="flex items-start justify-between gap-3">
                      <span className="text-muted-foreground">Capital</span>
                      <span className="font-bold text-right">{countryMetadata?.capital || '—'}</span>
                    </div>
                    <div className="flex items-start justify-between gap-3">
                      <span className="text-muted-foreground">Head of state</span>
                      <span className="font-bold text-right">
                        <LinkedPersonTextList
                          people={headOfStateReference ? [headOfStateReference] : []}
                          emptyLabel={countryMetadata?.headOfState || '—'}
                          linkAriaLabelPrefix="Head of state"
                        />
                      </span>
                    </div>
                    <div className="flex items-start justify-between gap-3">
                      <span className="text-muted-foreground">Head of government</span>
                      <span className="font-bold text-right">
                        <LinkedPersonTextList
                          people={headOfGovernmentReference ? [headOfGovernmentReference] : []}
                          emptyLabel={countryMetadata?.headOfGovernment || '—'}
                          linkAriaLabelPrefix="Head of government"
                        />
                      </span>
                    </div>
                    <div className="flex items-start justify-between gap-3">
                      <span className="text-muted-foreground">Tracked officeholders</span>
                      <span className="font-bold text-right">{countryOfficeholderCount || '—'}</span>
                    </div>
                    <div className="flex items-start justify-between gap-3">
                      <span className="text-muted-foreground">Tracked proposals</span>
                      <span className="font-bold text-right">{countryProposals.length}</span>
                    </div>
                  </div>
                  <div className="mt-3 pt-3 border-t border-border space-y-2">
                    <RouterLink to={`/country/${actor.countryId}`} className="text-xs font-mono text-accent hover:underline block">
                      Open country page →
                    </RouterLink>
                    {countryMetadata?.wikipediaUrl && (
                      <a href={countryMetadata.wikipediaUrl} target="_blank" rel="noopener noreferrer" className="text-xs font-mono text-accent hover:underline block">
                        Country source →
                      </a>
                    )}
                  </div>
                </div>

                <div className="brutalist-border p-4 bg-card">
                  <p className="text-[10px] font-mono font-bold text-muted-foreground mb-3">PARTY CONTEXT</p>
                  <div className="space-y-2 font-mono text-xs">
                    <div className="flex items-start justify-between gap-3">
                      <span className="text-muted-foreground">Resolved party</span>
                      <span className="font-bold text-right">{resolvedPartyName || 'Unresolved'}</span>
                    </div>
                    <div className="flex items-start justify-between gap-3">
                      <span className="text-muted-foreground">Political position</span>
                      <span className="font-bold text-right">{partyMetadata?.politicalPosition || '—'}</span>
                    </div>
                    <div className="flex items-start justify-between gap-3">
                      <span className="text-muted-foreground">Official website</span>
                      {partyMetadata?.officialWebsite ? (
                        <a href={partyMetadata.officialWebsite} target="_blank" rel="noopener noreferrer" className="font-bold text-right hover:text-accent">
                          {getSourceHost(partyMetadata.officialWebsite) || partyMetadata.officialWebsite}
                        </a>
                      ) : (
                        <span className="font-bold text-right">—</span>
                      )}
                    </div>
                    <div className="flex items-start justify-between gap-3">
                      <span className="text-muted-foreground">Ideologies</span>
                      <span className="font-bold text-right">{partyMetadata?.ideologies?.slice(0, 3).join(', ') || '—'}</span>
                    </div>
                    <div className="flex items-start justify-between gap-3">
                      <span className="text-muted-foreground">Leaders</span>
                      <span className="font-bold text-right">
                        <LinkedPersonTextList people={partyLeaderLinks} emptyLabel="—" linkAriaLabelPrefix="Party leader" />
                      </span>
                    </div>
                  </div>
                  {partyMetadata?.summary ? (
                    <p className="text-xs text-muted-foreground mt-3 leading-relaxed">{partyMetadata.summary}</p>
                  ) : (
                    <p className="text-xs text-muted-foreground mt-3 leading-relaxed">
                      Party-level enrichment is limited for this actor because the current source record does not fully resolve their party affiliation yet.
                    </p>
                  )}
                  <div className="mt-3 pt-3 border-t border-border space-y-2">
                    {partyRoute && (
                      <RouterLink to={partyRoute} className="text-xs font-mono text-accent hover:underline block">
                        Open party page →
                      </RouterLink>
                    )}
                    {partyMetadata?.wikipediaUrl && (
                      <a href={partyMetadata.wikipediaUrl} target="_blank" rel="noopener noreferrer" className="text-xs font-mono text-accent hover:underline block">
                        Party source →
                      </a>
                    )}
                    {partyMetadata?.officialWebsite && (
                      <a href={partyMetadata.officialWebsite} target="_blank" rel="noopener noreferrer" className="text-xs font-mono text-accent hover:underline block">
                        Party website →
                      </a>
                    )}
                  </div>
                </div>
              </div>
            </section>

            {countryProposals.length > 0 && (
              <section className="mb-8">
                <h2 className="text-xs font-mono font-bold text-muted-foreground mb-3 flex items-center gap-2">
                  <FileText className="w-3 h-3" />
                  RELATED LEGISLATION ({countryCode})
                </h2>
                <div className="brutalist-border p-4 bg-card">
                  <div className="space-y-1.5">
                    {countryProposals.slice(0, 8).map((proposal) => (
                      <RouterLink
                        key={proposal.id}
                        to={`/proposals/${proposal.id}`}
                        className="flex items-center gap-2 text-xs font-mono hover:bg-muted/50 px-2 py-1.5 rounded transition-colors"
                      >
                        <span className={`px-1 py-0.5 rounded text-[9px] ${statusColors[proposal.status] || 'bg-muted'}`}>
                          {statusLabels[proposal.status] || proposal.status.toUpperCase()}
                        </span>
                        <span className="truncate flex-1">{proposal.title}</span>
                        {proposal.policy_area && (
                          <span className="text-[9px] text-muted-foreground">{proposal.policy_area.replace(/_/g, ' ')}</span>
                        )}
                      </RouterLink>
                    ))}
                  </div>
                  <div className="mt-3 pt-3 border-t border-border">
                    <RouterLink to={`/proposals?country=${countryCode}`} className="text-[10px] font-mono text-accent hover:underline block">
                      View all {countryCode} proposals →
                    </RouterLink>
                  </div>
                  <ProvenanceBar sources={[
                    { label: 'EUR-Lex / national parliament', url: 'https://eur-lex.europa.eu/', type: 'official' },
                  ]} />
                </div>
              </section>
            )}

            {/* Political Orientation */}
            {position && (
              <section className="mb-8">
                <h2 className="text-xs font-mono font-bold text-muted-foreground mb-3 flex items-center gap-2">
                  <Compass className="w-3 h-3" />
                  POLITICAL ORIENTATION
                  {displayedIdeology && (
                    <span className="px-2 py-0.5 rounded bg-primary/10 text-primary text-[10px]">{displayedIdeology}</span>
                  )}
                </h2>

                {isPartyEstimate && (
                  <p className="text-[10px] font-mono text-muted-foreground mb-3">
                    Estimated from party affiliation and party-family mapping. This is not a person-specific voting model.
                  </p>
                )}

                {hasOrientationEstimate ? (
                  <>
                    {/* Political Axes */}
                    <div className="brutalist-border p-4 bg-secondary/30 mb-4">
                      <PoliticalAxesBar position={position as any} />
                      <ProvenanceBar sources={[
                        { label: 'Chapel Hill Expert Survey', url: 'https://www.chesdata.eu/', type: 'model' },
                        { label: 'Party family mapping', type: 'estimate' },
                      ]} />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                      {/* Policy Radar */}
                      <div className="brutalist-border p-3 bg-card">
                        <p className="text-[10px] font-mono font-bold text-muted-foreground text-center mb-1">POLICY PRIORITIES</p>
                        <PolicyRadarChart position={position as any} height={250} />
                        <ProvenanceBar sources={[
                          { label: 'Chapel Hill Expert Survey', url: 'https://www.chesdata.eu/', type: 'model' },
                        ]} />
                      </div>

                      {/* Compass position in context */}
                      <div className="brutalist-border p-3 bg-card">
                        <p className="text-[10px] font-mono font-bold text-muted-foreground text-center mb-1">
                          POLITICAL COMPASS
                          <span className="ml-1 text-primary">● = THIS POLITICIAN</span>
                        </p>
                        <PoliticalCompassChart
                          positions={compassPositions}
                          highlightId={id}
                          height={250}
                        />
                        <IdeologyLegend />
                        <ProvenanceBar sources={[
                          { label: 'Chapel Hill Expert Survey', url: 'https://www.chesdata.eu/', type: 'model' },
                          { label: 'Party family mapping', type: 'estimate' },
                        ]} />
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="brutalist-border p-4 bg-secondary/30 mb-4 text-xs font-mono text-muted-foreground">
                    <p>No defensible political-position estimate is available for this actor yet.</p>
                    <p className="mt-2">{orientationGapReason}</p>
                  </div>
                )}

                {/* Key policy positions + linked proposals */}
                {position.key_positions && Object.keys(position.key_positions).length > 0 && (
                  <div className="brutalist-border p-4 bg-card">
                    <p className="text-[10px] font-mono font-bold text-muted-foreground mb-2">KEY POLICY STANCES</p>
                    <KeyPositionsList positions={position.key_positions as Record<string, string>} />

                    <ProvenanceBar sources={[
                      { label: 'Party platform analysis', type: 'model' },
                      { label: 'Voting record inference', type: 'estimate' },
                    ]} />
                  </div>
                )}

              </section>
            )}

            {/* Close Associates Network */}
            {associates.length > 0 && (
              <section className="mb-8">
                <h2 className="text-xs font-mono font-bold text-muted-foreground mb-3 flex items-center gap-2">
                  <Users className="w-3 h-3" />
                  CLOSE ASSOCIATES · {associates.length} connections
                </h2>

                {(() => {
                  const domestic = associates.filter(a => a.is_domestic);
                  const international = associates.filter(a => !a.is_domestic);
                  const typeIcon = (type: string) => {
                    switch (type) {
                      case 'party_ally': return '🤝';
                      case 'coalition_partner': return '🏛️';
                      case 'committee_peer': return '📋';
                      case 'international_ally': return '🌍';
                      case 'mentor': return '🎓';
                      case 'rival': return '⚔️';
                      default: return '🔗';
                    }
                  };
                  const typeLabel = (type: string) => type.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

                  const renderAssociate = (a: typeof associates[0]) => (
                    <RouterLink
                      key={a.id}
                      to={`/actors/${a.associate_id}`}
                      className="flex items-center gap-2.5 p-2 rounded hover:bg-muted/50 transition-colors group"
                    >
                      {a.photo_url ? (
                        <img src={a.photo_url} alt={a.name} className="w-8 h-8 rounded-full object-cover flex-shrink-0 border border-border" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                      ) : (
                        <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center text-xs font-bold flex-shrink-0">
                          {a.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-medium group-hover:text-primary truncate">{a.name}</div>
                        <div className="text-[10px] font-mono text-muted-foreground truncate">
                          {a.party && <span className="mr-1">{a.party}</span>}
                          <span>{a.country_code}</span>
                          {a.role && <span className="ml-1">· {a.role.slice(0, 30)}</span>}
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-0.5 flex-shrink-0">
                        <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-muted">{typeIcon(a.relationship_type)} {typeLabel(a.relationship_type)}</span>
                        <div className="flex items-center gap-1">
                          <div className="w-12 h-1 bg-muted rounded-full overflow-hidden">
                            <div className="h-full bg-primary rounded-full" style={{ width: `${(a.strength / 10) * 100}%` }} />
                          </div>
                          <span className="text-[9px] font-mono text-muted-foreground">{a.strength}</span>
                        </div>
                      </div>
                    </RouterLink>
                  );

                  return (
                    <div>
                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                        {domestic.length > 0 && (
                          <div className="brutalist-border bg-card p-3">
                            <div className="flex items-center gap-1.5 mb-2">
                              <Handshake className="w-3 h-3 text-muted-foreground" />
                              <span className="text-[10px] font-mono font-bold text-muted-foreground">DOMESTIC ({domestic.length})</span>
                            </div>
                            <div className="space-y-0.5 max-h-[300px] overflow-y-auto">
                              {domestic.map(renderAssociate)}
                            </div>
                          </div>
                        )}
                        {international.length > 0 && (
                          <div className="brutalist-border bg-card p-3">
                            <div className="flex items-center gap-1.5 mb-2">
                              <Globe className="w-3 h-3 text-muted-foreground" />
                              <span className="text-[10px] font-mono font-bold text-muted-foreground">INTERNATIONAL ({international.length})</span>
                            </div>
                            <div className="space-y-0.5 max-h-[300px] overflow-y-auto">
                              {international.map(renderAssociate)}
                            </div>
                          </div>
                        )}
                      </div>
                      <ProvenanceBar sources={[
                        { label: 'EP group membership', url: 'https://www.europarl.europa.eu/meps/en/home', type: 'official' },
                        { label: 'Committee co-membership', type: 'fact' },
                        { label: 'Coalition analysis', type: 'model' },
                      ]} />
                    </div>
                  );
                })()}
              </section>
            )}

            {/* Financial Overview */}
            {finances && (
              <section className="mb-8">
                <h2 className="text-xs font-mono font-bold text-muted-foreground mb-3 flex items-center gap-2">
                  <DollarSign className="w-3 h-3" />
                  FINANCIAL OVERVIEW ({finances.declaration_year})
                </h2>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
                  <div className="brutalist-border p-3 bg-card">
                    <div className="text-lg font-extrabold tracking-tighter">{formatCurrency(finances.annual_salary)}</div>
                    <div className="text-[10px] font-mono text-muted-foreground uppercase">Annual Salary</div>
                    <SourceBadge label={finances.salary_source || 'Official record'} type="official" />
                  </div>
                  <div className="brutalist-border p-3 bg-card">
                    <div className="text-lg font-extrabold tracking-tighter">{formatCurrency(finances.side_income)}</div>
                    <div className="text-[10px] font-mono text-muted-foreground uppercase">Side Income</div>
                    <SourceBadge label="Declaration" type="official" />
                  </div>
                  <div className="brutalist-border p-3 bg-card">
                    <div className="text-lg font-extrabold tracking-tighter">{formatCurrency(finances.declared_assets)}</div>
                    <div className="text-[10px] font-mono text-muted-foreground uppercase">Declared Assets</div>
                    <SourceBadge label="Declaration" type="official" />
                  </div>
                  <div className="brutalist-border p-3 bg-card">
                    <div className="text-lg font-extrabold tracking-tighter">{formatCurrency(finances.property_value)}</div>
                    <div className="text-[10px] font-mono text-muted-foreground uppercase">Property</div>
                    <SourceBadge label="Declaration" type="official" />
                  </div>
                </div>
                <ProvenanceBar sources={[
                  ...(finances.salary_source ? [{ label: finances.salary_source, type: 'official' as const }] : []),
                  { label: 'EP transparency register', url: 'https://www.europarl.europa.eu/meps/en/declarations', type: 'official' },
                  { label: `Declaration year ${finances.declaration_year}`, type: 'fact' },
                ]} />
              </section>
            )}

            {/* Investment Portfolio */}
            {investments.length > 0 && (
              <section className="mb-8">
                <h2 className="text-xs font-mono font-bold text-muted-foreground mb-3 flex items-center gap-2">
                  <TrendingUp className="w-3 h-3" />
                  INVESTMENT PORTFOLIO · {investments.length} holdings · {formatCurrency(totalInvestmentValue)}
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-[1fr_200px] gap-4">
                  <div className="brutalist-border bg-card overflow-hidden">
                    <div className="max-h-[300px] overflow-y-auto">
                      <table className="w-full text-xs font-mono">
                        <thead className="sticky top-0 bg-card">
                          <tr className="border-b border-border">
                            <th className="text-left p-2 font-bold">COMPANY</th>
                            <th className="text-left p-2 font-bold">SECTOR</th>
                            <th className="text-right p-2 font-bold">VALUE</th>
                          </tr>
                        </thead>
                        <tbody>
                          {investments.map(inv => (
                            <tr key={inv.id} className="border-b border-border/50 hover:bg-muted/50">
                              <td className="p-2 font-medium flex items-center gap-1.5">
                                <Building2 className="w-3 h-3 text-muted-foreground flex-shrink-0" />
                                {inv.company_name}
                              </td>
                              <td className="p-2">
                                <span className="px-1.5 py-0.5 rounded text-[10px] bg-muted">{inv.sector || '—'}</span>
                              </td>
                              <td className="p-2 text-right font-bold">{formatCurrency(inv.estimated_value)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                  {sectorData.length > 1 && (
                    <div className="brutalist-border bg-card p-2">
                      <p className="text-[10px] font-mono font-bold text-muted-foreground text-center mb-1">BY SECTOR</p>
                      <ResponsiveContainer width="100%" height={180}>
                        <PieChart>
                          <Pie data={sectorData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={70} innerRadius={30}>
                            {sectorData.map((s, i) => (
                              <Cell key={i} fill={SECTOR_COLORS[s.name] || `hsl(${i * 60}, 40%, 45%)`} />
                            ))}
                          </Pie>
                          <Tooltip formatter={(v: number) => formatCurrency(v)} />
                        </PieChart>
                      </ResponsiveContainer>
                      <div className="space-y-1 px-1">
                        {sectorData.map((s, i) => (
                          <div key={s.name} className="flex items-center gap-1.5 text-[10px] font-mono">
                            <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: SECTOR_COLORS[s.name] || `hsl(${i * 60}, 40%, 45%)` }} />
                            <span className="truncate">{s.name}</span>
                            <span className="ml-auto text-muted-foreground">{((s.value / totalInvestmentValue) * 100).toFixed(0)}%</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
                <ProvenanceBar sources={[
                  { label: 'Declarations of financial interests', type: 'official' },
                  { label: 'EP transparency register', url: 'https://www.europarl.europa.eu/meps/en/declarations', type: 'official' },
                ]} />
              </section>
            )}

            {events.length > 0 && (
              <>
                <section className="mb-8">
                  <h2 className="text-xs font-mono font-bold text-muted-foreground mb-3 flex items-center gap-2">
                    <span className="inline-block w-3 h-3 rounded-full bg-accent" />
                    ANALYTICS
                  </h2>
                  <ActorCharts events={events} />
                  <ProvenanceBar sources={[
                    { label: 'Aggregated event data', type: 'fact' },
                    ...(wikipediaUrl ? [{ label: 'Wikipedia', url: wikipediaUrl, type: 'official' as const }] : []),
                  ]} />
                </section>
                <section className="mb-8">
                  <h2 className="text-xs font-mono font-bold text-muted-foreground mb-3 flex items-center gap-2">
                    <span className="inline-block w-3 h-3 rounded-full bg-primary" />
                    PROVENANCE LOG
                  </h2>
                  <ActorTimeline events={events} />
                  <ProvenanceBar sources={[
                    { label: 'Multi-source event tracking', type: 'fact' },
                    { label: 'EU Parliament records', url: 'https://www.europarl.europa.eu/', type: 'official' },
                  ]} />
                </section>
              </>
            )}

            {events.length === 0 && !wikipediaSummary && !finances && (
              <div className="brutalist-border p-6 bg-secondary text-center">
                <p className="font-mono text-sm text-muted-foreground">No events tracked yet for this politician.</p>
              </div>
            )}
          </div>

          <aside className="space-y-6">
            {/* Income summary card */}
            {finances && totalIncome > 0 && (
              <div className="brutalist-border p-4 bg-accent/5">
                <h3 className="font-mono text-xs font-bold mb-2 flex items-center gap-1.5">
                  <Briefcase className="w-3 h-3" /> INCOME SUMMARY
                </h3>
                <div className="space-y-2">
                  <div className="flex justify-between font-mono text-xs">
                    <span>Salary</span>
                    <span className="font-bold">{formatCurrency(finances.annual_salary)}</span>
                  </div>
                  {(finances.side_income || 0) > 0 && (
                    <div className="flex justify-between font-mono text-xs">
                      <span>Side income</span>
                      <span className="font-bold">{formatCurrency(finances.side_income)}</span>
                    </div>
                  )}
                  <div className="border-t border-border pt-1 flex justify-between font-mono text-xs">
                    <span className="font-bold">Total</span>
                    <span className="font-bold">{formatCurrency(totalIncome)}</span>
                  </div>
                  {investments.length > 0 && (
                    <div className="flex justify-between font-mono text-xs text-muted-foreground">
                      <span>Investment portfolio</span>
                      <span>{formatCurrency(totalInvestmentValue)}</span>
                    </div>
                  )}
                </div>
                <ProvenanceBar sources={[
                  { label: 'Financial declarations', type: 'official' },
                ]} />
              </div>
            )}

            {/* Infobox from Wikipedia */}
            {infobox && Object.keys(infobox).length > 0 && (
              <div className="brutalist-border p-4">
                <h3 className="font-mono text-xs font-bold mb-2">DETAILS</h3>
                <div className="space-y-1.5">
                  {Object.entries(infobox).map(([key, val]) => (
                    <div key={key} className="flex justify-between gap-2 font-mono text-xs">
                      <span className="text-muted-foreground capitalize">{key.replace(/_/g, ' ')}</span>
                      <span className="font-medium text-right max-w-[160px] truncate" title={val}>{val}</span>
                    </div>
                  ))}
                </div>
                <ProvenanceBar sources={[{ label: 'Wikipedia infobox', url: wikipediaUrl, type: 'official' }]} />
              </div>
            )}

            {actor.committees.length > 0 && (
              <div className="brutalist-border p-4">
                <h3 className="font-mono text-xs font-bold mb-2">COMMITTEES</h3>
                <div className="space-y-1">
                  {actor.committees.map((c) => (
                    <div key={c} className="font-mono text-xs bg-secondary px-2 py-1.5 brutalist-border">{c}</div>
                  ))}
                </div>
                <ProvenanceBar sources={[{ label: 'EP committee assignments', url: 'https://www.europarl.europa.eu/committees/en/home', type: 'official' }]} />
              </div>
            )}

            {actor.twitterHandle && (
              <div className="brutalist-border p-4">
                <h3 className="font-mono text-xs font-bold mb-2">SOCIAL MEDIA</h3>
                <a href={`https://x.com/${actor.twitterHandle?.replace('@', '')}`} target="_blank" rel="noopener noreferrer" className="font-mono text-sm text-sky-600 dark:text-sky-400 hover:underline flex items-center gap-1">
                  <ExternalLink className="w-3 h-3" /> {actor.twitterHandle}
                </a>
                <ProvenanceBar sources={[
                  { label: 'X / Twitter', url: `https://x.com/${actor.twitterHandle?.replace('@', '')}`, type: 'official' },
                ]} />
              </div>
            )}

            <div className="brutalist-border p-4">
              <h3 className="font-mono text-xs font-bold mb-2">RECORD SOURCES</h3>
              <div className="space-y-2">
                <div className="flex justify-between gap-3 font-mono text-xs">
                  <span>Ingestion source</span>
                  <span className="font-bold text-right">{getDataSourceLabel(actor.dataSource)}</span>
                </div>
                <div className="flex justify-between gap-3 font-mono text-xs">
                  <span>Primary host</span>
                  <span className="font-bold text-right">{recordHost || '—'}</span>
                </div>
                <div className="flex justify-between gap-3 font-mono text-xs">
                  <span>Attributed fields</span>
                  <span className="font-bold text-right">{attributedFieldCount}</span>
                </div>
              </div>
              <div className="mt-3 space-y-2">
                {actor.sourceUrl && (
                  <a
                    href={actor.sourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs font-mono text-accent hover:underline flex items-center gap-1.5"
                  >
                    <ExternalLink className="w-3 h-3" />
                    Open source record
                  </a>
                )}
                {attributionSources.slice(0, 3).map((source) => (
                  <div key={`${source.label}-${source.url || 'plain'}`} className="text-[10px] font-mono text-muted-foreground">
                    <span className="font-bold text-foreground">{source.label}</span>
                    <span> · {source.fieldCount} fields</span>
                    {source.fields.length > 0 && (
                      <span> · {source.fields.slice(0, 4).join(', ')}</span>
                    )}
                  </div>
                ))}
              </div>
              <ProvenanceBar sources={[
                ...(actor.sourceUrl ? [{ label: recordHost || 'Primary source', url: actor.sourceUrl, type: 'official' as const }] : []),
                ...attributionSources.slice(0, 2).map((source) => ({
                  label: source.label,
                  url: source.url,
                  type: (source.type === 'official_record' ? 'official' : 'fact') as 'official' | 'fact',
                })),
              ]} />
            </div>

            <div className="brutalist-border p-4">
              <h3 className="font-mono text-xs font-bold mb-2">COVERAGE SNAPSHOT</h3>
              <div className="grid grid-cols-2 gap-x-3 gap-y-2">
                {actorCoverage.map((item) => (
                  <div key={item.label} className="flex items-center justify-between gap-2 font-mono text-[10px]">
                    <span className="text-muted-foreground">{item.label}</span>
                    <span className={item.value ? 'font-bold text-emerald-500' : 'font-bold text-muted-foreground'}>
                      {item.value ? 'YES' : '—'}
                    </span>
                  </div>
                ))}
              </div>
              <ProvenanceBar sources={[
                { label: 'Actor record coverage', type: 'fact' },
              ]} />
            </div>

            <div className="brutalist-border p-4">
              <h3 className="font-mono text-xs font-bold mb-2">TRANSPARENCY</h3>
              <div className="space-y-2">
                <div className="flex justify-between font-mono text-xs">
                  <span>Events tracked</span>
                  <span className="font-bold">{events.length}</span>
                </div>
                <div className="flex justify-between font-mono text-xs">
                  <span>Investments disclosed</span>
                  <span className="font-bold">{investments.length}</span>
                </div>
                <div className="flex justify-between font-mono text-xs">
                  <span>Country proposals</span>
                  <span className="font-bold">{countryProposals.length}</span>
                </div>
                <div className="flex justify-between font-mono text-xs">
                  <span>Wikipedia enriched</span>
                  <span className="font-bold">{actor.enrichedAt || wikipediaFallback ? '✓' : '—'}</span>
                </div>
              </div>
              <ProvenanceBar sources={[
                { label: 'Platform aggregation', type: 'fact' },
                ...(wikipediaUrl ? [{ label: 'Wikipedia', url: wikipediaUrl, type: 'official' as const }] : []),
              ]} />
            </div>

            <div className="font-mono text-xs text-muted-foreground space-y-1">
              <div>rev: {actor.revisionId}</div>
              <div>updated: {new Date(actor.updatedAt).toLocaleDateString()}</div>
              {actor.birthYear && <div>born: {actor.birthYear}</div>}
              {actor.inOfficeSince && <div>in office since: {new Date(actor.inOfficeSince).toLocaleDateString()}</div>}
              {actor.enrichedAt && <div>enriched: {new Date(actor.enrichedAt).toLocaleDateString()}</div>}
            </div>
          </aside>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
};

export default ActorDetail;
