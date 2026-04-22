// Smoke tests for the MCP server's tool registry.
//
// These tests don't talk to the real API — they inject a fake ApiClient
// that records the path + params of every request and returns a canned
// envelope. That's enough to prove:
//   1. Every tool renders a Markdown summary.
//   2. Every tool forwards its input params to the correct endpoint.
//   3. The tool registry size and names match the documented 11.
//
// End-to-end tests (stdio → real API) are done via the bin smoke-check
// in the docs/mcp.md session example — we don't replicate them here.

import { describe, expect, it } from 'vitest';
import { ALL_TOOLS } from '../../mcp-server/src/tools/index';
import type { ApiClient, EnvelopeLike } from '../../mcp-server/src/api-client';

interface RecordedCall {
  path: string;
  params: Record<string, unknown>;
}

function makeFakeApi(fixture: Record<string, unknown>): {
  api: ApiClient;
  calls: RecordedCall[];
} {
  const calls: RecordedCall[] = [];
  const envelope: EnvelopeLike<unknown> = {
    ok: true,
    data: fixture,
    meta: { fetched_at: '2026-04-15T00:00:00Z', schema_version: '1' },
    provenance: [],
  };
  const api = {
    get: async (path: string, params: Record<string, unknown>) => {
      calls.push({ path, params });
      return envelope;
    },
  } as unknown as ApiClient;
  return { api, calls };
}

describe('MCP tool registry', () => {
  it('exposes exactly the 11 documented tools with unique names', () => {
    const names = ALL_TOOLS.map((t) => t.name);
    expect(names).toHaveLength(11);
    expect(new Set(names).size).toBe(11);
    expect(names).toEqual(
      expect.arrayContaining([
        'search_politicians',
        'get_politician',
        'get_country',
        'search_proposals',
        'get_proposal',
        'get_budget',
        'get_lobby_org',
        'get_entity_card',
        'search_entities',
        'get_timeline',
        'get_graph',
      ]),
    );
  });

  it('every tool has a non-empty title, description and input schema', () => {
    for (const tool of ALL_TOOLS) {
      expect(tool.title, tool.name).toBeTruthy();
      expect(tool.description.length, tool.name).toBeGreaterThan(20);
      expect(Object.keys(tool.inputSchema).length, tool.name).toBeGreaterThan(0);
    }
  });
});

describe('MCP tool handlers (with fake API)', () => {
  it('search_politicians forwards country filter to /page/actors', async () => {
    const tool = ALL_TOOLS.find((t) => t.name === 'search_politicians')!;
    const { api, calls } = makeFakeApi({ politicians: [], total_count: 0 });
    const result = await tool.handler({ country: 'DE', limit: 10 }, { api });
    expect(calls[0].path).toBe('/page/actors');
    expect(calls[0].params).toMatchObject({ country: 'DE', limit: 10 });
    expect(result.text).toContain('Politicians');
  });

  it('get_politician hits /page/actor/{id}', async () => {
    const tool = ALL_TOOLS.find((t) => t.name === 'get_politician')!;
    const { api, calls } = makeFakeApi({
      politician: {
        name: 'Jane Example',
        party_name: 'Centrist Party',
        party_abbreviation: 'CP',
        country_name: 'Germany',
        country_code: 'DE',
        role: 'MEP',
        birth_year: 1970,
        wikipedia_url: null,
        twitter_handle: null,
        biography: null,
      },
      events: [],
      finances: null,
      investments: [],
      associates: [],
      lobby_meetings: [],
      committees: [],
      country: null,
      party: null,
      position: null,
    });
    const result = await tool.handler({ id: '00000000-0000-0000-0000-000000000000' }, { api });
    expect(calls[0].path).toBe('/page/actor/00000000-0000-0000-0000-000000000000');
    expect(result.text).toContain('Jane Example');
    expect(result.text).toContain('Germany');
  });

  it('get_country hits /page/country/{CODE} uppercased', async () => {
    const tool = ALL_TOOLS.find((t) => t.name === 'get_country')!;
    const { api, calls } = makeFakeApi({
      country: { country_name: 'France', capital: 'Paris' },
      politicians: [],
      politicians_by_party: { MOD: [{}, {}] },
      proposals: [],
      budget_latest: null,
    });
    const result = await tool.handler({ code: 'fr' }, { api });
    expect(calls[0].path).toBe('/page/country/FR');
    expect(result.text).toContain('France');
    expect(result.text).toContain('MOD');
  });

  it('search_proposals forwards status + area + country filters', async () => {
    const tool = ALL_TOOLS.find((t) => t.name === 'search_proposals')!;
    const { api, calls } = makeFakeApi({ proposals: [], stats: {} });
    await tool.handler({ country: 'PT', status: 'adopted', area: 'health', limit: 5 }, { api });
    expect(calls[0].params).toMatchObject({
      country: 'PT',
      status: 'adopted',
      area: 'health',
      limit: 5,
    });
  });

  it('get_budget falls back to /page/budget/{CODE} and reads optional year', async () => {
    const tool = ALL_TOOLS.find((t) => t.name === 'get_budget')!;
    const { api, calls } = makeFakeApi({
      country: 'DE',
      year: 2023,
      total_million_eur: 1_234_567,
      breakdown: [
        { cofog_code: 'GF0710', cofog_label: 'Sickness and disability', amount_million_eur: 123456, pct_of_total: 10 },
      ],
    });
    const result = await tool.handler({ country: 'de', year: 2023 }, { api });
    expect(calls[0].path).toBe('/page/budget/DE');
    expect(calls[0].params).toMatchObject({ year: 2023 });
    expect(result.text).toContain('Budget');
    expect(result.text).toContain('1,234,567');
  });

  it('search_entities hits /search and renders result list', async () => {
    const tool = ALL_TOOLS.find((t) => t.name === 'search_entities')!;
    const { api, calls } = makeFakeApi({
      results: [{ id: 'e1', kind: 'person', canonical_name: 'Angela Merkel', slug: 'angela-merkel', score: 100, matched_on: 'canonical_name' }],
    });
    const result = await tool.handler({ query: 'merkel' }, { api });
    expect(calls[0].path).toBe('/search');
    expect(calls[0].params).toMatchObject({ q: 'merkel' });
    expect(result.text).toContain('Angela Merkel');
  });

  it('get_timeline forwards every filter and surfaces next_cursor', async () => {
    const tool = ALL_TOOLS.find((t) => t.name === 'get_timeline')!;
    const { api, calls } = makeFakeApi({
      events: [{ event_timestamp: '2026-04-15T00:00:00Z', event_type: 'speech', title: 'Hello', source: null, source_url: null }],
      next_cursor: 'abc123',
    });
    const result = await tool.handler(
      { country: 'FR', from: '2026-01-01', to: '2026-04-01', limit: 20 },
      { api },
    );
    expect(calls[0].path).toBe('/timeline');
    expect(calls[0].params).toMatchObject({ country: 'FR', from: '2026-01-01', to: '2026-04-01', limit: 20 });
    expect(result.text).toContain('speech');
    expect(result.text).toContain('abc123');
  });

  it('get_entity_card requests text/markdown accept', async () => {
    const tool = ALL_TOOLS.find((t) => t.name === 'get_entity_card')!;
    const calls: { path: string; params: Record<string, unknown>; accept?: string }[] = [];
    const api = {
      get: async (path: string, params: Record<string, unknown>, accept?: string) => {
        calls.push({ path, params, accept });
        return {
          ok: true as const,
          data: { markdown: '# Jane\n\nBio.' },
          meta: { fetched_at: 'x', schema_version: '1' },
          provenance: [],
        };
      },
    } as unknown as ApiClient;
    const result = await tool.handler({ kind: 'person', slug: 'jane' }, { api });
    expect(calls[0].path).toBe('/entity');
    expect(calls[0].accept).toBe('text/markdown');
    expect(result.text).toContain('# Jane');
  });
});
