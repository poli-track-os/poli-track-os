import { Fragment } from 'react';
import { Link } from 'react-router-dom';

export interface LinkedPersonEntry {
  href?: string;
  name: string;
}

interface LinkedPersonTextListProps {
  emptyLabel?: string;
  linkAriaLabelPrefix?: string;
  people: LinkedPersonEntry[];
}

const LinkedPersonTextList = ({
  emptyLabel = '—',
  linkAriaLabelPrefix = 'View',
  people,
}: LinkedPersonTextListProps) => {
  if (people.length === 0) {
    return <>{emptyLabel}</>;
  }

  return (
    <>
      {people.map((person, index) => {
        const key = `${person.name}-${person.href || 'plain'}`;
        const label = `${linkAriaLabelPrefix} ${person.name}`;

        return (
          <Fragment key={key}>
            {index > 0 && ', '}
            {!person.href ? (
              <span>{person.name}</span>
            ) : person.href.startsWith('/') ? (
              <Link to={person.href} aria-label={label} className="hover:underline">
                {person.name}
              </Link>
            ) : (
              <a href={person.href} target="_blank" rel="noopener noreferrer" aria-label={label} className="hover:underline">
                {person.name}
              </a>
            )}
          </Fragment>
        );
      })}
    </>
  );
};

export default LinkedPersonTextList;
