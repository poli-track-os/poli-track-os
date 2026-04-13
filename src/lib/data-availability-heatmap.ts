import type { ThemeMode } from '@/hooks/use-theme-mode';

function clampPercentage(value: number) {
  if (!Number.isFinite(value)) return 0;

  return Math.max(0, Math.min(100, value));
}

export function getAvailabilityHeatmapCellStyle(value: number, theme: ThemeMode) {
  const percentage = clampPercentage(value);
  const hue = percentage >= 50 ? 142 : 0;
  const saturation = Math.round((theme === 'dark' ? 28 : 18) + Math.abs(percentage - 50) * 0.55);
  const lightness = theme === 'dark'
    ? Math.round(18 + percentage * 0.32)
    : Math.round(88 - percentage * 0.28);
  const color = theme === 'dark'
    ? lightness >= 42 ? 'hsl(220 15% 8%)' : 'hsl(40 15% 90%)'
    : lightness <= 62 ? 'hsl(40 20% 97%)' : 'hsl(220 15% 10%)';
  const boxShadow = theme === 'dark'
    ? 'inset 0 0 0 1px hsl(40 15% 90% / 0.08)'
    : 'inset 0 0 0 1px hsl(220 15% 10% / 0.05)';

  return {
    backgroundColor: `hsl(${hue} ${saturation}% ${lightness}%)`,
    color,
    boxShadow,
  };
}
