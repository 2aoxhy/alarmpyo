import { router, type Href } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import {
  AppText,
  ListRow,
  MenuDivider,
  MenuGroup,
  Screen,
} from '@/components/ui-kit';
import { spacing, type AppPalette } from '@/constants/app-theme';
import { useThemedStyles } from '@/hooks/use-themed-styles';
import { useAppStoreData } from '@/store/app-store';
import { formatCompactTime } from '@/utils/date';
import {
  getWorkPatternDisplayName,
  getWorkPatternPreset,
  getWorkPatternPresetId,
} from '@/utils/work-pattern';

export default function SettingsHome() {
  const { data } = useAppStoreData();
  const styles = useThemedStyles(createStyles);
  const presetId = getWorkPatternPresetId(data.pattern.shiftTypeIds);
  const patternLabel =
    presetId === 'custom'
      ? getWorkPatternDisplayName(data.pattern.shiftTypeIds, data.pattern.name)
      : getWorkPatternPreset(presetId).shortName;
  const activeIds = new Set(data.pattern.shiftTypeIds);
  const workTimeLabel = data.shiftTypes
    .filter((shift) => !shift.isOff && activeIds.has(shift.id))
    .map((shift) => `${shift.shortName} ${formatCompactTime(shift.startMinutes)}`)
    .join(' · ');
  const alarmLabel = data.settings.notificationsEnabled
    ? data.settings.scheduledNotificationCount > 0
      ? `${data.settings.scheduledNotificationCount}개 예약`
      : '켜짐 · 예약 준비'
    : '꺼짐';
  return (
    <Screen contentStyle={styles.screenContent}>
      <View style={styles.header}>
        <AppText accessibilityRole="header" variant="title">
          설정
        </AppText>
        <AppText tone="secondary" style={styles.headerDescription}>
          필요한 설정을 한 번에 찾을 수 있어요.
        </AppText>
      </View>

      <MenuGroup centered title="근무와 알람">
        <ListRow
          icon="repeat-outline"
          onPress={() => router.push('/shift-settings')}
          subtitle={`${patternLabel} · ${workTimeLabel}`}
          title="근무표 설정"
        />
        <MenuDivider />
        <ListRow
          icon="alarm-outline"
          onPress={() => router.push('/alarm-settings')}
          subtitle={`${alarmLabel} · 알람음·진동과 권한을 확인해요`}
          title="알람"
        />
      </MenuGroup>

      <MenuGroup centered title="앱">
        <ListRow
          icon="settings-outline"
          onPress={() => router.push('/display-settings' as Href)}
          subtitle="표시할 정보와 위젯 추가를 관리해요"
          title="홈 화면 위젯"
        />
        <MenuDivider />
        <ListRow
          icon="book-outline"
          onPress={() => router.push('/app-management' as Href)}
          subtitle="백업·업데이트·개인정보를 관리해요"
          title="데이터·앱 정보"
        />
      </MenuGroup>
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
  });
