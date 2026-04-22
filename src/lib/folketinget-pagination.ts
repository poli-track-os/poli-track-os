export function resolveNextFolketingSkip(params: {
  currentSkip: number;
  fetchedCount: number;
  totalCount: number | null;
}) {
  if (params.fetchedCount <= 0) return null;
  const nextSkip = params.currentSkip + params.fetchedCount;
  if (params.totalCount !== null && nextSkip >= params.totalCount) return null;
  return nextSkip;
}
