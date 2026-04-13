import { describe, expect, it } from 'vitest';
import { getAvailabilityHeatmapCellStyle } from '@/lib/data-availability-heatmap';

describe('data availability heatmap styling', () => {
  it('uses darker backgrounds for dark mode heatmap cells', () => {
    expect(getAvailabilityHeatmapCellStyle(100, 'dark')).toEqual({
      backgroundColor: 'hsl(142 56% 50%)',
      color: 'hsl(220 15% 8%)',
      boxShadow: 'inset 0 0 0 1px hsl(40 15% 90% / 0.08)',
    });
  });

  it('keeps low-completeness dark cells readable with light text', () => {
    expect(getAvailabilityHeatmapCellStyle(24, 'dark')).toEqual({
      backgroundColor: 'hsl(0 42% 26%)',
      color: 'hsl(40 15% 90%)',
      boxShadow: 'inset 0 0 0 1px hsl(40 15% 90% / 0.08)',
    });
  });

  it('keeps light mode cells readable without changing the existing semantic palette', () => {
    expect(getAvailabilityHeatmapCellStyle(24, 'light')).toEqual({
      backgroundColor: 'hsl(0 32% 81%)',
      color: 'hsl(220 15% 10%)',
      boxShadow: 'inset 0 0 0 1px hsl(220 15% 10% / 0.05)',
    });
  });

  it('clamps malformed percentages into the supported 0-100 range', () => {
    expect(getAvailabilityHeatmapCellStyle(-25, 'light')).toEqual({
      backgroundColor: 'hsl(0 46% 88%)',
      color: 'hsl(220 15% 10%)',
      boxShadow: 'inset 0 0 0 1px hsl(220 15% 10% / 0.05)',
    });

    expect(getAvailabilityHeatmapCellStyle(Number.NaN, 'dark')).toEqual({
      backgroundColor: 'hsl(0 56% 18%)',
      color: 'hsl(40 15% 90%)',
      boxShadow: 'inset 0 0 0 1px hsl(40 15% 90% / 0.08)',
    });
  });
});
