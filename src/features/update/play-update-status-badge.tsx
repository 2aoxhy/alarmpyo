import { StatusBadge } from '@/components/status-badge';
import { useAppTheme } from '@/hooks/use-app-theme';

import type { PlayUpdateStatusBadge as PlayUpdateStatusBadgeModel } from './play-update-notice-policy';

export function PlayUpdateStatusBadge({
  badge,
}: {
  badge: PlayUpdateStatusBadgeModel;
}) {
  const { palette } = useAppTheme();
  const colors =
    badge.tone === 'success'
      ? { background: palette.mintSoft, border: palette.mint, foreground: palette.mint }
      : badge.tone === 'warning'
        ? { background: palette.amberSoft, border: palette.amber, foreground: palette.amber }
        : badge.tone === 'danger'
          ? { background: palette.dangerSoft, border: palette.danger, foreground: palette.danger }
          : { background: palette.blueSoft, border: palette.blue, foreground: palette.blue };

  return (
    <StatusBadge
      backgroundColor={colors.background}
      borderColor={colors.border}
      foregroundColor={colors.foreground}
      label={badge.label}
      maxFontSizeMultiplier={1.3}
    />
  );
}

