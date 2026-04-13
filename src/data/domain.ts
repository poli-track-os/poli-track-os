export interface ActorEvent {
  id: string;
  actorId: string;
  hash: string;
  timestamp: string;
  type:
    | 'vote'
    | 'speech'
    | 'committee_join'
    | 'committee_leave'
    | 'election'
    | 'appointment'
    | 'resignation'
    | 'scandal'
    | 'policy_change'
    | 'party_switch'
    | 'legislation_sponsored'
    | 'foreign_meeting'
    | 'lobbying_meeting'
    | 'corporate_event'
    | 'financial_disclosure'
    | 'social_media'
    | 'travel'
    | 'donation_received'
    | 'public_statement'
    | 'court_case'
    | 'media_appearance';
  title: string;
  description: string;
  diff?: { removed?: string; added?: string };
  evidenceCount: number;
  sourceUrl?: string;
  source?:
    | 'twitter'
    | 'official_record'
    | 'news'
    | 'financial_filing'
    | 'parliamentary_record'
    | 'court_filing'
    | 'lobby_register';
  sourceHandle?: string;
  sentiment?: 'positive' | 'negative' | 'neutral';
  entities?: string[];
  /** 1 = official primary, 2 = authoritative secondary, 3 = derived/heuristic, 4 = low-confidence. */
  trustLevel?: number;
}

export interface ChangeLogEntry {
  id: string;
  timestamp: string;
  type: 'proposal_added' | 'revision' | 'correction' | 'ingestion' | 'forecast_update';
  title: string;
  subject: string;
  subjectType: 'proposal' | 'actor' | 'legal_document';
  subjectId: string;
  revisionId: string;
  evidenceCount: number;
  summary: string;
  countryId?: string;
}

export interface Actor {
  id: string;
  name: string;
  partyId: string;
  party: string;
  partyName?: string;
  partyAbbreviation?: string;
  canton: string;
  cityId: string;
  countryId: string;
  role: string;
  jurisdiction: 'federal' | 'state' | 'city';
  committees: string[];
  recentVotes: { date: string; proposal: string; vote: 'yes' | 'no' | 'abstain' }[];
  revisionId: string;
  updatedAt: string;
  photoUrl?: string;
  birthYear?: number;
  inOfficeSince?: string;
  twitterHandle?: string;
  wikipediaUrl?: string;
  wikipediaSummary?: string;
  biography?: string;
  wikipediaImageUrl?: string;
  wikipediaData?: Record<string, unknown>;
  enrichedAt?: string;
  dataSource?: string;
  sourceUrl?: string;
  sourceAttribution?: Record<string, unknown>;
}

export const typeLabels: Record<ChangeLogEntry['type'], string> = {
  proposal_added: 'NEW',
  revision: 'REV',
  correction: 'COR',
  ingestion: 'ING',
  forecast_update: 'FCT',
};

export const eventTypeLabels: Record<ActorEvent['type'], string> = {
  vote: 'VOTE',
  speech: 'SPCH',
  committee_join: 'JOIN',
  committee_leave: 'LEFT',
  election: 'ELCT',
  appointment: 'APPT',
  resignation: 'RSGN',
  scandal: 'SCAN',
  policy_change: 'PLCY',
  party_switch: 'SWCH',
  legislation_sponsored: 'LGSL',
  foreign_meeting: 'FRGN',
  lobbying_meeting: 'LOBY',
  corporate_event: 'CORP',
  financial_disclosure: 'FINC',
  social_media: 'TWEET',
  travel: 'TRVL',
  donation_received: 'DONA',
  public_statement: 'STMT',
  court_case: 'CORT',
  media_appearance: 'MDIA',
};

export const sourceLabels: Record<NonNullable<ActorEvent['source']>, string> = {
  twitter: 'X',
  official_record: 'OFFICIAL',
  news: 'NEWS',
  financial_filing: 'FILING',
  parliamentary_record: 'PARLIAMENT',
  court_filing: 'COURT',
  lobby_register: 'LOBBY REG',
};

export const sourceColors: Record<NonNullable<ActorEvent['source']>, string> = {
  twitter: 'bg-sky-500/20 text-sky-700 dark:text-sky-300',
  official_record: 'bg-emerald-500/20 text-emerald-700 dark:text-emerald-300',
  news: 'bg-amber-500/20 text-amber-700 dark:text-amber-300',
  financial_filing: 'bg-green-500/20 text-green-700 dark:text-green-300',
  parliamentary_record: 'bg-blue-500/20 text-blue-700 dark:text-blue-300',
  court_filing: 'bg-red-500/20 text-red-700 dark:text-red-300',
  lobby_register: 'bg-purple-500/20 text-purple-700 dark:text-purple-300',
};
