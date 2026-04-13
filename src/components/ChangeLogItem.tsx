import { Link } from 'react-router-dom';
import type { ChangeLogEntry } from '@/data/domain';
import { typeLabels } from '@/data/domain';

const typeColors: Record<ChangeLogEntry['type'], string> = {
  proposal_added: 'bg-success/10',
  revision: 'bg-accent/10',
  correction: 'bg-destructive/10',
  ingestion: 'bg-secondary',
  forecast_update: 'bg-warning/10',
};

const ChangeLogItem = ({ entry }: { entry: ChangeLogEntry }) => {
  const time = new Date(entry.timestamp);
  const timeStr = time.toLocaleTimeString('de-CH', { hour: '2-digit', minute: '2-digit' });
  const dateStr = time.toLocaleDateString('de-CH');

  const linkPath = entry.subjectType === 'actor'
    ? `/actors/${entry.subjectId}`
    : `/proposals/${entry.subjectId}`;

  return (
    <div className="brutalist-border-b py-4 grid grid-cols-[auto_1fr] gap-4">
      <div className="font-mono text-xs text-muted-foreground w-20 pt-0.5 shrink-0">
        <div>{dateStr}</div>
        <div>{timeStr}</div>
      </div>
      <div className="min-w-0">
        <div className="flex items-start gap-2 flex-wrap mb-1">
          <span className={`evidence-tag ${typeColors[entry.type]}`}>
            {typeLabels[entry.type]}
          </span>
          <span className="font-bold text-sm leading-tight">{entry.title}</span>
        </div>
        <Link
          to={linkPath}
          className="text-accent underline underline-offset-2 text-sm font-medium hover:opacity-70 block mb-1"
        >
          {entry.subject}
        </Link>
        <p className="text-sm text-muted-foreground leading-relaxed">{entry.summary}</p>
        <div className="mt-2 font-mono text-xs text-muted-foreground flex gap-4">
          <span>rev:{entry.revisionId.slice(4, 12)}</span>
          {entry.evidenceCount > 0 && (
            <span>{entry.evidenceCount} sources</span>
          )}
        </div>
      </div>
    </div>
  );
};

export default ChangeLogItem;
