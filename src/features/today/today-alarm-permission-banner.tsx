import { useEffect, useRef } from 'react';
import { AccessibilityInfo } from 'react-native';

import { StatusBanner } from '../../design-system';
import type { TodayAlarmPermissionGuideViewModel } from './today-alarm-permission-guide-model';

export function TodayAlarmPermissionBanner({
  busy,
  completionRevision,
  launchError,
  onOpenSettings,
  viewModel,
}: {
  busy: boolean;
  completionRevision: number;
  launchError: string | null;
  onOpenSettings: () => void;
  viewModel: TodayAlarmPermissionGuideViewModel | null;
}) {
  const announcedCompletionRef = useRef(0);
  useEffect(() => {
    if (
      completionRevision <= 0 ||
      completionRevision === announcedCompletionRef.current
    ) {
      return;
    }
    announcedCompletionRef.current = completionRevision;
    void AccessibilityInfo.announceForAccessibility(
      '필수 알람 권한 설정 완료',
    );
  }, [completionRevision]);

  if (!viewModel) return null;

  return (
    <StatusBanner
      actionLabel={busy ? '여는 중' : viewModel.actionLabel}
      announceOnMount
      message={launchError ?? viewModel.message}
      onAction={busy ? undefined : onOpenSettings}
      testID="today-alarm-permission-banner"
      title={launchError ? '권한 설정 열기 실패' : viewModel.title}
      tone={launchError ? 'danger' : 'warning'}
    />
  );
}
