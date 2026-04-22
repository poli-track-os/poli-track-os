import type { DbProposal } from '@/hooks/use-proposals';

function normalizeUrl(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.startsWith('http://')) return `https://${trimmed.slice('http://'.length)}`;
  return trimmed;
}

function extractBundestagVorgangId(url: string): string | null {
  const match = url.match(/\/vorgang\/(\d+)(?:\/)?$/);
  return match ? match[1] : null;
}

export function resolveProposalSourceUrl(proposal: Pick<DbProposal, 'data_source' | 'source_url'>): string | null {
  const raw = proposal.source_url?.trim();
  if (!raw) return null;
  const normalized = normalizeUrl(raw);
  if (proposal.data_source !== 'bundestag_dip') return normalized;
  const vorgangId = extractBundestagVorgangId(normalized);
  if (!vorgangId) return normalized;
  return `https://dip.bundestag.de/suche?term=${encodeURIComponent(vorgangId)}`;
}

export function resolveProposalSourceFallbackUrl(
  proposal: Pick<DbProposal, 'data_source' | 'source_url' | 'title' | 'official_title'>,
): string | null {
  const sourceUrl = resolveProposalSourceUrl(proposal);
  if (!sourceUrl) return null;
  const query = [proposal.official_title, proposal.title]
    .find((value) => typeof value === 'string' && value.trim().length > 0)
    ?.trim();
  if (!query) return null;

  if (proposal.data_source === 'bundestag_dip') {
    const vorgangId = extractBundestagVorgangId(normalizeUrl(proposal.source_url ?? ''));
    if (vorgangId) return `https://dip.bundestag.de/suche?term=${encodeURIComponent(vorgangId)}`;
    return `https://dip.bundestag.de/suche?term=${encodeURIComponent(query)}`;
  }

  try {
    const hostname = new URL(sourceUrl).hostname;
    return `https://duckduckgo.com/?q=${encodeURIComponent(`site:${hostname} ${query}`)}`;
  } catch {
    return `https://duckduckgo.com/?q=${encodeURIComponent(query)}`;
  }
}
