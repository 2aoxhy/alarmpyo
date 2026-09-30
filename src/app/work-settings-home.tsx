import { router, Stack, type Href, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { StyleSheet } from 'react-native';

import {
  ListRow,
  MenuDivider,
  MenuGroup,
  Screen,
} from '@/components/ui-kit';
import { useAppDialog } from '@/components/app-dialog';
import { spacing, type AppPalette } from '@/constants/app-theme';
import { DisclosureRow, StatusBanner } from '@/design-system';
import { resolveAlarmPermissionReadinessViewModel } from '@/features/alarm/alarm-permission-readiness-model';
import { useAlarmSettingsRuntimeController } from '@/features/alarm/alarm-settings-runtime-controller';
import { quickSetupDraftController } from '@/features/quick-setup/quick-setup-draft-controller';
import {
  formatPayrollSettingsSummary,
} from '@/features/shift-settings/payroll-settings-model';
import {
  formatShiftTimeSummary,
  formatWakeTimeSummary,
} from '@/features/shift-settings/shift-settings-model';
import { useScreenActive } from '@/hooks/use-screen-active';
import { useThemedStyles } from '@/hooks/use-themed-styles';
import {
  areWorkSettingsHomeDataEqual,
  selectSettingsData,
} from '@/features/settings/settings-store-selection';
import { useAppSelector } from '@/store/app-store';
import {
  getWorkPatternDisplayName,
  getWorkPatternPreset,
  getWorkPatternPresetId,
} from '@/utils/work-pattern';

export default function WorkSettingsHomeScreen() {
  const { showDialog } = useAppDialog();
  const styles = useThemedStyles(createStyles);
  const screenActive = useScreenActive();
  const data = useAppSelector(selectSettingsData, areWorkSettingsHomeDataEqual);
  const [draftAvailable, setDraftAvailable] = useState(false);
  const [showAdditionalSettings, setShowAdditionalSettings] = useState(false);
  const { alarmPlatformSupported, runtimeStatus } =
    useAlarmSettingsRuntimeController({
      enabled: screenActive,
      sleepReminderEnabled: false,
      revisionKey: data.settings.lastNotificationSyncAt ?? '',
    });

  useFocusEffect(
    useCallback(() => {
      let active = true;
      void quickSetupDraftController.hasDraft().then((available) => {
        if (active) setDraftAvailable(available);
      });
      return () => {
        active = false;
      };
    }, []),
  );

  const activeWorkShiftIds = useMemo(
    () =>
      (['day', 'evening', 'night'] as const).filter((id) =>
        data.pattern.shiftTypeIds.includes(id),
      ),
    [data.pattern.shiftTypeIds],
  );
  const presetId = getWorkPatternPresetId(data.pattern.shiftTypeIds);
  const patternLabel =
    presetId === 'custom'
      ? getWorkPatternDisplayName(data.pattern.shiftTypeIds, data.pattern.name)
      : getWorkPatternPreset(presetId).shortName;
  const timeSummary = formatShiftTimeSummary(
    data.shiftTypes,
    activeWorkShiftIds,
  );
  const wakeSummary = formatWakeTimeSummary(
    data.shiftTypes,
    activeWorkShiftIds.includes('night'),
    activeWorkShiftIds.includes('evening'),
    activeWorkShiftIds.includes('day'),
  );
  const permissionModel = runtimeStatus.alarmStatus
    ? resolveAlarmPermissionReadinessViewModel(runtimeStatus.alarmStatus)
    : null;
  const scheduledCount =
    runtimeStatus.alarmStatus?.scheduledCount ??
    data.settings.scheduledNotificationCount;
  const alarmSummary = !alarmPlatformSupported
    ? 'Android에서 사용'
    : !data.settings.notificationsEnabled
      ? '꺼짐'
      : `${scheduledCount}개 예약 · ${
          permissionModel?.summary ?? '권한 확인 중'
        }`;
  const nextPermissionTarget = permissionModel?.nextRequiredTarget ?? null;
  const startFreshSetup = useCallback(() => {
    void quickSetupDraftController
      .clear()
      .then(() => router.push('/quick-setup' as Href))
      .catch(() =>
        showDialog(
          '설정을 시작하지 못했습니다',
          '저장 공간을 확인한 뒤 다시 시도합니다.',
          undefined,
          { tone: 'danger' },
        ),
      );
  }, [showDialog]);
  const openPatternSetup = useCallback(() => {
    if (!draftAvailable) {
      startFreshSetup();
      return;
    }
    showDialog(
      '근무표 설정',
      '중단한 설정이 있습니다.',
      [
        {
          text: '이어서 하기',
          actionId: 'confirm',
          icon: 'arrow-forward',
          onPress: () => router.push('/quick-setup' as Href),
        },
        {
          text: '처음부터',
          actionId: 'delete',
          icon: 'refresh-outline',
          style: 'destructive',
          onPress: startFreshSetup,
        },
      ],
      { tone: 'warning' },
    );
  }, [draftAvailable, showDialog, startFreshSetup]);

  return (
    <>
      <Stack.Screen options={{ title: '근무표와 알람' }} />
      <Screen contentStyle={styles.screen} safeAreaEdges={['left', 'right']}>
        {draftAvailable ? (
          <StatusBanner
            actionLabel="이어서 하기"
            message="중단한 단계부터 계속합니다."
            onAction={() => router.push('/quick-setup' as Href)}
            title="설정 중인 근무표"
            tone="info"
          />
        ) : null}

        <MenuGroup title="바로 바꾸기">
          <ListRow
            allowSubtitleWrapping
            icon="repeat-outline"
            onPress={openPatternSetup}
            subtitle={`${patternLabel} · 현재 설정에서 시작`}
            title="근무표 설정"
          />
          <MenuDivider />
          <ListRow
            allowSubtitleWrapping
            icon="time-outline"
            onPress={() => router.push('/shift-settings?focus=time' as Href)}
            subtitle={timeSummary}
            title="근무 시간"
          />
          <MenuDivider />
          <ListRow
            allowSubtitleWrapping
            icon="alarm-outline"
            onPress={() => router.push('/shift-settings?focus=wake' as Href)}
            subtitle={`${wakeSummary} · 모든 근무에 같은 값`}
            title="기상 알림"
          />
          <MenuDivider />
          <ListRow
            allowSubtitleWrapping
            icon="alarm-outline"
            onPress={() =>
              router.push(
                nextPermissionTarget
                  ? (`/alarm-settings?focus=permissions&target=${nextPermissionTarget}` as Href)
                  : ('/alarm-settings' as Href),
              )
            }
            subtitle={alarmSummary}
            title={nextPermissionTarget ? '알람 권한 설정' : '알람과 권한'}
          />
        </MenuGroup>

        <DisclosureRow
          expanded={showAdditionalSettings}
          icon="options-outline"
          onPress={() => setShowAdditionalSettings((current) => !current)}
          subtitle="급여일 · 패턴 보관함 · 소리·진동·시험"
          title="추가 설정"
        />

        {showAdditionalSettings ? (
          <MenuGroup title="추가 설정">
            <ListRow
              icon="calendar-outline"
              onPress={() => router.push('/shift-settings?focus=payroll' as Href)}
              subtitle={formatPayrollSettingsSummary(data.payrollSettings)}
              title="급여일"
            />
            <MenuDivider />
            <ListRow
              icon="star-outline"
              onPress={() => router.push('/pattern-library' as Href)}
              subtitle="공식·보관 패턴 비교와 적용"
              title="패턴 보관함"
            />
            <MenuDivider />
            <ListRow
              icon="options-outline"
              onPress={() => router.push('/alarm-settings?focus=management' as Href)}
              subtitle="소리 · 진동 · 시험 알람"
              title="알람 세부 설정"
            />
          </MenuGroup>
        ) : null}
      </Screen>
    </>
  );
}

const createStyles = (_palette: AppPalette) =>
  StyleSheet.create({
    screen: {
      gap: spacing.large,
      paddingTop: spacing.small,
      paddingBottom: spacing.xxlarge,
    },
  });
