/**
 * Pure helpers for ingesting French Assemblée nationale proposals from the
 * nosdeputes.fr API. No I/O, no Supabase — just response parsing and row
 * construction.
 *
 * nosdeputes.fr API docs:
 *   https://github.com/regardscitoyens/nosdeputes.fr/blob/master/doc/api.md
 *
 * Data is CC-BY-SA. Attribution required.
 */

export interface NosDeputesTexteloi {
  texteloi: {
    id: string;
    titre: string;
    type?: string;
    type_details?: string;
    categorie?: string;
    date?: string;
    source?: string;
    signataires?: string;
    legislature?: string;
    id_dossier_an?: string;
    numero?: string;
  };
}

export interface NosDeputesSearchResult {
  document_type: string;
  document_id: number;
  document_url: string;
}

export interface NosDeputesSearchResponse {
  start?: number;
  end?: number;
  last_result?: number;
  results?: NosDeputesSearchResult[];
}

export interface NosDeputesDeputeDocument {
  document: {
    id?: string | number;
    titre?: string;
    date?: string;
    url?: string;
    type?: string;
    auteurs?: string;
  };
}

export interface NosDeputesDepute {
  depute: {
    id: number;
    nom: string;
    nom_de_famille: string;
    prenom: string;
    groupe_sigle?: string;
    parti_ratt_financier?: string;
    slug: string;
    url_nosdeputes?: string;
    num_deptmt?: string;
    textes_de_loi?: NosDeputesDeputeDocument[];
    propositions_ecrites?: NosDeputesDeputeDocument[];
    rapports?: NosDeputesDeputeDocument[];
  };
}

export interface AssembleeOfficialNotice {
  uid?: string;
  legislature?: string;
  denominationStructurelle?: string;
  cycleDeVie?: {
    chrono?: {
      dateCreation?: string;
      dateDepot?: string;
    };
  };
  titres?: {
    titrePrincipal?: string;
    titrePrincipalCourt?: string;
  };
  classification?: {
    type?: {
      libelle?: string;
    };
    statutAdoption?: {
      libelle?: string;
    };
  };
  auteurs?: {
    auteur?:
      | {
          acteur?: {
            acteurRef?: string;
          };
        }
      | Array<{
          acteur?: {
            acteurRef?: string;
          };
        }>;
  };
  coSignataires?: {
    coSignataire?: Array<{
      acteur?: {
        acteurRef?: string;
      };
    }>;
  };
}

const TYPE_TO_PROPOSAL_TYPE: Record<string, string> = {
  'proposition de loi': 'bill',
  'projet de loi': 'bill',
  'proposition de résolution': 'resolution',
  'rapport': 'report',
};

const TITLE_TO_POLICY: Array<[RegExp, string]> = [
  [/énergie|électricité|gaz|renouvelable|nucléaire|émission|climat|carbone|energy|electricity/i, 'energy'],
  [/santé|médecine|pharmaceut|vaccin|hôpital|maladie|health/i, 'health'],
  [/asile|migration|frontière|immigration|réfugié/i, 'migration'],
  [/défense|militaire|armement|sécurité|defence|defense/i, 'defence'],
  [/données|numérique|cyber|digital|intelligence artificielle|data/i, 'digital'],
  [/agricul|alimenta|pêche|agriculture/i, 'agriculture'],
  [/commerce|douane|tarif|trade/i, 'trade'],
  [/financ|bancaire|monétaire|fiscal|budget|impôt|taxe/i, 'finance'],
  [/transport|aviation|ferroviaire|maritime|route/i, 'transport'],
  [/environnement|biodiversité|pollution|déchet|eau|nature/i, 'environment'],
  [/emploi|travail|social|retraite|labour/i, 'labour'],
  [/justice|judiciaire|pénal|tribunal/i, 'justice'],
  [/éducation|école|université|recherche|education/i, 'education'],
];

function detectPolicyArea(title: string): string | null {
  for (const [re, area] of TITLE_TO_POLICY) {
    if (re.test(title)) return area;
  }
  return null;
}

function mapOfficialAssembleeStatus(label: string | undefined) {
  const normalized = (label ?? '').toLowerCase();
  if (normalized.includes('adopt')) return 'adopted';
  if (normalized.includes('rejet')) return 'rejected';
  if (normalized.includes('retir')) return 'withdrawn';
  return 'consultation';
}

/**
 * Build a proposals-table row from a nosdeputes.fr Texteloi document.
 *
 * @param entry - A single Texteloi from the nosdeputes.fr API.
 * @returns Proposal row or null if insufficient data.
 */
export function buildProposalFromTexteloi(entry: NosDeputesTexteloi): {
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
  const doc = entry.texteloi;
  if (!doc.titre || !doc.id) return null;

  const sponsors: string[] = [];
  if (doc.signataires) {
    const cleaned = doc.signataires
      .replace(/\s+Auteur\b/gi, '')
      .replace(/\s+Co-signataire\b/gi, '');
    const parts = cleaned.split(/,\s*/);
    for (const a of parts.slice(0, 5)) {
      const trimmed = a.trim();
      if (trimmed) sponsors.push(trimmed);
    }
  }

  const typeRaw = doc.type?.toLowerCase() ?? '';
  const proposalType = TYPE_TO_PROPOSAL_TYPE[typeRaw] ?? 'bill';

  const sourceUrl = doc.source
    || `https://www.assemblee-nationale.fr/${doc.legislature}/propositions/pion${doc.numero}.asp`;

  return {
    title: doc.titre.slice(0, 500),
    official_title: doc.titre,
    status: 'consultation',
    proposal_type: proposalType,
    jurisdiction: 'federal',
    country_code: 'FR',
    country_name: 'France',
    vote_date: null,
    submitted_date: doc.date ?? new Date().toISOString().slice(0, 10),
    sponsors,
    affected_laws: [],
    evidence_count: 1,
    summary: doc.titre,
    policy_area: detectPolicyArea(doc.titre),
    source_url: sourceUrl,
    data_source: 'assemblee_nationale',
  };
}

/**
 * Build a proposals-table row from a deputy's legislative text.
 * Used when iterating over per-deputy activity.
 *
 * @param doc - A texte_de_loi from a deputy's profile.
 * @param deputeName - Full name of the deputy.
 * @param groupeSigle - Short name of the deputy's political group.
 * @returns Proposal row or null.
 */
export function buildProposalFromDeputeTexte(
  doc: NosDeputesDeputeDocument,
  deputeName: string,
  groupeSigle: string | undefined,
): {
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
  const titre = doc.document.titre;
  const url = doc.document.url;
  if (!titre || !url) return null;

  const sponsor = groupeSigle ? `${deputeName} (${groupeSigle})` : deputeName;

  return {
    title: titre.slice(0, 500),
    official_title: titre,
    status: 'consultation',
    proposal_type: 'bill',
    jurisdiction: 'federal',
    country_code: 'FR',
    country_name: 'France',
    vote_date: null,
    submitted_date: doc.document.date ?? new Date().toISOString().slice(0, 10),
    sponsors: [sponsor],
    affected_laws: [],
    evidence_count: 1,
    summary: titre,
    policy_area: detectPolicyArea(titre),
    source_url: url,
    data_source: 'assemblee_nationale',
  };
}

export function buildProposalFromOfficialNotice(
  notice: AssembleeOfficialNotice,
  sourceUrl: string,
): {
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
  const officialTitle = notice.titres?.titrePrincipal?.trim();
  const title = notice.titres?.titrePrincipalCourt?.trim() || officialTitle;
  if (!title || !notice.uid) return null;

  const authorEntries = Array.isArray(notice.auteurs?.auteur)
    ? notice.auteurs?.auteur
    : notice.auteurs?.auteur
      ? [notice.auteurs.auteur]
      : [];

  const sponsors = new Set<string>();
  for (const author of authorEntries) {
    const actorRef = author.acteur?.acteurRef?.trim();
    if (actorRef) sponsors.add(actorRef);
  }
  for (const signer of notice.coSignataires?.coSignataire ?? []) {
    const actorRef = signer.acteur?.acteurRef?.trim();
    if (actorRef) sponsors.add(actorRef);
  }

  const rawType = notice.classification?.type?.libelle || notice.denominationStructurelle || '';
  const proposalType = TYPE_TO_PROPOSAL_TYPE[rawType.toLowerCase()] ?? (rawType.toLowerCase().includes('résolution') ? 'resolution' : 'bill');
  const submittedDate =
    notice.cycleDeVie?.chrono?.dateDepot?.slice(0, 10) ||
    notice.cycleDeVie?.chrono?.dateCreation?.slice(0, 10) ||
    new Date().toISOString().slice(0, 10);

  return {
    title: title.slice(0, 500),
    official_title: officialTitle || title,
    status: mapOfficialAssembleeStatus(notice.classification?.statutAdoption?.libelle),
    proposal_type: proposalType,
    jurisdiction: 'federal',
    country_code: 'FR',
    country_name: 'France',
    vote_date: null,
    submitted_date: submittedDate,
    sponsors: [...sponsors].slice(0, 50),
    affected_laws: [],
    evidence_count: 1,
    summary: officialTitle || title,
    policy_area: detectPolicyArea(officialTitle || title),
    source_url: sourceUrl,
    data_source: 'assemblee_nationale',
  };
}
