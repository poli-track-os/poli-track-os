import { Link } from 'react-router-dom';
import { ExternalLink } from 'lucide-react';
import { getDisplayPersonName } from '@/lib/person-display';

interface OfficeholderCardProps {
  href?: string;
  office: string;
  personName: string;
  source: 'tracked' | 'wikidata';
}

const OfficeholderCard = ({ href, office, personName, source }: OfficeholderCardProps) => {
  const displayName = getDisplayPersonName(personName, href);
  const inner = (
    <div className="brutalist-border p-4 bg-card hover:bg-secondary/50 transition-colors h-full">
      <div className="text-[10px] font-mono text-muted-foreground uppercase tracking-wide">{office}</div>
      <div className="text-sm font-bold mt-2 flex items-center gap-2">
        <span>{displayName}</span>
        {source === 'wikidata' && href && <ExternalLink className="w-3.5 h-3.5 text-muted-foreground" />}
      </div>
      <div className="text-[10px] font-mono text-muted-foreground mt-2">
        {source === 'tracked' ? 'Tracked profile' : 'Wikipedia / Wikidata reference'}
      </div>
    </div>
  );

  if (!href) {
    return inner;
  }

  if (href.startsWith('/')) {
    return (
      <Link to={href} aria-label={`View ${displayName}`} className="block">
        {inner}
      </Link>
    );
  }

  return (
    <a href={href} target="_blank" rel="noopener noreferrer" aria-label={`View ${displayName}`} className="block">
      {inner}
    </a>
  );
};

export default OfficeholderCard;
