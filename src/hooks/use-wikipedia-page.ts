import { useQuery } from '@tanstack/react-query';
import { deriveNameFromWikipediaUrl } from '@/lib/person-display';

export interface WikipediaPageSummary {
  canonicalUrl?: string;
  description?: string;
  extract?: string;
  imageUrl?: string;
  title?: string;
}

async function fetchWikipediaSummary(title: string) {
  const response = await fetch(
    `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title.replace(/ /g, '_'))}`,
    {
      headers: {
        Accept: 'application/json',
      },
    },
  );

  if (!response.ok) {
    throw new Error(`Wikipedia summary request failed: ${response.status} ${response.statusText}`);
  }

  const data = await response.json() as {
    content_urls?: { desktop?: { page?: string } };
    description?: string;
    extract?: string;
    originalimage?: { source?: string };
    thumbnail?: { source?: string };
    title?: string;
  };

  return {
    canonicalUrl: data.content_urls?.desktop?.page,
    description: data.description,
    extract: data.extract,
    imageUrl: data.originalimage?.source || data.thumbnail?.source,
    title: data.title,
  } satisfies WikipediaPageSummary;
}

export function useWikipediaPageSummary(wikipediaUrl: string | undefined, enabled = true) {
  const title = deriveNameFromWikipediaUrl(wikipediaUrl);

  return useQuery({
    queryKey: ['wikipedia-page-summary', wikipediaUrl],
    queryFn: async () => {
      if (!title) return null;
      return fetchWikipediaSummary(title);
    },
    enabled: Boolean(enabled && wikipediaUrl && title),
    staleTime: 1000 * 60 * 60,
    gcTime: 1000 * 60 * 60 * 6,
    retry: 1,
  });
}
