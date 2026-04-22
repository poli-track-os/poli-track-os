import { RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer, Tooltip } from 'recharts';
import type { PoliticalPosition } from './PoliticalCompass';

interface PolicyRadarProps {
  position: PoliticalPosition;
  height?: number;
}

export function PolicyRadarChart({ position, height = 300 }: PolicyRadarProps) {
  const data = [
    { domain: 'Education', value: position.education_priority },
    { domain: 'Science', value: position.science_priority },
    { domain: 'Healthcare', value: position.healthcare_priority },
    { domain: 'Defense', value: position.defense_priority },
    { domain: 'Economy', value: position.economy_priority },
    { domain: 'Justice', value: position.justice_priority },
    { domain: 'Social Welfare', value: position.social_welfare_priority },
    { domain: 'Environment', value: position.environment_priority },
  ];

  return (
    <ResponsiveContainer width="100%" height={height}>
      <RadarChart data={data} cx="50%" cy="50%" outerRadius="75%">
        <PolarGrid stroke="hsl(var(--border))" />
        <PolarAngleAxis dataKey="domain" tick={{ fontSize: 10, fontFamily: 'monospace', fill: 'hsl(var(--muted-foreground))' }} />
        <PolarRadiusAxis domain={[0, 10]} tick={{ fontSize: 9 }} tickCount={6} stroke="hsl(var(--muted-foreground))" />
        <Tooltip
          content={({ active, payload }) => {
            if (!active || !payload?.[0]) return null;
            return (
              <div className="brutalist-border bg-card p-2 text-xs font-mono shadow-lg">
                <div className="font-bold">{payload[0].payload.domain}</div>
                <div>Priority: {payload[0].value}/10</div>
              </div>
            );
          }}
        />
        <Radar dataKey="value" stroke="hsl(var(--primary))" fill="hsl(var(--primary))" fillOpacity={0.25} strokeWidth={2} />
      </RadarChart>
    </ResponsiveContainer>
  );
}

interface AxesBarProps {
  position: PoliticalPosition;
}

export function PoliticalAxesBar({ position }: AxesBarProps) {
  const axes = [
    { label: 'Economic', value: position.economic_score, left: 'Left', right: 'Right' },
    { label: 'Social', value: position.social_score, left: 'Liberal', right: 'Authoritarian' },
    { label: 'EU Integration', value: position.eu_integration_score, left: 'Eurosceptic', right: 'Pro-EU' },
    { label: 'Environment', value: position.environmental_score, left: 'Anti-Green', right: 'Pro-Green' },
    { label: 'Immigration', value: position.immigration_score, left: 'Restrictive', right: 'Open' },
  ];

  return (
    <div className="space-y-3">
      {axes.map(ax => {
        // CRITICAL: a null/undefined score must NOT render as a 50% bar
        // ("centered at 0" implies "moderate", which is misleading). Only
        // render the indicator when the value is a finite number.
        const numeric = typeof ax.value === 'number' && Number.isFinite(ax.value)
          ? ax.value
          : null;
        const pct = numeric !== null ? ((numeric + 10) / 20) * 100 : null;
        return (
          <div key={ax.label}>
            <div className="flex justify-between text-[10px] font-mono text-muted-foreground mb-0.5">
              <span>{ax.left}</span>
              <span className="font-bold text-foreground">
                {ax.label}
                {pct === null && <span className="ml-1 text-[9px] italic">(no data)</span>}
              </span>
              <span>{ax.right}</span>
            </div>
            <div className="h-2.5 bg-muted rounded-full relative overflow-hidden">
              <div className="absolute inset-y-0 left-1/2 w-px bg-border" />
              {pct !== null && (
                <div
                  className="absolute top-0 h-full w-3 rounded-full bg-primary"
                  style={{ left: `calc(${pct}% - 6px)` }}
                />
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

interface KeyPositionsProps {
  positions: Record<string, string>;
}

export function KeyPositionsList({ positions }: KeyPositionsProps) {
  const stanceColor = (s: string) => {
    const normalized = s.toLowerCase();
    if (
      normalized.includes('support') ||
      normalized.includes('pro-') ||
      normalized === 'pro eu' ||
      normalized === 'increase' ||
      normalized === 'top priority' ||
      normalized === 'open' ||
      normalized === 'expand social welfare' ||
      normalized === 'redistribution / public spending'
    ) return 'bg-green-500/20 text-green-700 dark:text-green-400';
    if (
      normalized.includes('oppos') ||
      normalized === 'reduce' ||
      normalized.includes('sceptic') ||
      normalized === 'restrictive' ||
      normalized === 'anti-green' ||
      normalized === 'tax cuts / market liberalism' ||
      normalized === 'limit expansion' ||
      normalized === 'deprioritize'
    ) return 'bg-red-500/20 text-red-700 dark:text-red-400';
    return 'bg-muted text-muted-foreground';
  };

  return (
    <div className="space-y-1.5">
      {Object.entries(positions).map(([key, val]) => (
        <div key={key} className="flex justify-between items-center text-xs font-mono">
          <span className="capitalize">{key.replace(/_/g, ' ')}</span>
          <span className={`px-2 py-0.5 rounded text-[10px] ${stanceColor(val)}`}>{val}</span>
        </div>
      ))}
    </div>
  );
}
