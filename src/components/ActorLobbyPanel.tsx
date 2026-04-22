// Compact lobby-meetings panel for the ActorDetail page. Shows the politician's
// disclosed meetings with registered lobby organisations, when available.
//
// Empty state is fine: most MEPs have no disclosed meetings (only
// rapporteurs/shadow rapporteurs are required to disclose for specific
// files). The panel disappears when there's nothing to show.

import { Handshake } from 'lucide-react';
import { useLobbyMeetingsForPolitician } from '@/hooks/use-lobby';
import { formatTimestampLabel } from '@/lib/date-display';

interface Props {
  politicianId: string;
}

const ActorLobbyPanel = ({ politicianId }: Props) => {
  const { data: meetings = [], isLoading } = useLobbyMeetingsForPolitician(politicianId);

  if (isLoading || meetings.length === 0) return null;

  return (
    <section className="brutalist-border p-4">
      <h3 className="font-mono text-xs font-bold mb-3 flex items-center gap-2">
        <Handshake className="w-3.5 h-3.5" />
        LOBBY CONTACTS · {meetings.length}
      </h3>
      <div className="space-y-2">
        {meetings.slice(0, 8).map((m) => (
          <div key={m.id} className="brutalist-border-b pb-2 last:border-b-0 last:pb-0">
            <div className="flex items-baseline justify-between gap-2">
              <span className="font-bold text-xs truncate">{m.lobby_organisations?.name || '—'}</span>
              <span className="font-mono text-[10px] text-muted-foreground shrink-0">
                {formatTimestampLabel(m.meeting_date)}
              </span>
            </div>
            {m.subject && (
              <div className="text-[10px] text-muted-foreground mt-0.5 line-clamp-2">{m.subject}</div>
            )}
            {m.lobby_organisations?.category && (
              <div className="font-mono text-[9px] text-muted-foreground mt-0.5">
                {m.lobby_organisations.category}
              </div>
            )}
          </div>
        ))}
      </div>
      {meetings.length > 8 && (
        <div className="font-mono text-[10px] text-muted-foreground mt-2">
          +{meetings.length - 8} more disclosed meetings
        </div>
      )}
    </section>
  );
};

export default ActorLobbyPanel;
