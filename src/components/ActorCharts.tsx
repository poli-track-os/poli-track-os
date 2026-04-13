import { useMemo } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, LineChart, Line, CartesianGrid,
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
} from 'recharts';
import type { ActorEvent } from '@/data/domain';
import { eventTypeLabels, sourceLabels } from '@/data/domain';

interface Props {
  events: ActorEvent[];
}

const COLORS = [
  'hsl(215, 30%, 45%)',   // accent
  'hsl(142, 50%, 40%)',   // green
  'hsl(38, 80%, 50%)',    // amber
  'hsl(0, 55%, 45%)',     // red
  'hsl(262, 50%, 50%)',   // purple
  'hsl(200, 70%, 50%)',   // sky
  'hsl(330, 50%, 50%)',   // pink
  'hsl(170, 50%, 40%)',   // teal
];

const ActorCharts = ({ events }: Props) => {
  // Activity over time (monthly)
  const activityByMonth = useMemo(() => {
    const map: Record<string, number> = {};
    events.forEach(e => {
      const d = new Date(e.timestamp);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      map[key] = (map[key] || 0) + 1;
    });
    return Object.entries(map)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, count]) => ({ month, count }));
  }, [events]);

  // Event type breakdown
  const typeBreakdown = useMemo(() => {
    const map: Record<string, number> = {};
    events.forEach(e => {
      map[e.type] = (map[e.type] || 0) + 1;
    });
    return Object.entries(map)
      .sort(([, a], [, b]) => b - a)
      .map(([type, count]) => ({
        name: eventTypeLabels[type as ActorEvent['type']] || type,
        value: count,
      }));
  }, [events]);

  // Source breakdown
  const sourceBreakdown = useMemo(() => {
    const map: Record<string, number> = {};
    events.forEach(e => {
      const src = e.source || 'unknown';
      map[src] = (map[src] || 0) + 1;
    });
    return Object.entries(map)
      .sort(([, a], [, b]) => b - a)
      .map(([source, count]) => ({
        name: sourceLabels[source as keyof typeof sourceLabels] || source,
        value: count,
      }));
  }, [events]);

  // Voting pattern
  const votingPattern = useMemo(() => {
    const votes = events.filter(e => e.type === 'vote');
    const yes = votes.filter(e => e.title.includes('YES')).length;
    const no = votes.filter(e => e.title.includes('NO')).length;
    const abstain = votes.filter(e => e.title.includes('ABSTAIN')).length;
    return [
      { name: 'YES', value: yes },
      { name: 'NO', value: no },
      { name: 'ABSTAIN', value: abstain },
    ].filter(d => d.value > 0);
  }, [events]);

  // Sentiment over time
  const sentimentData = useMemo(() => {
    const map: Record<string, { pos: number; neg: number; neu: number }> = {};
    events.forEach(e => {
      if (!e.sentiment) return;
      const d = new Date(e.timestamp);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      if (!map[key]) map[key] = { pos: 0, neg: 0, neu: 0 };
      if (e.sentiment === 'positive') map[key].pos++;
      else if (e.sentiment === 'negative') map[key].neg++;
      else map[key].neu++;
    });
    return Object.entries(map)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, d]) => ({ month, positive: d.pos, negative: d.neg, neutral: d.neu }));
  }, [events]);

  // Radar: activity categories
  const radarData = useMemo(() => {
    const categories = [
      { key: 'legislative', label: 'Legislative', types: ['vote', 'legislation_sponsored', 'speech'] },
      { key: 'corporate', label: 'Corporate', types: ['lobbying_meeting', 'corporate_event', 'donation_received'] },
      { key: 'financial', label: 'Financial', types: ['financial_disclosure', 'donation_received'] },
      { key: 'social', label: 'Social Media', types: ['social_media'] },
      { key: 'diplomatic', label: 'Diplomatic', types: ['foreign_meeting', 'travel'] },
      { key: 'public', label: 'Public', types: ['public_statement', 'media_appearance'] },
    ];
    return categories.map(cat => ({
      category: cat.label,
      count: events.filter(e => cat.types.includes(e.type)).length,
    }));
  }, [events]);

  const VOTE_COLORS = ['hsl(142, 50%, 40%)', 'hsl(0, 55%, 45%)', 'hsl(40, 10%, 50%)'];

  const tooltipStyle = {
    contentStyle: {
      background: 'hsl(40, 20%, 97%)',
      border: '2px solid hsl(220, 15%, 10%)',
      borderRadius: '0',
      fontFamily: 'JetBrains Mono, monospace',
      fontSize: '11px',
    },
  };

  return (
    <div className="space-y-6">
      {/* Row 1: Activity timeline + Voting */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="brutalist-border p-4">
          <h3 className="font-mono text-xs font-bold mb-3 text-muted-foreground">ACTIVITY OVER TIME</h3>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={activityByMonth}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(220, 15%, 85%)" />
              <XAxis dataKey="month" tick={{ fontSize: 10, fontFamily: 'JetBrains Mono' }} />
              <YAxis allowDecimals={false} tick={{ fontSize: 10, fontFamily: 'JetBrains Mono' }} />
              <Tooltip {...tooltipStyle} />
              <Bar dataKey="count" fill="hsl(215, 30%, 45%)" name="Events" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="brutalist-border p-4">
          <h3 className="font-mono text-xs font-bold mb-3 text-muted-foreground">VOTING RECORD</h3>
          <ResponsiveContainer width="100%" height={180}>
            <PieChart>
              <Pie data={votingPattern} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={65} label={({ name, value }) => `${name}: ${value}`} labelLine={false}>
                {votingPattern.map((_, i) => (
                  <Cell key={i} fill={VOTE_COLORS[i]} />
                ))}
              </Pie>
              <Tooltip {...tooltipStyle} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Row 2: Event types + Sources */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="brutalist-border p-4">
          <h3 className="font-mono text-xs font-bold mb-3 text-muted-foreground">EVENT TYPES</h3>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={typeBreakdown} layout="vertical">
              <XAxis type="number" allowDecimals={false} tick={{ fontSize: 10, fontFamily: 'JetBrains Mono' }} />
              <YAxis type="category" dataKey="name" width={55} tick={{ fontSize: 9, fontFamily: 'JetBrains Mono' }} />
              <Tooltip {...tooltipStyle} />
              <Bar dataKey="value" name="Count">
                {typeBreakdown.map((_, i) => (
                  <Cell key={i} fill={COLORS[i % COLORS.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="brutalist-border p-4">
          <h3 className="font-mono text-xs font-bold mb-3 text-muted-foreground">DATA SOURCES</h3>
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie data={sourceBreakdown} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={70} label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`} labelLine={false}>
                {sourceBreakdown.map((_, i) => (
                  <Cell key={i} fill={COLORS[i % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip {...tooltipStyle} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Row 3: Sentiment + Radar */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {sentimentData.length > 0 && (
          <div className="brutalist-border p-4">
            <h3 className="font-mono text-xs font-bold mb-3 text-muted-foreground">SENTIMENT TIMELINE</h3>
            <ResponsiveContainer width="100%" height={180}>
              <LineChart data={sentimentData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(220, 15%, 85%)" />
                <XAxis dataKey="month" tick={{ fontSize: 10, fontFamily: 'JetBrains Mono' }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 10, fontFamily: 'JetBrains Mono' }} />
                <Tooltip {...tooltipStyle} />
                <Line type="monotone" dataKey="positive" stroke="hsl(142, 50%, 40%)" name="Positive" strokeWidth={2} />
                <Line type="monotone" dataKey="negative" stroke="hsl(0, 55%, 45%)" name="Negative" strokeWidth={2} />
                <Line type="monotone" dataKey="neutral" stroke="hsl(40, 10%, 50%)" name="Neutral" strokeWidth={1} strokeDasharray="4 4" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}

        <div className="brutalist-border p-4">
          <h3 className="font-mono text-xs font-bold mb-3 text-muted-foreground">ACTIVITY PROFILE</h3>
          <ResponsiveContainer width="100%" height={180}>
            <RadarChart data={radarData}>
              <PolarGrid stroke="hsl(220, 15%, 85%)" />
              <PolarAngleAxis dataKey="category" tick={{ fontSize: 9, fontFamily: 'JetBrains Mono' }} />
              <PolarRadiusAxis allowDecimals={false} tick={{ fontSize: 9 }} />
              <Radar dataKey="count" stroke="hsl(215, 30%, 45%)" fill="hsl(215, 30%, 45%)" fillOpacity={0.3} />
            </RadarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
};

export default ActorCharts;
