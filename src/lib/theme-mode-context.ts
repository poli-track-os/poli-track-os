import { createContext, useContext } from 'react';
import type { ThemeMode } from '@/hooks/use-theme-mode';

export interface ThemeModeContextValue {
  theme: ThemeMode;
  toggleTheme: () => void;
}

export const ThemeModeContext = createContext<ThemeModeContextValue>({
  theme: 'light',
  toggleTheme: () => {},
});

export function useThemeModeContext() {
  return useContext(ThemeModeContext);
}
