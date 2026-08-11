import { router, type Href } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import {
  AppText,
  ListRow,
  MenuDivider,
  MenuGroup,
  Screen,
} from '@/components/ui-kit';
import { getCurrentAppUpdateLabel } from '@/constants/app-release';
import { spacing, type AppPalette } from '@/constants/app-theme';
import { formatWakeTimeSummary } from '@/features/shift-settings/shift-settings-model';
import { useAppTheme } from '@/hooks/use-app-theme';
import { useThemedStyles } from '@/hooks/use-themed-styles';
import { getAppDistribution } from '@/services/app-distribution';
import { useAppStoreData } from '@/store/app-store';
import { formatCompactTime } from '@/utils/date';
import { getWorkPatternKind } from '@/utils/work-pattern';

export default function SettingsHome() {
  const { data } = useAppStoreData();
  const { palette } = useAppTheme();
  const styles = useThemedStyles(createStyles);
  const playDistribution = getAppDistribution() === 'play';
  const patternKind = getWorkPatternKind(data.pattern.shiftTypeIds);
  const dayShift = data.shiftTypes.find((shift) => shift.id === 'day');
  const nightShift = data.shiftTypes.find((shift) => shift.id === 'night');
  const patternLabel =
    patternKind === 'weekday'
      ? '주간 고정'
      : patternKind === 'rotation'
        ? '3조 2교대'
        : data.pattern.name;
  const workTimeLabel = [dayShift, patternKind === 'weekday' ? null : nightShift]
    .filter((shift): shift is NonNullable<typeof shift> => Boolean(shift))
    .map((shift) => `${shift.shortName} ${formatCompactTime(shift.startMinutes)}`)
    .join(' · ');
  const wakeTimeLabel = formatWakeTimeSummary(
    data.shiftTypes,
    patternKind !== 'weekday',
  );
  const alarmLabel = data.settings.notificationsEnabled
    ? data.settings.scheduledNotificationCount > 0
      ? `${data.settings.scheduledNotificationCount}개 예약`
      : '켜짐 · 예약 준비'
    : '꺼짐';
  const themeLabel =
    data.settings.themeMode === 'system'
      ? '자동 테마'
      : data.settings.themeMode === 'light'
        ? '라이트 테마'
        : '다크 테마';

  return (
    <Screen contentStyle={styles.screenContent}>
      <View style={styles.header}>
        <AppText accessibilityRole="header" variant="title">
          설정
        </AppText>
        <AppText color={palette.inkMuted} style={styles.headerDescription}>
          필요한 설정을 한 번에 찾을 수 있어요.
        </AppText>
      </View>

      <MenuGroup centered title="근무표">
        <ListRow
          icon="repeat-outline"
          onPress={() => router.push('/pattern')}
          subtitle={patternLabel}
          title="근무 방식"
        />
        <MenuDivider />
        <ListRow
          icon="time-outline"
          onPress={() => router.push('/shift-settings?focus=time')}
          subtitle={workTimeLabel}
          title="근무 시간"
        />
        <MenuDivider />
        <ListRow
          icon="alarm-outline"
          onPress={() => router.push('/shift-settings?focus=wake')}
          subtitle={wakeTimeLabel}
          title="기상 시간"
        />
      </MenuGroup>

      <MenuGroup centered title="알람">
        <ListRow
          icon="alarm-outline"
          onPress={() => router.push('/alarm-settings')}
          subtitle={`${alarmLabel} · 권한과 예약을 확인해요`}
          title="근무 알람"
        />
      </MenuGroup>

      <MenuGroup centered title="앱 관리">
        <ListRow
          icon="settings-outline"
          onPress={() => router.push('/display-settings' as Href)}
          subtitle={`${themeLabel} · 홈 화면 위젯`}
          title="화면·위젯"
        />
        <MenuDivider />
        <ListRow
          icon="download-outline"
          onPress={() => router.push('/data-settings')}
          subtitle="근무 설정 공유와 백업·복구를 관리해요"
          title="데이터"
        />
        <MenuDivider />
        <ListRow
          icon="sync"
          onPress={() => router.push('/app-update')}
          subtitle={
            playDistribution
              ? 'Google Play에서 최신 버전을 확인해요'
              : '새 앱 설치 파일을 확인하고 안전하게 설치해요'
          }
          title={playDistribution ? 'Google Play 업데이트' : '앱 업데이트'}
        />
        <MenuDivider />
        <ListRow
          icon="shield-outline"
          onPress={() => router.push('/privacy' as Href)}
          subtitle="저장·권한·데이터 처리 기준을 확인해요"
          title="개인정보 처리방침"
        />
      </MenuGroup>

      <View style={styles.releaseBlock}>
        <AppText color={palette.inkSoft} style={styles.releaseText} variant="caption">
          알람표 · {getCurrentAppUpdateLabel()}
        </AppText>
        <AppText color={palette.inkSoft} style={styles.releaseText} variant="caption">
          개발자 2aox.hy(윤강현)
        </AppText>
      </View>
    </Screen>
  );
}

const createStyles = (_palette: AppPalette) =>
  StyleSheet.create({
    screenContent: { gap: spacing.medium },
    header: {
      alignItems: 'center',
      gap: spacing.tiny,
      paddingBottom: spacing.small,
    },
    headerDescription: { textAlign: 'center' },
    releaseBlock: { alignItems: 'center', gap: 2, paddingTop: spacing.medium },
    releaseText: { textAlign: 'center' },
  });
