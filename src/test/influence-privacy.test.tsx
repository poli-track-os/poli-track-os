import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useInfluencePerson } from '@/hooks/use-influence';

type QueryCall = {
  table: string;
  method: string;
  args: unknown[];
};

const { queryCalls } = vi.hoisted(() => ({
  queryCalls: [] as QueryCall[],
}));

function createQueryBuilder(table: string) {
  const builder = {
    select(...args: unknown[]) {
      queryCalls.push({ table, method: 'select', args });
      return builder;
    },
    eq(...args: unknown[]) {
      queryCalls.push({ table, method: 'eq', args });
      return builder;
    },
    or(...args: unknown[]) {
      queryCalls.push({ table, method: 'or', args });
      return builder;
    },
    limit(...args: unknown[]) {
      queryCalls.push({ table, method: 'limit', args });
      return builder;
    },
    maybeSingle() {
      queryCalls.push({ table, method: 'maybeSingle', args: [] });
      return Promise.resolve({ data: null, error: null });
    },
    then<TResult1 = { data: unknown[]; error: null }, TResult2 = never>(
      onfulfilled?: ((value: { data: unknown[]; error: null }) => TResult1 | PromiseLike<TResult1>) | null,
      onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
    ) {
      return Promise.resolve({ data: [], error: null }).then(onfulfilled, onrejected);
    },
  };
  return builder;
}

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: (table: string) => createQueryBuilder(table),
  },
}));

function Probe() {
  const person = useInfluencePerson('person-1');
  return <div>{person.isSuccess ? 'loaded' : 'loading'}</div>;
}

describe('influence privacy', () => {
  it('queries only the reviewed public affiliation view for person influence data', async () => {
    queryCalls.length = 0;
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
        },
      },
    });

    render(
      <QueryClientProvider client={queryClient}>
        <Probe />
      </QueryClientProvider>,
    );

    await screen.findByText('loaded');
    await waitFor(() => {
      expect(queryCalls.some((call) => call.table === 'public_affiliations_visible')).toBe(true);
    });

    const affiliationCalls = queryCalls.filter((call) => call.table === 'public_affiliations_visible');
    expect(affiliationCalls).toContainEqual({
      table: 'public_affiliations_visible',
      method: 'eq',
      args: ['visible', true],
    });
    expect(affiliationCalls).toContainEqual({
      table: 'public_affiliations_visible',
      method: 'eq',
      args: ['review_status', 'approved'],
    });
    expect(queryCalls.some((call) => call.table === 'public_affiliations')).toBe(false);
  });
});
