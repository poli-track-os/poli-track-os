#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { createClient } from '@supabase/supabase-js';

type Args = {
  apply: boolean;
  expectProjectRef: string | null;
};

type SourceDefinition = {
  sourceType:
    | 'assemblee_nationale'
    | 'bundestag_dip'
    | 'camera_atti'
    | 'chd_lu'
    | 'cyprus_budget_archive'
    | 'dz_rs'
    | 'eduskunta'
    | 'eseimas_lt'
    | 'folketinget'
    | 'hellenic_parliament'
    | 'hungary_budget_archive'
    | 'lachambre_be'
    | 'malta_budget_archive'
    | 'nrsr_sk'
    | 'parlament_at'
    | 'parliament_bg'
    | 'senato_ddl'
    | 'senat_ro'
    | 'psp_cz'
    | 'riigikogu'
    | 'parlamento_pt'
    | 'congreso_es'
    | 'oireachtas'
    | 'sejm'
    | 'riksdag'
    | 'sabor_hr'
    | 'saeima_lv'
    | 'tweedekamer';
  name: string;
  baseUrl: string;
  description: string;
};

const NATIONAL_PROPOSAL_SOURCES: SourceDefinition[] = [
  {
    sourceType: 'assemblee_nationale',
    name: 'Assemblee Nationale Open Data',
    baseUrl: 'https://www.assemblee-nationale.fr/dyn/17/dossiers',
    description: 'French Assemblee nationale legislative dossiers and official notice JSON pages.',
  },
  {
    sourceType: 'bundestag_dip',
    name: 'Bundestag DIP API',
    baseUrl: 'https://search.dip.bundestag.de/api/v1/vorgang',
    description: 'German Bundestag DIP API for legislative Vorgange.',
  },
  {
    sourceType: 'camera_atti',
    name: 'Camera Open Data',
    baseUrl: 'https://dati.camera.it/sparql',
    description: 'Italian Camera dei deputati legislative acts from the official SPARQL endpoint and RDF act pages.',
  },
  {
    sourceType: 'chd_lu',
    name: 'Chambre des Deputes Open Data',
    baseUrl: 'https://data.public.lu/fr/datasets/r/c5a74c97-a5fa-42ec-90d7-a832ab7410b2',
    description: 'Luxembourg Chamber law proposals from the official data.public.lu bulk dataset.',
  },
  {
    sourceType: 'cyprus_budget_archive',
    name: 'Cyprus Budget Law Archive',
    baseUrl: 'https://www.parliament.cy/el/%CE%BD%CE%BF%CE%BC%CE%BF%CE%B8%CE%B5%CF%84%CE%B9%CE%BA%CF%8C-%CE%AD%CF%81%CE%B3%CE%BF/%CE%BA%CE%B1%CF%84%CE%AC%CE%B8%CE%B5%CF%83%CE%B7-%CE%BD%CE%BF%CE%BC%CE%BF%CF%83%CF%87%CE%B5%CE%B4%CE%AF%CF%89%CE%BD-%CE%BA%CE%B1%CE%B9-%CE%B5%CE%B3%CE%B3%CF%81%CE%AC%CF%86%CF%89%CE%BD',
    description: 'Curated official Cyprus House budget-law deposit pages for annual state budget bills.',
  },
  {
    sourceType: 'lachambre_be',
    name: 'La Chambre XML Corpus',
    baseUrl: 'https://www.lachambre.be/FLWB/xml/',
    description: 'Belgian Chamber legislative dossiers from the official XML corpus by legislature.',
  },
  {
    sourceType: 'psp_cz',
    name: 'PSP CZ Prints',
    baseUrl: 'https://www.psp.cz/sqw/tisky.sqw?F=H&N=1&O=10&PT=D',
    description: 'Czech Chamber current-term law proposals from the official print list and history pages.',
  },
  {
    sourceType: 'dz_rs',
    name: 'Drzavni zbor Open Data',
    baseUrl: 'https://fotogalerija.dz-rs.si/datoteke/opendata/PZ.XML',
    description: 'Slovenian Drzavni zbor legislative proposals from the official XML bulk files and RSS feed.',
  },
  {
    sourceType: 'parliament_bg',
    name: 'Bulgarian National Assembly API',
    baseUrl: 'https://www.parliament.bg/api/v1/fn-bills',
    description: 'Bulgarian National Assembly bills from the official JSON search and bill-detail API.',
  },
  {
    sourceType: 'senato_ddl',
    name: 'Senato Open Data DDL',
    baseUrl: 'https://dati.senato.it/sparql',
    description: 'Italian draft laws from the official Senato open-data SPARQL endpoint, keeping only initial presentato phases.',
  },
  {
    sourceType: 'senat_ro',
    name: 'Senat Romania Legislative Search',
    baseUrl: 'https://www.senat.ro/Legis/Lista.aspx',
    description: 'Romanian Senate legislative proposals from the official year-filtered search and detail pages.',
  },
  {
    sourceType: 'malta_budget_archive',
    name: 'Malta Budget Bill Archive',
    baseUrl: 'https://parlament.mt/14th-leg/bills/bill-155-budget-measures-implementation-bill/',
    description: 'Curated official Parliament of Malta budget-measures bill and act pages for annual budget legislation.',
  },
  {
    sourceType: 'eduskunta',
    name: 'Eduskunta Open Data',
    baseUrl: 'https://avoindata.eduskunta.fi/api/v1/vaski/asiakirjatyyppinimi?filter=Hallituksen%20esitys',
    description: 'Finnish Parliament government proposals from the official Eduskunta open-data REST and XML detail feed.',
  },
  {
    sourceType: 'eseimas_lt',
    name: 'e-Seimas JSF Search',
    baseUrl: 'https://e-seimas.lrs.lt/portal/prefilledSearch/lt/d228346c-54b5-41cd-9eca-8044654a0f7f',
    description: 'Lithuanian Seimas law projects from the official e-Seimas prefilled JSF search and detail pages.',
  },
  {
    sourceType: 'folketinget',
    name: 'Folketing OData',
    baseUrl: 'https://oda.ft.dk/api/Sag',
    description: 'Danish Folketing OData bills (Sag), sponsors (SagAktør/Aktør), and status metadata.',
  },
  {
    sourceType: 'hellenic_parliament',
    name: 'Hellenic Parliament Legislative Pages',
    baseUrl: 'https://www.hellenicparliament.gr/Nomothetiko-Ergo/Katatethenta-Nomosxedia',
    description: 'Greek parliamentary bills from the official submitted, committee-stage, enacted, and law detail pages.',
  },
  {
    sourceType: 'hungary_budget_archive',
    name: 'Hungary Budget Bill Archive',
    baseUrl: 'https://www.parlament.hu/irom42/11864/11864.pdf',
    description: 'Curated official Orszaggyules central-budget bill PDFs and metadata for annual Hungarian budget legislation.',
  },
  {
    sourceType: 'nrsr_sk',
    name: 'NRSR Legislative Search',
    baseUrl: 'https://www.nrsr.sk/web/Default.aspx?sid=zakony/sslp',
    description: 'Slovak National Council legislative proposals from the official legislative search and detail pages.',
  },
  {
    sourceType: 'parlament_at',
    name: 'Parlament Österreich Open Data',
    baseUrl: 'https://www.parlament.gv.at/Filter/api/filter/data/101?js=eval&showAll=true',
    description: 'Austrian Nationalrat government bills from the official open-data filter endpoint.',
  },
  {
    sourceType: 'riigikogu',
    name: 'Riigikogu Draft API',
    baseUrl: 'https://api.riigikogu.ee/api/volumes/drafts',
    description: 'Estonian Riigikogu draft-bill list API for bills (SE) with title, stage, status, and dates.',
  },
  {
    sourceType: 'parlamento_pt',
    name: 'Parlamento PT Open Data',
    baseUrl: 'https://api.votoaberto.org/api/v1/iniciativas/',
    description: 'Portuguese Assembleia da Republica initiatives from api.votoaberto.org.',
  },
  {
    sourceType: 'congreso_es',
    name: 'Congreso Open Data',
    baseUrl: 'https://www.congreso.es/webpublica/opendata/iniciativas/',
    description: 'Spanish Congreso de los Diputados legislative initiatives from official open-data JSON listings.',
  },
  {
    sourceType: 'oireachtas',
    name: 'Oireachtas API',
    baseUrl: 'https://api.oireachtas.ie/v1/legislation',
    description: 'Irish Oireachtas legislation API.',
  },
  {
    sourceType: 'sejm',
    name: 'Sejm API',
    baseUrl: 'https://api.sejm.gov.pl/sejm/term10/prints',
    description: 'Polish Sejm print notices from the official API.',
  },
  {
    sourceType: 'riksdag',
    name: 'Riksdag Open Data',
    baseUrl: 'https://data.riksdagen.se/dokumentlista/',
    description: 'Swedish Riksdag proposition documents from the official open-data API.',
  },
  {
    sourceType: 'sabor_hr',
    name: 'Sabor e-doc',
    baseUrl: 'https://edoc.sabor.hr/Akti.aspx',
    description: 'Croatian Sabor legislative proposals from the official e-doc list grid and act detail pages.',
  },
  {
    sourceType: 'saeima_lv',
    name: 'Saeima LIVS Registry',
    baseUrl: 'https://titania.saeima.lv/LIVS14/saeimalivs14.nsf/webAll?OpenView',
    description: 'Latvian Saeima legislative proposals from the official LIVS registry list and dossier pages.',
  },
  {
    sourceType: 'tweedekamer',
    name: 'Tweede Kamer Open Data',
    baseUrl: 'https://gegevensmagazijn.tweedekamer.nl/OData/v4/2.0/Zaak',
    description: 'Dutch Tweede Kamer legislative cases from the official OData endpoint.',
  },
];

function parseArgs(argv: string[]): Args {
  const args: Args = { apply: false, expectProjectRef: null };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === '--apply') {
      args.apply = true;
      continue;
    }
    if (token === '--expect-project-ref') {
      const next = argv[++index];
      if (!next) throw new Error('Missing value for --expect-project-ref');
      args.expectProjectRef = next.trim();
      continue;
    }
    if (token === '--help' || token === '-h') {
      console.log('scripts/backfill-national-proposal-data-sources.ts [--apply] [--expect-project-ref ref]');
      process.exit(0);
    }
    throw new Error(`Unknown argument: ${token}`);
  }
  return args;
}

function loadEnvFile(filePath: string, shellEnvKeys: Set<string>, overwrite = false) {
  if (!fs.existsSync(filePath)) return;
  const content = fs.readFileSync(filePath, 'utf8');
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const separator = line.indexOf('=');
    if (separator === -1) continue;
    const key = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();
    if (!key) continue;
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (shellEnvKeys.has(key)) continue;
    if (!overwrite && process.env[key]) continue;
    process.env[key] = value;
  }
}

function loadLocalEnv() {
  const root = process.cwd();
  const shellEnvKeys = new Set(Object.keys(process.env));
  loadEnvFile(path.join(root, '.env'), shellEnvKeys);
  loadEnvFile(path.join(root, '.env.local'), shellEnvKeys, true);
}

function getSupabaseClient() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  if (!url) throw new Error('Missing SUPABASE_URL or VITE_SUPABASE_URL');
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  if (!key) throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY or VITE_SUPABASE_PUBLISHABLE_KEY');
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

async function main() {
  loadLocalEnv();
  const args = parseArgs(process.argv.slice(2));
  const supabase = getSupabaseClient();

  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
  const projectRef = (() => { try { return new URL(url).hostname.split('.')[0]; } catch { return null; } })();
  if (args.expectProjectRef && projectRef !== args.expectProjectRef) {
    throw new Error(`Resolved project ref ${projectRef ?? 'unknown'} does not match expected ${args.expectProjectRef}`);
  }

  const { data: existingRows, error: existingError } = await supabase
    .from('data_sources')
    .select('id, source_type, total_records, base_url, description, name')
    .in('source_type', NATIONAL_PROPOSAL_SOURCES.map((source) => source.sourceType));
  if (existingError) throw existingError;

  const existingByType = new Map(existingRows?.map((row) => [row.source_type, row]) ?? []);
  const summary: Array<Record<string, unknown>> = [];

  for (const source of NATIONAL_PROPOSAL_SOURCES) {
    const { count, error: countError } = await supabase
      .from('proposals')
      .select('id', { count: 'exact', head: true })
      .eq('data_source', source.sourceType);
    if (countError) throw countError;

    const existing = existingByType.get(source.sourceType);
    const nextRow = {
      name: source.name,
      source_type: source.sourceType,
      base_url: source.baseUrl,
      description: source.description,
      total_records: count ?? 0,
      last_synced_at: new Date().toISOString(),
      is_active: true,
    };

    if (args.apply) {
      if (existing) {
        const { error } = await supabase.from('data_sources').update(nextRow).eq('id', existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('data_sources').insert(nextRow);
        if (error) throw error;
      }
    }

    summary.push({
      source_type: source.sourceType,
      total_records: count ?? 0,
      action: existing ? 'update' : 'insert',
    });
  }

  console.log(JSON.stringify({ apply: args.apply, summary }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
