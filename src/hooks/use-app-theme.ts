import { useContext } from 'react';

import { AppThemeContext } from '@/providers/app-theme-provider';

export function useAppTheme() {
  return useContext(AppThemeContext);
}
