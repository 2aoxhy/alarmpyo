import { router, type Href } from 'expo-router';
import { StyleSheet, useWindowDimensions } from 'react-native';

import {
  ListRow,
  MenuDivider,
  MenuGroup,
  Screen,
} from '@/components/ui-kit';
import { spacing, type AppPalette } from '@/constants/app-theme';
import { dataCopy } from '@/content/data-copy';
import { PageHeader } from '@/design-system';
import { formatSettingsWorkSummary } from '@/features/settings/settings-work-summary';
import {
  areSettingsHomeDataEqual,
  selectSettingsData,
} from '@/features/settings/settings-store-selection';
import { useGlobalPlayUpdate } from '@/features/update/global-play-update-controller';
import { PlayUpdateStatusBadge } from '@/features/update/play-update-status-badge';
import { useThemedStyles } from '@/hooks/use-themed-styles';
import { useAppSelector } from '@/store/app-store';
import {
  getWorkPatternDisplayName,
  getWorkPatternPreset,
  getWorkPatternPresetId,
} from '@/utils/work-pattern';

export default function SettingsHome() {
  const data = useAppSelector(selectSettingsData, areSettingsHomeDataEqual);
  const { badge: playUpdateBadge } = useGlobalPlayUpdate();
  const styles = useThemedStyles(createStyles);
  const { fontScale, width } = useWindowDimensions();
  const presetId = getWorkPatternPresetId(data.pattern.shiftTypeIds);
  const patternLabel =
    presetId === 'custom'
      ? getWorkPatternDisplayName(data.pattern.shiftTypeIds, data.pattern.name)
      : getWorkPatternPreset(presetId).shortName;
  const activeIds = new Set(data.pattern.shiftTypeIds);
  const workSummary = formatSettingsWorkSummary(
    patternLabel,
    data.shiftTypes.filter((shift) => activeIds.has(shift.id)),
    { fontScale, width },
  );
  const alarmLabel = data.settings.notificationsEnabled
    ? data.settings.scheduledNotificationCount > 0
      ? `${data.settings.scheduledNotificationCount}개 예약`
      : '켜짐 · 예약 준비'
    : '꺼짐';
  return (
    <Screen contentStyle={styles.screenContent}>
      <PageHeader align="center" title="설정" />

      <MenuGroup centered title="근무와 알람">
        <ListRow
          icon="options-outline"
          title="근무표와 알람"
          subtitle={`${workSummary} · ${alarmLabel}`}
          onPress={() => router.push('/work-settings-home' as Href)}
          allowSubtitleWrapping
        />
      </MenuGroup>

      <MenuGroup centered title="앱">
        <ListRow
          icon="settings-outline"
          onPress={() => router.push('/display-settings' as Href)}
          subtitle="위젯 정보·추가"
          title="홈 화면 위젯"
        />
        <MenuDivider />
        <ListRow
          icon="download-outline"
          onPress={() => router.push('/data-settings' as Href)}
          subtitle={dataCopy.managementSummary.text}
          title="데이터 관리"
        />
        <MenuDivider />
        <ListRow
          icon="sync"
          onPress={() => router.push('/app-update' as Href)}
          subtitle={playUpdateBadge?.label ?? '설치된 버전 확인'}
          title="앱 업데이트"
          trailing={
            playUpdateBadge ? (
              <PlayUpdateStatusBadge badge={playUpdateBadge} />
            ) : undefined
          }
        />
        <MenuDivider />
        <ListRow
          icon="shield-outline"
          onPress={() => router.push('/privacy' as Href)}
          subtitle="앱 정보 · 개인정보 · 권한 사용"
          title="앱 정보·개인정보"
        />
      </MenuGroup>
    </Screen>
  );
}

const createStyles = (_palette: AppPalette) =>
  StyleSheet.create({
    screenContent: {
      gap: spacing.large,
      paddingTop: spacing.medium,
    },
  });
