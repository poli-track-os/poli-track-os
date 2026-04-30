// GET /functions/v1/influence
// GET /functions/v1/influence/org/{id}
// GET /functions/v1/influence/person/{id}
// GET /functions/v1/influence/country/{code}
// GET /functions/v1/influence/network?seed={uuid}
//
// Read API for the global influence registry. This function intentionally
// filters sensitive affiliation rows itself because Edge functions use the
// service-role key and therefore bypass table RLS.

import { handle, ok, fail, intParam, type EnvelopeContext, type ProvenanceEntry } from "../_shared/envelope.ts";

type MoneyRow = {
  id: string;
  payer_client_id: string | null;
  recipient_actor_id: string | null;
  recipient_company_id: string | null;
  money_type: string;
  amount_low: number | null;
  amount_high: number | null;
  amount_exact: number | null;
  currency: string;
  data_source: string;
  trust_level: number | null;
};

type ClientRow = {
  id: string;
  name: string;
  country_code: string | null;
  principal_country_code: string | null;
  sector: string | null;
  is_foreign_principal: boolean;
};

type ContactRow = {
  id: string;
  target_politician_id: string | null;
  target_actor_id: string | null;
  target_name: string | null;
  target_institution: string | null;
  target_country_code: string | null;
  client_id: string | null;
  contact_date: string | null;
  subject: string | null;
  data_source: string;
  trust_level: number | null;
};

function stripPrefix(pathname: string): string {
  return pathname
    .replace(/^\/functions\/v1\/influence/, "")
    .replace(/^\/influence/, "")
    .replace(/\/+$/, "") || "/";
}

function amount(row: Pick<MoneyRow, "amount_exact" | "amount_high" | "amount_low">): number {
  return Number(row.amount_exact ?? row.amount_high ?? row.amount_low ?? 0);
}

function normalizeSource(value: string | null) {
  return value?.trim() || null;
}

function pushCount(map: Map<string, { name: string; count: number }>, key: string | null | undefined, label?: string | null) {
  const clean = key?.trim();
  if (!clean) return;
  const existing = map.get(clean) || { name: label || clean, count: 0 };
  existing.count += 1;
  map.set(clean, existing);
}

function provenance(): ProvenanceEntry[] {
  return [
    { kind: "influence_filings", data_source: "mixed", trust_level: 2 },
    { kind: "influence_money", data_source: "mixed", trust_level: 2 },
    { kind: "influence_contacts", data_source: "mixed", trust_level: 2 },
  ];
}

async function handleOverview(ctx: EnvelopeContext) {
  const { supabase, url } = ctx;
  const country = url.searchParams.get("country")?.toUpperCase() || null;
  const principalCountry = url.searchParams.get("principal_country")?.toUpperCase() || null;
  const source = normalizeSource(url.searchParams.get("source"));
  const sector = normalizeSource(url.searchParams.get("sector"));
  const institution = normalizeSource(url.searchParams.get("target_institution"));
  const evidenceMax = intParam(url, "evidence", 4);
  const minAmount = Number(url.searchParams.get("min_amount") || 0);
  const maxAmountRaw = url.searchParams.get("max_amount");
  const maxAmount = maxAmountRaw ? Number(maxAmountRaw) : null;

  let clientsQ = supabase
    .from("influence_clients")
    .select("id, name, country_code, principal_country_code, sector, is_foreign_principal")
    .limit(2000);
  if (country) clientsQ = clientsQ.eq("country_code", country);
  if (principalCountry) clientsQ = clientsQ.eq("principal_country_code", principalCountry);
  if (sector) clientsQ = clientsQ.ilike("sector", `%${sector}%`);

  let moneyQ = supabase
    .from("influence_money")
    .select("id, payer_client_id, recipient_actor_id, recipient_company_id, money_type, amount_low, amount_high, amount_exact, currency, data_source, trust_level")
    .limit(5000);
  if (source) moneyQ = moneyQ.eq("data_source", source);
  moneyQ = moneyQ.lte("trust_level", evidenceMax);

  let contactsQ = supabase
    .from("influence_contacts")
    .select("id, target_politician_id, target_actor_id, target_name, target_institution, target_country_code, client_id, contact_date, subject, data_source, trust_level")
    .limit(3000);
  if (country) contactsQ = contactsQ.eq("target_country_code", country);
  if (source) contactsQ = contactsQ.eq("data_source", source);
  if (institution) contactsQ = contactsQ.ilike("target_institution", `%${institution}%`);
  contactsQ = contactsQ.lte("trust_level", evidenceMax);

  const [clientsRes, moneyRes, contactsRes, overviewRes] = await Promise.all([
    clientsQ,
    moneyQ,
    contactsQ,
    supabase.from("influence_registry_overview").select("*").maybeSingle(),
  ]);

  if (clientsRes.error) return fail("QUERY_FAILED", clientsRes.error.message, 500);
  if (moneyRes.error) return fail("QUERY_FAILED", moneyRes.error.message, 500);
  if (contactsRes.error) return fail("QUERY_FAILED", contactsRes.error.message, 500);

  const clients = (clientsRes.data || []) as ClientRow[];
  const clientById = new Map(clients.map((client) => [client.id, client]));
  const clientIds = new Set(clientById.keys());

  const money = ((moneyRes.data || []) as MoneyRow[])
    .filter((row) => !row.payer_client_id || clientIds.has(row.payer_client_id))
    .filter((row) => {
      const value = amount(row);
      if (minAmount && value < minAmount) return false;
      if (maxAmount !== null && value > maxAmount) return false;
      return true;
    });

  const contacts = ((contactsRes.data || []) as ContactRow[])
    .filter((row) => !row.client_id || clientIds.has(row.client_id));

  const spendByClient = new Map<string, { id: string; name: string; amount: number; sector: string | null; principal_country_code: string | null }>();
  for (const row of money) {
    if (!row.payer_client_id) continue;
    const client = clientById.get(row.payer_client_id);
    if (!client) continue;
    const existing = spendByClient.get(client.id) || {
      id: client.id,
      name: client.name,
      amount: 0,
      sector: client.sector,
      principal_country_code: client.principal_country_code,
    };
    existing.amount += amount(row);
    spendByClient.set(client.id, existing);
  }

  const targetCounts = new Map<string, { name: string; count: number }>();
  const countryCounts = new Map<string, { name: string; count: number }>();
  const sourceCounts = new Map<string, { name: string; count: number }>();
  for (const row of contacts) {
    pushCount(targetCounts, row.target_institution || row.target_name, row.target_institution || row.target_name);
    pushCount(countryCounts, row.target_country_code, row.target_country_code);
    pushCount(sourceCounts, row.data_source, row.data_source);
  }
  for (const row of money) pushCount(sourceCounts, row.data_source, row.data_source);

  return ok(
    {
      overview: overviewRes.data || {
        filings_total: 0,
        clients_total: 0,
        actors_total: 0,
        companies_total: 0,
        contacts_total: 0,
        money_rows_total: 0,
        recorded_amount_total: 0,
      },
      filters: { country, principal_country: principalCountry, source, sector, target_institution: institution, evidence: evidenceMax, min_amount: minAmount, max_amount: maxAmount },
      top_spenders: [...spendByClient.values()].sort((a, b) => b.amount - a.amount).slice(0, 25),
      top_targets: [...targetCounts.values()].sort((a, b) => b.count - a.count).slice(0, 25),
      target_countries: [...countryCounts.values()].sort((a, b) => b.count - a.count).slice(0, 25),
      source_counts: [...sourceCounts.values()].sort((a, b) => b.count - a.count),
      recent_contacts: contacts.sort((a, b) => String(b.contact_date || "").localeCompare(String(a.contact_date || ""))).slice(0, 50),
      missing_coverage: [
        "US/EU disclosures are strongest; China, Russia, and Middle East actors appear mostly as foreign principals, counterparties, PEPs, or state-linked companies in those filings.",
        "Money values can be bands or reported totals depending on source. The registry preserves low/high/exact values where available.",
        "Religion or sect data is not an allegiance signal and is excluded unless explicitly sourced and reviewed.",
      ],
    },
    {
      cacheTtlSeconds: 600,
      rowCounts: { clients: clients.length, money: money.length, contacts: contacts.length },
      provenance: provenance(),
    },
  );
}

async function handleOrg(ctx: EnvelopeContext, id: string) {
  const { supabase } = ctx;
  const [actorRes, clientRes, companyRes] = await Promise.all([
    supabase.from("influence_actors").select("*").eq("id", id).maybeSingle(),
    supabase.from("influence_clients").select("*").eq("id", id).maybeSingle(),
    supabase.from("companies").select("*").eq("id", id).maybeSingle(),
  ]);
  if (actorRes.error) return fail("QUERY_FAILED", actorRes.error.message, 500);
  if (clientRes.error) return fail("QUERY_FAILED", clientRes.error.message, 500);
  if (companyRes.error) return fail("QUERY_FAILED", companyRes.error.message, 500);
  if (!actorRes.data && !clientRes.data && !companyRes.data) return fail("NOT_FOUND", `influence org ${id} not found`, 404);

  const [moneyRes, filingsRes, contactsRes, officersRes, ownershipRes] = await Promise.all([
    supabase.from("influence_money").select("*").or(`payer_client_id.eq.${id},recipient_actor_id.eq.${id},recipient_company_id.eq.${id}`).limit(500),
    supabase.from("influence_filings").select("*").or(`client_id.eq.${id},registrant_actor_id.eq.${id}`).limit(500),
    supabase.from("influence_contacts").select("*").or(`client_id.eq.${id},lobby_actor_id.eq.${id},target_actor_id.eq.${id}`).limit(500),
    supabase.from("company_officers").select("*").eq("company_id", id).limit(200),
    supabase.from("beneficial_ownership").select("*").or(`owned_company_id.eq.${id},owner_actor_id.eq.${id},owner_company_id.eq.${id}`).limit(200),
  ]);

  return ok(
    {
      actor: actorRes.data,
      client: clientRes.data,
      company: companyRes.data,
      money: moneyRes.data || [],
      filings: filingsRes.data || [],
      contacts: contactsRes.data || [],
      officers: officersRes.data || [],
      ownership: ownershipRes.data || [],
    },
    {
      cacheTtlSeconds: 600,
      rowCounts: {
        money: (moneyRes.data || []).length,
        filings: (filingsRes.data || []).length,
        contacts: (contactsRes.data || []).length,
      },
      provenance: provenance(),
    },
  );
}

async function handlePerson(ctx: EnvelopeContext, id: string) {
  const { supabase } = ctx;
  const [actorRes, politicianRes] = await Promise.all([
    supabase.from("influence_actors").select("*").eq("id", id).maybeSingle(),
    supabase.from("politicians").select("id, name, country_code, country_name, party_name, role, source_url").eq("id", id).maybeSingle(),
  ]);
  if (actorRes.error) return fail("QUERY_FAILED", actorRes.error.message, 500);
  if (politicianRes.error) return fail("QUERY_FAILED", politicianRes.error.message, 500);
  if (!actorRes.data && !politicianRes.data) return fail("NOT_FOUND", `influence person ${id} not found`, 404);

  const [officersRes, contactsRes, affiliationsRes] = await Promise.all([
    supabase.from("company_officers").select("*, companies(id, name, jurisdiction_code, sector)").eq("actor_id", id).limit(200),
    supabase.from("influence_contacts").select("*").or(`lobby_actor_id.eq.${id},target_actor_id.eq.${id},target_politician_id.eq.${id}`).limit(500),
    supabase
      .from("public_affiliations_visible")
      .select("*")
      .or(`subject_actor_id.eq.${id},subject_politician_id.eq.${id}`)
      .eq("visible", true)
      .eq("review_status", "approved"),
  ]);

  return ok(
    {
      actor: actorRes.data,
      politician: politicianRes.data,
      company_roles: officersRes.data || [],
      contacts: contactsRes.data || [],
      public_affiliations: affiliationsRes.data || [],
      affiliation_notice: "Publicly reported affiliation is shown only when reviewed and sourced. It is not an allegiance signal.",
    },
    {
      cacheTtlSeconds: 600,
      rowCounts: {
        company_roles: (officersRes.data || []).length,
        contacts: (contactsRes.data || []).length,
        public_affiliations: (affiliationsRes.data || []).length,
      },
      provenance: provenance(),
    },
  );
}

async function handleCountry(ctx: EnvelopeContext, code: string) {
  const country = code.toUpperCase();
  const { supabase } = ctx;
  const [clientsRes, filingsRes, contactsRes, moneyRes] = await Promise.all([
    supabase.from("influence_clients").select("*").or(`country_code.eq.${country},principal_country_code.eq.${country}`).limit(1000),
    supabase.from("influence_filings").select("*").eq("principal_country_code", country).limit(1000),
    supabase.from("influence_contacts").select("*").eq("target_country_code", country).limit(1000),
    supabase.from("influence_money").select("*").limit(3000),
  ]);
  if (clientsRes.error) return fail("QUERY_FAILED", clientsRes.error.message, 500);
  if (filingsRes.error) return fail("QUERY_FAILED", filingsRes.error.message, 500);
  if (contactsRes.error) return fail("QUERY_FAILED", contactsRes.error.message, 500);
  if (moneyRes.error) return fail("QUERY_FAILED", moneyRes.error.message, 500);

  const clientIds = new Set(((clientsRes.data || []) as Array<{ id: string }>).map((client) => client.id));
  const money = ((moneyRes.data || []) as MoneyRow[]).filter((row) => row.payer_client_id && clientIds.has(row.payer_client_id));
  const total = money.reduce((sum, row) => sum + amount(row), 0);

  return ok(
    {
      country,
      clients: clientsRes.data || [],
      filings: filingsRes.data || [],
      contacts: contactsRes.data || [],
      recorded_amount_total: total,
      coverage_note: "Country-level influence coverage depends on whether the actor appears in US/EU disclosures or vetted secondary datasets.",
    },
    {
      cacheTtlSeconds: 900,
      rowCounts: {
        clients: (clientsRes.data || []).length,
        filings: (filingsRes.data || []).length,
        contacts: (contactsRes.data || []).length,
        money: money.length,
      },
      provenance: provenance(),
    },
  );
}

async function handleNetwork(ctx: EnvelopeContext) {
  const { supabase, url } = ctx;
  const seed = url.searchParams.get("seed");
  if (!seed) return fail("MISSING_PARAM", "query param 'seed' is required", 400);

  const [actorRes, clientRes, companyRes, contactRes, moneyRes, officerRes, ownershipRes] = await Promise.all([
    supabase.from("influence_actors").select("id, name, actor_kind, country_code").eq("id", seed).maybeSingle(),
    supabase.from("influence_clients").select("id, name, client_kind, country_code, principal_country_code").eq("id", seed).maybeSingle(),
    supabase.from("companies").select("id, name, jurisdiction_code, sector").eq("id", seed).maybeSingle(),
    supabase.from("influence_contacts").select("*").or(`lobby_actor_id.eq.${seed},target_actor_id.eq.${seed},target_politician_id.eq.${seed},client_id.eq.${seed}`).limit(200),
    supabase.from("influence_money").select("*").or(`payer_client_id.eq.${seed},recipient_actor_id.eq.${seed},recipient_company_id.eq.${seed}`).limit(200),
    supabase.from("company_officers").select("*").or(`actor_id.eq.${seed},company_id.eq.${seed}`).limit(200),
    supabase.from("beneficial_ownership").select("*").or(`owner_actor_id.eq.${seed},owner_company_id.eq.${seed},owned_company_id.eq.${seed}`).limit(200),
  ]);

  const seedNode = actorRes.data || clientRes.data || companyRes.data;
  if (!seedNode) return fail("NOT_FOUND", `network seed ${seed} not found`, 404);

  const nodes = new Map<string, Record<string, unknown>>();
  const edges: Array<Record<string, unknown>> = [];
  nodes.set(seed, { id: seed, label: (seedNode as { name?: string }).name || seed, kind: actorRes.data ? "actor" : clientRes.data ? "client" : "company", depth: 0 });

  for (const row of (contactRes.data || []) as Array<Record<string, unknown>>) {
    const targetId = (row.target_actor_id || row.target_politician_id || row.target_name) as string | null;
    if (targetId) nodes.set(targetId, { id: targetId, label: row.target_name || targetId, kind: "contact_target", depth: 1 });
    if (row.client_id) nodes.set(row.client_id as string, { id: row.client_id, label: row.client_id, kind: "client", depth: 1 });
    edges.push({ source: row.lobby_actor_id || row.client_id || seed, target: targetId || row.target_institution || seed, predicate: "met_with", subject: row.subject, source_url: row.source_url });
  }
  for (const row of (moneyRes.data || []) as Array<Record<string, unknown>>) {
    const payer = row.payer_client_id as string | null;
    const recipient = (row.recipient_actor_id || row.recipient_company_id) as string | null;
    if (payer) nodes.set(payer, { id: payer, label: payer, kind: "client", depth: 1 });
    if (recipient) nodes.set(recipient, { id: recipient, label: recipient, kind: "recipient", depth: 1 });
    edges.push({ source: payer || seed, target: recipient || seed, predicate: "paid_by", amount: amount(row as MoneyRow), source_url: row.source_url });
  }
  for (const row of (officerRes.data || []) as Array<Record<string, unknown>>) {
    if (row.actor_id) nodes.set(row.actor_id as string, { id: row.actor_id, label: row.name || row.actor_id, kind: "actor", depth: 1 });
    if (row.company_id) nodes.set(row.company_id as string, { id: row.company_id, label: row.company_id, kind: "company", depth: 1 });
    edges.push({ source: row.actor_id || seed, target: row.company_id || seed, predicate: "officer_of", role: row.role, source_url: row.source_url });
  }
  for (const row of (ownershipRes.data || []) as Array<Record<string, unknown>>) {
    const owner = (row.owner_actor_id || row.owner_company_id) as string | null;
    const owned = row.owned_company_id as string | null;
    if (owner) nodes.set(owner, { id: owner, label: owner, kind: "owner", depth: 1 });
    if (owned) nodes.set(owned, { id: owned, label: owned, kind: "company", depth: 1 });
    edges.push({ source: owner || seed, target: owned || seed, predicate: "beneficial_owner_of", ownership_percent: row.ownership_percent, source_url: row.source_url });
  }

  return ok(
    { seed: seedNode, nodes: [...nodes.values()], edges },
    {
      cacheTtlSeconds: 300,
      rowCounts: { nodes: nodes.size, edges: edges.length },
      provenance: provenance(),
    },
  );
}

Deno.serve((req) => handle(req, async (ctx) => {
  const path = stripPrefix(ctx.url.pathname);
  const org = path.match(/^\/org\/([^/]+)$/);
  if (org) return handleOrg(ctx, decodeURIComponent(org[1]));
  const person = path.match(/^\/person\/([^/]+)$/);
  if (person) return handlePerson(ctx, decodeURIComponent(person[1]));
  const country = path.match(/^\/country\/([^/]+)$/);
  if (country) return handleCountry(ctx, decodeURIComponent(country[1]));
  if (path === "/network") return handleNetwork(ctx);
  if (path === "/") return handleOverview(ctx);
  return fail("NOT_FOUND", `no influence handler for ${path}`, 404);
}));
