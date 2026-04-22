// Shared response envelope + handler helpers for every Layer 2/3 edge
// function. One place owns CORS, caching, content negotiation, error
// serialization, and provenance wiring. If an endpoint needs something
// custom, it should compose these helpers — not duplicate them.
//
// Usage:
//   import { handle, ok, fail, type EnvelopeContext } from "../_shared/envelope.ts";
//
//   Deno.serve((req) => handle(req, async (ctx) => {
//     const { data, error } = await ctx.supabase.from("politicians").select("*").limit(10);
//     if (error) return fail("QUERY_FAILED", error.message, 500);
//     return ok({ politicians: data }, {
//       cacheTtlSeconds: 300,
//       provenance: [{ kind: "politicians", data_source: "mixed", trust_level: 1 }],
//     });
//   }));
//
// Every successful response looks like:
//   {
//     "ok": true,
//     "data": { ... },
//     "meta": { fetched_at, schema_version, cache_ttl_seconds, row_counts, ... },
//     "provenance": [ ... ]
//   }
//
// Every error response looks like:
//   { "ok": false, "error": { code, message, http_status }, "meta": { fetched_at } }

import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

export const SCHEMA_VERSION = "1";

export const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, accept, if-none-match",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Expose-Headers": "ETag, X-RateLimit-Remaining, X-RateLimit-Reset",
};

export interface ProvenanceEntry {
  kind: string;
  id?: string;
  data_source: string;
  source_url?: string | null;
  trust_level?: number | null;
  fetched_at?: string | null;
}

export interface Envelope<T> {
  ok: true;
  data: T;
  meta: {
    fetched_at: string;
    schema_version: string;
    cache_ttl_seconds: number;
    row_counts?: Record<string, number>;
    [k: string]: unknown;
  };
  provenance: ProvenanceEntry[];
}

export interface ErrorEnvelope {
  ok: false;
  error: {
    code: string;
    message: string;
    http_status: number;
  };
  meta: {
    fetched_at: string;
    schema_version: string;
  };
}

export interface EnvelopeContext {
  supabase: SupabaseClient;
  url: URL;
  req: Request;
  accept: string;
}

export interface OkOptions {
  cacheTtlSeconds?: number;
  rowCounts?: Record<string, number>;
  provenance?: ProvenanceEntry[];
  extraMeta?: Record<string, unknown>;
  // If set, overrides the default `application/json` with `text/markdown`.
  // The caller must pass a pre-rendered markdown body in that case.
  markdownBody?: string;
}

export class HandlerError extends Error {
  code: string;
  httpStatus: number;
  constructor(code: string, message: string, httpStatus = 500) {
    super(message);
    this.code = code;
    this.httpStatus = httpStatus;
  }
}

export function ok<T>(data: T, options: OkOptions = {}): Envelope<T> & {
  __markdownBody?: string;
} {
  return {
    ok: true,
    data,
    meta: {
      fetched_at: new Date().toISOString(),
      schema_version: SCHEMA_VERSION,
      cache_ttl_seconds: options.cacheTtlSeconds ?? 300,
      ...(options.rowCounts ? { row_counts: options.rowCounts } : {}),
      ...(options.extraMeta ?? {}),
    },
    provenance: options.provenance ?? [],
    ...(options.markdownBody ? { __markdownBody: options.markdownBody } : {}),
  };
}

export function fail(code: string, message: string, httpStatus = 500): ErrorEnvelope {
  return {
    ok: false,
    error: { code, message, http_status: httpStatus },
    meta: {
      fetched_at: new Date().toISOString(),
      schema_version: SCHEMA_VERSION,
    },
  };
}

// Stable FNV-1a hash of a string. Used for ETag. Not cryptographic, but
// deterministic and fast — good enough for cache invalidation.
function fnv1a(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = (hash + ((hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24))) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

function buildResponse(
  body: string,
  contentType: string,
  ttl: number,
  req: Request,
): Response {
  const etag = `"${fnv1a(body)}"`;
  const ifNoneMatch = req.headers.get("if-none-match");
  if (ifNoneMatch && ifNoneMatch === etag) {
    return new Response(null, {
      status: 304,
      headers: {
        ...CORS_HEADERS,
        ETag: etag,
        "Cache-Control": `public, max-age=${ttl}`,
      },
    });
  }
  return new Response(body, {
    headers: {
      ...CORS_HEADERS,
      "Content-Type": contentType,
      "Cache-Control": `public, max-age=${ttl}`,
      ETag: etag,
    },
  });
}

// Primary handler wrapper. Deals with OPTIONS preflight, supabase client
// creation, content negotiation, and error shaping. The handler only has
// to return an `ok()` or throw.
export async function handle(
  req: Request,
  handler: (ctx: EnvelopeContext) => Promise<Envelope<unknown> & { __markdownBody?: string } | ErrorEnvelope>,
): Promise<Response> {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }

  const url = new URL(req.url);
  const accept = req.headers.get("accept") || "application/json";

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!SUPABASE_URL || !SERVICE_ROLE) {
    const body = JSON.stringify(fail("SERVER_MISCONFIGURED", "Missing Supabase credentials", 500));
    return new Response(body, {
      status: 500,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    const result = await handler({ supabase, url, req, accept });

    if (!result.ok) {
      const body = JSON.stringify(result);
      return new Response(body, {
        status: result.error.http_status,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    const ttl = result.meta.cache_ttl_seconds ?? 300;

    // Content negotiation: markdown if requested AND handler supplied one.
    if (accept.includes("text/markdown") && result.__markdownBody) {
      return buildResponse(result.__markdownBody, "text/markdown; charset=utf-8", ttl, req);
    }

    // Strip the private field before serializing.
    const { __markdownBody: _omit, ...jsonPayload } = result;
    void _omit;
    const body = JSON.stringify(jsonPayload);
    return buildResponse(body, "application/json", ttl, req);
  } catch (err) {
    console.error("[envelope] handler error:", err);
    let body: string;
    let status: number;
    if (err instanceof HandlerError) {
      body = JSON.stringify(fail(err.code, err.message, err.httpStatus));
      status = err.httpStatus;
    } else {
      const message = err instanceof Error ? err.message : String(err);
      body = JSON.stringify(fail("INTERNAL_ERROR", message, 500));
      status = 500;
    }
    return new Response(body, {
      status,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }
}

// Convenience: read a required query param or throw a structured 400.
export function requireParam(url: URL, name: string): string {
  const v = url.searchParams.get(name);
  if (!v) {
    throw new HandlerError("MISSING_PARAM", `query param '${name}' is required`, 400);
  }
  return v;
}

export function intParam(url: URL, name: string, fallback: number): number {
  const raw = url.searchParams.get(name);
  if (raw === null) return fallback;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n)) return fallback;
  return n;
}
