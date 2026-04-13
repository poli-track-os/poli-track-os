import { ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, Label } from 'recharts';
import { IDEOLOGY_COLORS, IDEOLOGY_IDEAL_X, getIdeologyColor, getIdeologyDisplayLabel, getIdeologyFamily, hasRenderableCompassPosition } from '@/lib/political-positioning';

export interface PoliticalPosition {
  id?: string;
  politician_id?: string;
  economic_score?: number | null;
  social_score?: number | null;
  eu_integration_score?: number | null;
  environmental_score?: number | null;
  immigration_score?: number | null;
  education_priority?: number | null;
  science_priority?: number | null;
  healthcare_priority?: number | null;
  defense_priority?: number | null;
  economy_priority?: number | null;
  justice_priority?: number | null;
  social_welfare_priority?: number | null;
  environment_priority?: number | null;
  ideology_label?: string | null;
  key_positions?: Record<string, string> | null;
  data_source?: string | null;
}

interface CompassProps {
  positions: Array<PoliticalPosition & { name?: string }>;
  highlightId?: string;
  height?: number;
  showIdeologyLines?: boolean;
}

export function PoliticalCompassChart({ positions, highlightId, height = 400, showIdeologyLines = true }: CompassProps) {
  const bgData = positions
    .filter(hasRenderableCompassPosition)
    .filter(p => !highlightId || p.politician_id !== highlightId)
    .map(p => ({
      x: Number(p.economic_score),
      y: Number(p.social_score),
      name: p.name || p.politician_id?.slice(0, 8) || 'Unknown',
      ideology: getIdeologyDisplayLabel(p.ideology_label),
      ideologyFamily: getIdeologyFamily(p.ideology_label),
      id: p.politician_id,
    }));

  const highlighted = highlightId
    ? positions.filter(hasRenderableCompassPosition).filter(p => p.politician_id === highlightId).map(p => ({
        x: Number(p.economic_score),
        y: Number(p.social_score),
        name: p.name || p.politician_id?.slice(0, 8) || 'Unknown',
        ideology: getIdeologyDisplayLabel(p.ideology_label),
        ideologyFamily: getIdeologyFamily(p.ideology_label),
        id: p.politician_id,
      }))
    : [];

  // Determine which ideologies are present in data
  const presentIdeologies = new Set(
    positions
      .filter(hasRenderableCompassPosition)
      .map((p) => getIdeologyFamily(p.ideology_label)),
  );

  const renderTooltip = ({ active, payload }: any) => {
    if (!active || !payload?.[0]) return null;
    const d = payload[0].payload;
    return (
      <div className="brutalist-border bg-card p-2 text-xs font-mono shadow-lg">
        <div className="font-bold">{d.name}</div>
        <div className="text-muted-foreground">{d.ideology}</div>
        <div>Econ: {d.x} · Social: {d.y}</div>
      </div>
    );
  };

  const BgDot = (props: any) => {
    const { cx, cy, payload } = props;
    if (cx == null || cy == null) return null;
    return (
      <circle cx={cx} cy={cy} r={3} fill={getIdeologyColor(payload.ideologyFamily)} opacity={highlightId ? 0.15 : 0.6} />
    );
  };

  const HighlightDot = (props: any) => {
    const { cx, cy, payload } = props;
    if (cx == null || cy == null) return null;
    return (
      <circle cx={cx} cy={cy} r={10} fill={getIdeologyColor(payload.ideologyFamily)} opacity={1} stroke="hsl(var(--foreground))" strokeWidth={2.5} />
    );
  };

  return (
    <ResponsiveContainer width="100%" height={height}>
      <ScatterChart margin={{ top: 20, right: 20, bottom: 40, left: 30 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
        <XAxis type="number" dataKey="x" domain={[-10, 10]} name="Economic"
          tick={{ fontSize: 10, fontFamily: 'monospace' }} stroke="hsl(var(--muted-foreground))">
          <Label value="← Left — Economic — Right →" position="bottom" offset={15} style={{ fontSize: 10, fontFamily: 'monospace', fill: 'hsl(var(--muted-foreground))' }} />
        </XAxis>
        <YAxis type="number" dataKey="y" domain={[-10, 10]} name="Social"
          tick={{ fontSize: 10, fontFamily: 'monospace' }} stroke="hsl(var(--muted-foreground))">
          <Label value="← Liberal — Social — Auth →" angle={-90} position="left" offset={10} style={{ fontSize: 10, fontFamily: 'monospace', fill: 'hsl(var(--muted-foreground))' }} />
        </YAxis>

        {/* Center reference lines */}
        <ReferenceLine x={0} stroke="hsl(var(--muted-foreground))" strokeDasharray="5 5" strokeOpacity={0.5} />
        <ReferenceLine y={0} stroke="hsl(var(--muted-foreground))" strokeDasharray="5 5" strokeOpacity={0.5} />

        {/* Ideology ideal position lines */}
        {showIdeologyLines && Object.entries(IDEOLOGY_IDEAL_X)
          .filter(([label]) => presentIdeologies.has(label as keyof typeof IDEOLOGY_IDEAL_X))
          .map(([label, xPos]) => (
            <ReferenceLine
              key={label}
              x={xPos}
              stroke={IDEOLOGY_COLORS[label as keyof typeof IDEOLOGY_COLORS] || 'hsl(0,0%,50%)'}
              strokeDasharray="8 4"
              strokeOpacity={0.45}
              strokeWidth={1.5}
            />
          ))
        }

        <Tooltip content={renderTooltip} />

        {/* Background dots */}
        <Scatter data={bgData} shape={<BgDot />} />

        {/* Highlighted politician */}
        {highlighted.length > 0 && (
          <Scatter data={highlighted} shape={<HighlightDot />} />
        )}
      </ScatterChart>
    </ResponsiveContainer>
  );
}

export function IdeologyLegend() {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2">
      {Object.entries(IDEOLOGY_COLORS).map(([label, color]) => (
        <div key={label} className="flex items-center gap-1.5 text-[10px] font-mono">
          <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
          {label}
          {IDEOLOGY_IDEAL_X[label] !== undefined && (
            <span className="text-muted-foreground ml-0.5">({IDEOLOGY_IDEAL_X[label] > 0 ? '+' : ''}{IDEOLOGY_IDEAL_X[label]})</span>
          )}
        </div>
      ))}
    </div>
  );
}

export { getIdeologyColor, IDEOLOGY_COLORS };
