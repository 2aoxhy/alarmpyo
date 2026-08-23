import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppIcon } from '@/components/app-icon';
import { SleepTimingCard } from '@/components/sleep-timing-card';
import { AppText, SectionHeader } from '@/components/ui-kit';
import { spacing, type AppPalette } from '@/constants/app-theme';
import { useAppTheme } from '@/hooks/use-app-theme';
import { useThemedStyles } from '@/hooks/use-themed-styles';
import type { SleepTimingGuidance } from '@/services/sleep-timing-planner';
import type { WorkRoutinePlan } from '@/services/work-routine-planner';
import type { AlarmHealthState } from '@/services/alarm-access-summary';
import type { TodayAlarmSummary } from '@/services/today-view-model';

type TodayGuidanceSectionProps = {
  alarmHasDateOverride: boolean;
  alarmHealthState: AlarmHealthState;
  alarmSummary: TodayAlarmSummary;
  compact: boolean;
  largeText: boolean;
  now: Date;
  routinePlan: WorkRoutinePlan | null;
  scheduledAlarmCount: number;
  sleepTimingGuidance: SleepTimingGuidance;
};

export function TodayGuidanceSection({
  alarmHasDateOverride,
  alarmHealthState,
  alarmSummary,
  compact,
  largeText,
  now,
  routinePlan,
  scheduledAlarmCount,
  sleepTimingGuidance,
}: TodayGuidanceSectionProps) {
  const { palette } = useAppTheme();
  const styles = useThemedStyles(createStyles);
  const alarmsReady = alarmHealthState.status === 'ready';
  const hasAlarmIssue =
    alarmHealthState.status === 'action-required' ||
    alarmHealthState.status === 'error';
  const alarmAccessibilitySummary = alarmSummary.description
    ? `${alarmSummary.title}. ${alarmSummary.description}`
    : alarmSummary.title;

  return (
    <View style={styles.section}>
      <SectionHeader centered title="오늘 안내" />

      <Pressable
        accessibilityHint="알람 상태와 예약 내용을 확인합니다."
        accessibilityLabel={`근무 알람. ${alarmAccessibilitySummary}${
          alarmHasDateOverride ? '. 이날만 설정한 알람입니다' : ''
        }`}
        accessibilityRole="button"
        onPress={() => router.push('/alarm-settings')}
        style={({ pressed }) => [
          styles.alarmRow,
          hasAlarmIssue && styles.alarmIssueRow,
          largeText && styles.alarmRowLargeText,
          pressed && styles.rowPressed,
        ]}>
        <View style={styles.alarmIcon}>
          <AppIcon
            accessible={false}
            color={
              hasAlarmIssue
                ? palette.danger
                : alarmsReady
                  ? palette.violet
                  : palette.inkSoft
            }
            name={hasAlarmIssue ? 'alert-circle-outline' : 'alarm-outline'}
            size={23}
          />
        </View>

        <View style={styles.alarmCopy}>
          <AppText variant="label">
            {`근무 알람${alarmsReady && scheduledAlarmCount > 0 ? ` · ${scheduledAlarmCount}개 예약` : ''}${alarmHasDateOverride ? ' · 이날만 설정' : ''}`}
          </AppText>
          <View style={styles.alarmSummary}>
            <AppText
              color={hasAlarmIssue ? palette.danger : undefined}
              tone={hasAlarmIssue ? 'primary' : 'secondary'}
              variant="label">
              {alarmSummary.title}
            </AppText>
            {alarmSummary.description ? (
              <AppText
                color={hasAlarmIssue ? palette.danger : undefined}
                tone={hasAlarmIssue ? 'primary' : 'secondary'}
                variant="caption">
                {alarmSummary.description}
              </AppText>
            ) : null}
          </View>
        </View>

        <AppIcon
          accessible={false}
          color={palette.inkSoft}
          name="chevron-forward"
          size={18}
        />
      </Pressable>

      <SleepTimingCard
        compact={compact}
        guidance={sleepTimingGuidance}
        now={now}
        routinePlan={routinePlan}
      />
    </View>
  );
}

const createStyles = (palette: AppPalette) =>
  StyleSheet.create({
    section: {
      gap: spacing.medium,
    },
    alarmRow: {
      minHeight: 68,
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.medium,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderColor: palette.line,
      paddingVertical: spacing.medium,
      paddingHorizontal: spacing.tiny,
    },
    alarmIssueRow: {
      borderColor: palette.danger,
    },
    alarmRowLargeText: {
      alignItems: 'flex-start',
    },
    alarmIcon: {
      width: 32,
      height: 48,
      flexShrink: 0,
      alignItems: 'center',
      justifyContent: 'center',
    },
    alarmCopy: {
      flex: 1,
      minWidth: 0,
      gap: spacing.tiny,
    },
    alarmSummary: {
      minWidth: 0,
      gap: 2,
    },
    rowPressed: {
      opacity: 0.72,
      transform: [{ scale: 0.985 }],
    },
  });
