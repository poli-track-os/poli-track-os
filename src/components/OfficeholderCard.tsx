import { Link } from 'react-router-dom';
import { ExternalLink } from 'lucide-react';
import { getDisplayPersonName } from '@/lib/person-display';

interface OfficeholderCardProps {
  href?: string;
  office: string;
  personName: string;
  source: 'tracked' | 'reference';
  sourceUrl?: string;
}

const OfficeholderCard = ({ href, office, personName, source, sourceUrl }: OfficeholderCardProps) => {
  const displayName = getDisplayPersonName(personName, sourceUrl || href);
  const linkLabel = `View ${displayName}`;
  const name = !href ? (
    <span>{displayName}</span>
  ) : href.startsWith('/') ? (
    <Link to={href} aria-label={linkLabel} className="hover:underline">
      {displayName}
    </Link>
  ) : (
    <a href={href} target="_blank" rel="noopener noreferrer" aria-label={linkLabel} className="hover:underline">
      {displayName}
    </a>
  );

  return (
    <div className="brutalist-border p-4 bg-card hover:bg-secondary/50 transition-colors h-full">
      <div className="text-[10px] font-mono text-muted-foreground uppercase tracking-wide">{office}</div>
      <div className="mt-2 flex items-start justify-between gap-3">
        <div className="text-sm font-bold min-w-0 break-words">{name}</div>
        {sourceUrl && (
          <a
            href={sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`Open officeholder source for ${displayName}`}
            className="inline-flex shrink-0 items-center justify-center rounded border border-border px-1.5 py-1 text-muted-foreground hover:text-accent hover:border-accent"
          >
            <ExternalLink className="h-3 w-3" />
          </a>
        )}
      </div>
      <div className="text-[10px] font-mono text-muted-foreground mt-2">
        {source === 'tracked' ? 'Tracked profile' : 'Internal search fallback'}
      </div>
    </div>
  );
};

export default OfficeholderCard;
