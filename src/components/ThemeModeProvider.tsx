import type { ReactNode } from 'react';
import { ThemeModeContext, type ThemeModeContextValue } from '@/lib/theme-mode-context';

export function ThemeModeProvider({
  children,
  theme,
  toggleTheme,
}: ThemeModeContextValue & { children: ReactNode }) {
  return (
    <ThemeModeContext.Provider value={{ theme, toggleTheme }}>
      {children}
    </ThemeModeContext.Provider>
  );
}
