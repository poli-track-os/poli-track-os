// Minimal fetch wrapper for the Poli-Track HTTP API.
//
// The MCP server never talks to the database directly. Every tool call is
// a GET against one of the Layer 2/3 endpoints (/functions/v1/page/*,
// /functions/v1/search, /functions/v1/entity, /functions/v1/timeline,
// /functions/v1/graph). This file is the only place that knows how to
// build those URLs.

export interface ApiClientOptions {
  baseUrl: string;
  apiKey?: string;
  fetchImpl?: typeof fetch;
}

export interface EnvelopeLike<T = unknown> {
  ok: true;
  data: T;
  meta: Record<string, unknown>;
  provenance: unknown[];
}

export interface ErrorLike {
  ok: false;
  error: { code: string; message: string; http_status: number };
  meta: Record<string, unknown>;
}

export type ApiResponse<T = unknown> = EnvelopeLike<T> | ErrorLike;

export class ApiError extends Error {
  code: string;
  httpStatus: number;
  constructor(code: string, message: string, httpStatus: number) {
    super(message);
    this.code = code;
    this.httpStatus = httpStatus;
  }
}

export class ApiClient {
  private baseUrl: string;
  private apiKey?: string;
  private fetchImpl: typeof fetch;

  constructor(options: ApiClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, "");
    this.apiKey = options.apiKey;
    this.fetchImpl = options.fetchImpl ?? (globalThis.fetch as typeof fetch);
    if (!this.fetchImpl) {
      throw new Error("No global fetch available. Use Node 18+ or pass fetchImpl.");
    }
  }

  async get<T = unknown>(
    path: string,
    params: Record<string, string | number | undefined | null> = {},
    accept: "application/json" | "text/markdown" = "application/json",
  ): Promise<EnvelopeLike<T>> {
    const url = new URL(this.baseUrl + (path.startsWith("/") ? path : `/${path}`));
    for (const [k, v] of Object.entries(params)) {
      if (v === undefined || v === null || v === "") continue;
      url.searchParams.set(k, String(v));
    }

    const headers: Record<string, string> = { Accept: accept };
    if (this.apiKey) headers.Authorization = `Bearer ${this.apiKey}`;

    const res = await this.fetchImpl(url.toString(), { headers });
    const contentType = res.headers.get("content-type") || "";

    // Markdown fast path: return as-is inside a synthetic envelope.
    if (contentType.includes("text/markdown")) {
      const body = await res.text();
      if (!res.ok) {
        throw new ApiError("HTTP_ERROR", `GET ${url.pathname} failed: ${res.status}`, res.status);
      }
      return {
        ok: true,
        data: { markdown: body } as unknown as T,
        meta: { content_type: "text/markdown" },
        provenance: [],
      };
    }

    let body: ApiResponse<T>;
    try {
      body = (await res.json()) as ApiResponse<T>;
    } catch (e) {
      throw new ApiError("BAD_RESPONSE", `Non-JSON response from ${url.pathname}: ${String(e)}`, res.status);
    }

    if (!res.ok || body.ok === false) {
      const err = body.ok === false ? body.error : { code: "HTTP_ERROR", message: `HTTP ${res.status}`, http_status: res.status };
      throw new ApiError(err.code, err.message, err.http_status);
    }
    return body;
  }
}
