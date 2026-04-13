import { useState } from 'react';
import type { ActorEvent } from '@/data/domain';
import { eventTypeLabels, sourceLabels, sourceColors } from '@/data/domain';

interface Props {
  events: ActorEvent[];
}

const eventTypeColor: Record<ActorEvent['type'], string> = {
  vote: 'border-primary',
  speech: 'border-accent',
  committee_join: 'border-green-600',
  committee_leave: 'border-destructive',
  election: 'border-yellow-600',
  appointment: 'border-blue-600',
  resignation: 'border-destructive',
  scandal: 'border-red-700',
  policy_change: 'border-purple-600',
  party_switch: 'border-orange-600',
  legislation_sponsored: 'border-green-600',
  foreign_meeting: 'border-blue-500',
  lobbying_meeting: 'border-amber-500',
  corporate_event: 'border-amber-600',
  financial_disclosure: 'border-emerald-500',
  social_media: 'border-sky-500',
  travel: 'border-indigo-500',
  donation_received: 'border-yellow-500',
  public_statement: 'border-violet-500',
  court_case: 'border-red-600',
  media_appearance: 'border-pink-500',
};

const sentimentIcon: Record<string, string> = {
  positive: '↑',
  negative: '↓',
  neutral: '→',
};

const ActorTimeline = ({ events }: Props) => {
  const [filter, setFilter] = useState<string>('all');
  const [sourceFilter, setSourceFilter] = useState<string>('all');

  const types = Array.from(new Set(events.map(e => e.type)));
  const sources = Array.from(new Set(events.map(e => e.source).filter(Boolean))) as NonNullable<ActorEvent['source']>[];

  let filtered = filter === 'all' ? events : events.filter(e => e.type === filter);
  if (sourceFilter !== 'all') {
    filtered = filtered.filter(e => e.source === sourceFilter);
  }

  return (
    <div>
      {/* Type filter chips */}
      <div className="flex flex-wrap gap-1 mb-2">
        <button
          onClick={() => setFilter('all')}
          className={`evidence-tag text-xs cursor-pointer transition-colors ${filter === 'all' ? 'bg-primary text-primary-foreground' : ''}`}
        >
          ALL ({events.length})
        </button>
        {types.map(t => (
          <button
            key={t}
            onClick={() => setFilter(t)}
            className={`evidence-tag text-xs cursor-pointer transition-colors ${filter === t ? 'bg-primary text-primary-foreground' : ''}`}
          >
            {eventTypeLabels[t]} ({events.filter(e => e.type === t).length})
          </button>
        ))}
      </div>

      {/* Source filter chips */}
      <div className="flex flex-wrap gap-1 mb-4">
        <span className="font-mono text-xs text-muted-foreground mr-1 self-center">SRC:</span>
        <button
          onClick={() => setSourceFilter('all')}
          className={`evidence-tag text-xs cursor-pointer transition-colors ${sourceFilter === 'all' ? 'bg-secondary text-secondary-foreground' : ''}`}
        >
          ALL
        </button>
        {sources.map(s => (
          <button
            key={s}
            onClick={() => setSourceFilter(s)}
            className={`text-xs cursor-pointer px-1.5 py-0.5 rounded transition-colors ${sourceFilter === s ? sourceColors[s] + ' font-bold' : sourceColors[s] + ' opacity-60'}`}
          >
            {sourceLabels[s]}
          </button>
        ))}
      </div>

      {/* Timeline */}
      <div className="relative">
        {/* Vertical line */}
        <div className="absolute left-[19px] top-0 bottom-0 w-px bg-border" />

        {filtered.length === 0 && (
          <div className="pl-12 font-mono text-xs text-muted-foreground py-4">No events match filters.</div>
        )}

        {filtered.map((event) => (
          <div key={event.id} className="relative pl-12 pb-6 last:pb-0 group">
            {/* Node */}
            <div className={`absolute left-3 top-1.5 w-[14px] h-[14px] rounded-full border-2 bg-background ${eventTypeColor[event.type] || 'border-muted-foreground'} transition-transform group-hover:scale-125`} />

            {/* Content */}
            <div className="brutalist-border p-3 bg-background hover:bg-secondary/50 transition-colors">
              <div className="flex items-start justify-between gap-2 mb-1">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="evidence-tag text-xs">{eventTypeLabels[event.type]}</span>
                  {event.source && (
                    <span className={`text-xs px-1.5 py-0.5 rounded font-mono ${sourceColors[event.source]}`}>
                      {sourceLabels[event.source]}
                    </span>
                  )}
                  {event.trustLevel != null && (
                    <span
                      title={
                        event.trustLevel === 1 ? 'Official primary source' :
                        event.trustLevel === 2 ? 'Authoritative secondary source' :
                        event.trustLevel === 3 ? 'Derived / heuristic match' :
                        'Low-confidence / inferred'
                      }
                      className={`text-[10px] px-1 py-0.5 rounded font-mono ${
                        event.trustLevel === 1 ? 'bg-primary/10 text-primary' :
                        event.trustLevel === 2 ? 'bg-green-500/10 text-green-700 dark:text-green-400' :
                        event.trustLevel === 3 ? 'bg-amber-500/10 text-amber-700 dark:text-amber-400' :
                        'bg-purple-500/10 text-purple-700 dark:text-purple-400'
                      }`}
                    >
                      T{event.trustLevel}
                    </span>
                  )}
                  {event.sentiment && (
                    <span className={`text-xs font-mono px-1 py-0.5 rounded ${
                      event.sentiment === 'positive' ? 'text-green-600' :
                      event.sentiment === 'negative' ? 'text-red-600' : 'text-muted-foreground'
                    }`}>
                      {sentimentIcon[event.sentiment]}
                    </span>
                  )}
                  <span className="font-mono text-xs text-muted-foreground">{event.hash}</span>
                </div>
                <span className="font-mono text-xs text-muted-foreground whitespace-nowrap">
                  {new Date(event.timestamp).toLocaleDateString()}
                </span>
              </div>

              <h3 className="font-bold text-sm mb-1">{event.title}</h3>
              <p className="text-xs text-muted-foreground">{event.description}</p>

              {/* Entities */}
              {event.entities && event.entities.length > 0 && (
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {event.entities.map(entity => (
                    <span key={entity} className="text-xs font-mono bg-secondary px-1.5 py-0.5 rounded">
                      {entity}
                    </span>
                  ))}
                </div>
              )}

              {/* Diff block */}
              {event.diff && (
                <div className="mt-2 font-mono text-xs brutalist-border p-2 bg-secondary/50">
                  {event.diff.removed && <div className="diff-removed">- {event.diff.removed}</div>}
                  {event.diff.added && <div className="diff-added">+ {event.diff.added}</div>}
                </div>
              )}

              {/* Source handle + evidence */}
              <div className="mt-2 flex items-center gap-2 font-mono text-xs text-muted-foreground">
                <span>{event.evidenceCount} evidence{event.evidenceCount !== 1 ? 's' : ''}</span>
                {event.sourceHandle && (
                  <span className="text-sky-600 dark:text-sky-400">{event.sourceHandle}</span>
                )}
                {event.sourceUrl && <a href={event.sourceUrl} className="text-accent underline">source →</a>}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default ActorTimeline;
