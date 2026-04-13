import { useId } from 'react';

interface CountryMiniGlobeProps {
  coordinates?: {
    lat: number;
    lon: number;
  };
  countryName: string;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

const CountryMiniGlobe = ({ coordinates, countryName }: CountryMiniGlobeProps) => {
  const baseClipPathId = useId();
  const x = coordinates ? 60 + (clamp(coordinates.lon, -180, 180) / 180) * 34 : 60;
  const y = coordinates ? 60 - (clamp(coordinates.lat, -90, 90) / 90) * 24 : 60;

  return (
    <div className="brutalist-border bg-card p-4">
      <div className="flex items-center justify-between gap-3 mb-3">
        <div>
          <p className="text-[10px] font-mono font-bold text-muted-foreground">POSITION ON THE GLOBE</p>
          <p className="text-sm font-bold">{countryName}</p>
        </div>
        <div className="text-right font-mono text-[10px] text-muted-foreground">
          {coordinates ? (
            <>
              <div>{coordinates.lat.toFixed(2)}° lat</div>
              <div>{coordinates.lon.toFixed(2)}° lon</div>
            </>
          ) : (
            <div className="uppercase">Coordinates unavailable</div>
          )}
        </div>
      </div>

      <svg
        viewBox="0 0 120 120"
        className="aspect-square mx-auto w-full max-w-[220px]"
      >
        <defs>
          <clipPath id={baseClipPathId}>
            <circle cx="60" cy="60" r="46" />
          </clipPath>
        </defs>

        <circle cx="60" cy="60" r="46" fill="hsl(var(--secondary))" stroke="hsl(var(--border))" strokeWidth="2.5" />

        <g clipPath={`url(#${baseClipPathId})`} opacity="0.8">
          <path d="M12 54 Q24 40 36 52 T60 50 T84 58 T108 52 V108 H12 Z" fill="hsl(var(--accent) / 0.16)" />
          <path d="M18 80 Q36 66 50 78 T84 76 T102 84 V108 H18 Z" fill="hsl(var(--primary) / 0.1)" />

          {[26, 43, 60, 77, 94].map((line) => (
            <ellipse
              key={`lat-${line}`}
              cx="60"
              cy={line}
              rx="42"
              ry={Math.max(Math.abs(line - 60) / 4, 5)}
              fill="none"
              stroke="hsl(var(--border) / 0.18)"
              strokeWidth="1"
            />
          ))}

          {[28, 44, 60, 76, 92].map((line) => (
            <path
              key={`lon-${line}`}
              d={`M ${line} 18 Q ${60} 60 ${line} 102`}
              fill="none"
              stroke="hsl(var(--border) / 0.18)"
              strokeWidth="1"
            />
          ))}
        </g>

        {coordinates ? (
          <>
            <circle cx={x} cy={y} r="5.5" fill="hsl(var(--accent))" stroke="hsl(var(--border))" strokeWidth="2" />
            <circle cx={x} cy={y} r="12" fill="none" stroke="hsl(var(--accent) / 0.35)" strokeWidth="2" />
          </>
        ) : (
          <text x="60" y="64" textAnchor="middle" className="fill-muted-foreground font-mono text-[7px]">
            COORDINATES UNAVAILABLE
          </text>
        )}
      </svg>
    </div>
  );
};

export default CountryMiniGlobe;
