import { useState } from 'react';
import { MapPinned } from 'lucide-react';

interface CountryShapeCardProps {
  countryName: string;
  locatorMapUrl: string;
}

const CountryShapeCard = ({ countryName, locatorMapUrl }: CountryShapeCardProps) => {
  const [isExpanded, setIsExpanded] = useState(false);

  const renderCard = (mode: 'compact' | 'expanded') => (
    <div
      aria-label={mode === 'expanded' ? `Expanded ${countryName} country shape panel` : undefined}
      className={`brutalist-border bg-card overflow-hidden ${
        mode === 'compact' ? 'cursor-zoom-in' : 'w-full max-w-[920px] shadow-2xl'
      }`}
      onMouseLeave={mode === 'expanded' ? () => setIsExpanded(false) : undefined}
    >
      <div className="px-4 py-3 brutalist-border-b bg-secondary flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <MapPinned className="w-3 h-3 text-muted-foreground" />
          <div>
            <p className="text-[10px] font-mono font-bold text-muted-foreground">COUNTRY SHAPE</p>
            <p className="text-sm font-bold">{countryName}</p>
          </div>
        </div>
        <div className="text-right font-mono text-[10px] text-muted-foreground uppercase">
          {mode === 'compact' ? 'Hover to expand' : 'Move away to close'}
        </div>
      </div>

      <div className={`bg-background flex items-center justify-center ${mode === 'compact' ? 'p-4 min-h-[180px]' : 'p-8 min-h-[75vh]'}`}>
        <img
          src={locatorMapUrl}
          alt={`${countryName} map`}
          className={mode === 'compact' ? 'max-h-48 w-full object-contain' : 'max-h-[65vh] w-full object-contain'}
        />
      </div>
    </div>
  );

  return (
    <>
      <div aria-label={`Focus ${countryName} country shape`} onMouseEnter={() => setIsExpanded(true)}>
        {renderCard('compact')}
      </div>

      {isExpanded && (
        <div
          aria-label={`Expanded ${countryName} country shape`}
          className="fixed inset-0 z-50 bg-background/90 backdrop-blur-sm flex items-center justify-center p-6"
        >
          {renderCard('expanded')}
        </div>
      )}
    </>
  );
};

export default CountryShapeCard;
