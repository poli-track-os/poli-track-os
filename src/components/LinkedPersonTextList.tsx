import { Fragment } from 'react';
import { Link } from 'react-router-dom';
import { ExternalLink } from 'lucide-react';

export interface LinkedPersonEntry {
  href?: string;
  name: string;
  sourceUrl?: string;
}

interface LinkedPersonTextListProps {
  emptyLabel?: string;
  linkAriaLabelPrefix?: string;
  people: LinkedPersonEntry[];
  sourceLinkAriaLabelPrefix?: string;
}

const LinkedPersonTextList = ({
  emptyLabel = '—',
  linkAriaLabelPrefix = 'View',
  people,
  sourceLinkAriaLabelPrefix = 'Open source for',
}: LinkedPersonTextListProps) => {
  if (people.length === 0) {
    return <>{emptyLabel}</>;
  }

  return (
    <>
      {people.map((person, index) => {
        const key = `${person.name}-${person.href || 'plain'}-${person.sourceUrl || 'nosource'}`;
        const label = `${linkAriaLabelPrefix} ${person.name}`;
        const sourceLabel = `${sourceLinkAriaLabelPrefix} ${person.name}`;

        return (
          <Fragment key={key}>
            {index > 0 && ', '}
            <span className="inline-flex max-w-full flex-wrap items-center gap-1 align-baseline">
              {!person.href ? (
                <span className="break-words">{person.name}</span>
              ) : person.href.startsWith('/') ? (
                <Link to={person.href} aria-label={label} className="break-words hover:underline">
                  {person.name}
                </Link>
              ) : (
                <a href={person.href} target="_blank" rel="noopener noreferrer" aria-label={label} className="break-words hover:underline">
                  {person.name}
                </a>
              )}
              {person.sourceUrl && (
                <a
                  href={person.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={sourceLabel}
                  className="inline-flex items-center justify-center rounded border border-border px-1 py-0.5 text-[10px] text-muted-foreground hover:text-accent hover:border-accent"
                >
                  <ExternalLink className="h-2.5 w-2.5" />
                </a>
              )}
            </span>
          </Fragment>
        );
      })}
    </>
  );
};

export default LinkedPersonTextList;
