// GET /functions/v1/graph?seed={uuid}&depth=1|2|3&limit=100&predicates=member_of,works_for
//
// Returns a graph slice rooted at `seed` as a `{ nodes, edges }` payload
// suitable for force-directed rendering (D3, cytoscape, sigma, ...).
//
// Traversal strategy: iterative BFS with an explicit visited set. At each
// step we fetch all outgoing AND incoming relationships for the current
// frontier, add any new entities as nodes, and continue until we hit
// `depth` or the per-request `limit` cap on node count.
//
// This is bounded: depth ≤ 3, limit ≤ 500. Big graph export lives
// elsewhere (e.g. a nightly dump job) — not in a request path.

import { handle, ok, fail, requireParam, intParam, type ProvenanceEntry } from "../_shared/envelope.ts";

interface Node {
  id: string;
  kind: string;
  canonical_name: string;
  slug: string;
  depth: number;
}

interface Edge {
  id: string;
  subject_id: string;
  predicate: string;
  object_id: string;
  role: string | null;
  valid_from: string | null;
  valid_to: string | null;
}

interface RelRow {
  id: string;
  subject_id: string;
  predicate: string;
  object_id: string;
  role: string | null;
  valid_from: string | null;
  valid_to: string | null;
}

interface EntityRow {
  id: string;
  kind: string;
  canonical_name: string;
  slug: string;
}

Deno.serve((req) => handle(req, async ({ supabase, url }) => {
  const seed = requireParam(url, "seed");
  const depth = Math.min(Math.max(intParam(url, "depth", 1), 1), 3);
  const limit = Math.min(intParam(url, "limit", 100), 500);
  const predicatesFilter = url.searchParams.get("predicates")?.split(",").filter(Boolean);

  const { data: seedRow, error: seedErr } = await supabase
    .from("entities")
    .select("id, kind, canonical_name, slug")
    .eq("id", seed)
    .maybeSingle();
  if (seedErr) return fail("QUERY_FAILED", seedErr.message, 500);
  if (!seedRow) return fail("NOT_FOUND", `entity ${seed} not found`, 404);

  const nodes = new Map<string, Node>();
  const edges: Edge[] = [];
  const edgeIds = new Set<string>();
  nodes.set(seedRow.id, { ...(seedRow as EntityRow), depth: 0 });

  let frontier: string[] = [seedRow.id];
  for (let d = 1; d <= depth; d++) {
    if (frontier.length === 0) break;
    if (nodes.size >= limit) break;

    let outQ = supabase
      .from("relationships")
      .select("id, subject_id, predicate, object_id, role, valid_from, valid_to")
      .in("subject_id", frontier)
      .limit(limit * 2);
    let inQ = supabase
      .from("relationships")
      .select("id, subject_id, predicate, object_id, role, valid_from, valid_to")
      .in("object_id", frontier)
      .limit(limit * 2);
    if (predicatesFilter && predicatesFilter.length > 0) {
      outQ = outQ.in("predicate", predicatesFilter);
      inQ = inQ.in("predicate", predicatesFilter);
    }
    const [{ data: outRels, error: outErr }, { data: inRels, error: inErr }] = await Promise.all([outQ, inQ]);
    if (outErr) return fail("QUERY_FAILED", outErr.message, 500);
    if (inErr) return fail("QUERY_FAILED", inErr.message, 500);

    const candidateIds = new Set<string>();
    const collect = (rows: RelRow[] | null) => {
      for (const r of rows || []) {
        if (edgeIds.has(r.id)) continue;
        edgeIds.add(r.id);
        edges.push(r);
        if (!nodes.has(r.subject_id)) candidateIds.add(r.subject_id);
        if (!nodes.has(r.object_id)) candidateIds.add(r.object_id);
      }
    };
    collect(outRels as RelRow[] | null);
    collect(inRels as RelRow[] | null);

    if (candidateIds.size === 0) break;

    const { data: newEntities, error: eErr } = await supabase
      .from("entities")
      .select("id, kind, canonical_name, slug")
      .in("id", [...candidateIds]);
    if (eErr) return fail("QUERY_FAILED", eErr.message, 500);

    const nextFrontier: string[] = [];
    for (const e of (newEntities || []) as EntityRow[]) {
      if (nodes.has(e.id)) continue;
      if (nodes.size >= limit) break;
      nodes.set(e.id, { ...e, depth: d });
      nextFrontier.push(e.id);
    }
    frontier = nextFrontier;
  }

  // Prune edges whose endpoints aren't both in the node set (happens when
  // we stopped adding nodes at the limit).
  const prunedEdges = edges.filter((e) => nodes.has(e.subject_id) && nodes.has(e.object_id));

  const provenance: ProvenanceEntry[] = [
    { kind: "entities", id: seed, data_source: "canonical_graph", trust_level: 2 },
  ];

  return ok(
    {
      seed: seedRow,
      depth,
      nodes: [...nodes.values()],
      edges: prunedEdges,
    },
    {
      cacheTtlSeconds: 120,
      rowCounts: { nodes: nodes.size, edges: prunedEdges.length },
      provenance,
    },
  );
}));
