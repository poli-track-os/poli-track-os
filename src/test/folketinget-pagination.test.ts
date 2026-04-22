import { describe, expect, it } from 'vitest';
import { resolveNextFolketingSkip } from '@/lib/folketinget-pagination';

describe('resolveNextFolketingSkip', () => {
  it('advances by the actual page size when the API caps a larger request', () => {
    expect(resolveNextFolketingSkip({
      currentSkip: 0,
      fetchedCount: 100,
      totalCount: 5233,
    })).toBe(100);
  });

  it('stops once the total row count has been reached', () => {
    expect(resolveNextFolketingSkip({
      currentSkip: 5200,
      fetchedCount: 33,
      totalCount: 5233,
    })).toBeNull();
  });
});
