export function buildTweedeKamerPageUrl(top: number, skip = 0) {
  const params = new URLSearchParams({
    $filter: "Soort eq 'Wetgeving'",
    $top: String(top),
    $orderby: 'GestartOp desc',
    $count: 'true',
  });

  if (skip > 0) {
    params.set('$skip', String(skip));
  }

  return `https://gegevensmagazijn.tweedekamer.nl/OData/v4/2.0/Zaak?${params.toString()}`;
}

export function resolveTweedeKamerNextUrl(input: {
  top: number;
  pageIndex: number;
  fetchedCount: number;
  nextLink?: string;
  totalCount?: number | string;
}) {
  if (input.nextLink) return input.nextLink;

  const parsedTotal =
    typeof input.totalCount === 'number'
      ? input.totalCount
      : typeof input.totalCount === 'string'
        ? Number.parseInt(input.totalCount, 10)
        : Number.NaN;

  const nextSkip = (input.pageIndex + 1) * input.top;
  if (!Number.isFinite(parsedTotal) || input.fetchedCount < input.top || nextSkip >= parsedTotal) {
    return '';
  }

  return buildTweedeKamerPageUrl(input.top, nextSkip);
}
