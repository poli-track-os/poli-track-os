import { ExternalLink } from 'lucide-react';

interface SourceBadgeProps {
  label: string;
  url?: string;
  type?: 'fact' | 'estimate' | 'model' | 'official';
  /** 1 = official primary, 2 = authoritative secondary, 3 = derived/heuristic, 4 = low-confidence. */
  trustLevel?: number | null;
}

const typeStyles: Record<string, string> = {
  fact: 'bg-green-500/10 text-green-700 dark:text-green-400',
  official: 'bg-primary/10 text-primary',
  estimate: 'bg-amber-500/10 text-amber-700 dark:text-amber-400',
  model: 'bg-purple-500/10 text-purple-700 dark:text-purple-400',
};

export function trustLevelToBadgeType(
  trustLevel: number | null | undefined,
  fallback: SourceBadgeProps['type'] = 'fact',
): NonNullable<SourceBadgeProps['type']> {
  switch (trustLevel) {
    case 1: return 'official';
    case 2: return 'fact';
    case 3: return 'estimate';
    case 4: return 'model';
    default: return fallback ?? 'fact';
  }
}

export function SourceBadge({ label, url, type, trustLevel }: SourceBadgeProps) {
  const resolvedType = type ?? trustLevelToBadgeType(trustLevel);
  const style = typeStyles[resolvedType] || typeStyles.fact;
  
  if (url) {
    return (
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className={`inline-flex items-center gap-1 text-[10px] font-mono px-1.5 py-0.5 rounded ${style} hover:opacity-80 transition-opacity`}
      >
        <ExternalLink className="w-2.5 h-2.5" />
        {label}
      </a>
    );
  }

  return (
    <span className={`inline-flex items-center gap-1 text-[10px] font-mono px-1.5 py-0.5 rounded ${style}`}>
      {label}
    </span>
  );
}

export function ProvenanceBar({ sources }: { sources: Array<{ label: string; url?: string; type?: SourceBadgeProps['type'] }> }) {
  if (sources.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1.5 mt-2">
      {sources.map((s, i) => (
        <SourceBadge key={i} {...s} />
      ))}
    </div>
  );
}
