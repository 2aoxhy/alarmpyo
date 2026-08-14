import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppIcon } from '@/components/app-icon';
import { SleepTimingCard } from '@/components/sleep-timing-card';
import { StatusBadge } from '@/components/status-badge';
import { AppText, Card, SectionHeader } from '@/components/ui-kit';
import { spacing, type AppPalette } from '@/constants/app-theme';
import { useAppTheme } from '@/hooks/use-app-theme';
import { useThemedStyles } from '@/hooks/use-themed-styles';
import type { SleepTimingGuidance } from '@/services/sleep-timing-planner';
import type { WorkRoutinePlan } from '@/services/work-routine-planner';
import type { AlarmHealthState } from '@/services/alarm-access-summary';

type TodayGuidanceSectionProps = {
  alarmHasDateOverride: boolean;
  alarmHealthState: AlarmHealthState;
  alarmSummaryLabel: string;
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
  alarmSummaryLabel,
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

  return (
    <View style={styles.section}>
      <SectionHeader centered title="오늘 안내" />

      <Card style={[styles.alarmCard, hasAlarmIssue && styles.alarmIssueCard]}>
        <Pressable
          accessibilityHint="알람 상태와 예약 내용을 확인해요."
          accessibilityLabel={`근무 알람. ${alarmSummaryLabel}${
            alarmHasDateOverride ? '. 이날만 설정한 알람이에요' : ''
          }`}
          accessibilityRole="button"
          onPress={() => router.push('/alarm-settings')}
          style={({ pressed }) => [
            styles.alarmRow,
            largeText && styles.alarmRowLargeText,
            pressed && styles.rowPressed,
          ]}>
          <View
            style={[
              styles.alarmIcon,
              hasAlarmIssue
                ? styles.alarmIssueIcon
                : !alarmsReady && styles.alarmIdleIcon,
            ]}>
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
            <View style={styles.alarmTitleRow}>
              <AppText variant="label">근무 알람</AppText>
              {alarmsReady && scheduledAlarmCount > 0 ? (
                <StatusBadge
                  backgroundColor={palette.violetSoft}
                  borderColor={palette.violet}
                  label={`${scheduledAlarmCount}개 예약`}
                />
              ) : null}
              {alarmHasDateOverride ? (
                <StatusBadge
                  backgroundColor={palette.mintSoft}
                  borderColor={palette.mint}
                  label="이날만 설정"
                />
              ) : null}
            </View>
            <View style={styles.alarmSummary}>
              <AppText
                color={hasAlarmIssue ? palette.danger : undefined}
                numberOfLines={largeText ? undefined : 2}
                tone={hasAlarmIssue ? 'primary' : 'secondary'}
                variant="caption">
                {alarmSummaryLabel}
              </AppText>
            </View>
          </View>

          <AppIcon
            accessible={false}
            color={palette.inkSoft}
            name="chevron-forward"
            size={18}
          />
        </Pressable>
      </Card>

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
    alarmCard: {
      borderRadius: 22,
      paddingVertical: spacing.medium,
    },
    alarmIssueCard: {
      borderColor: palette.danger,
    },
    alarmRow: {
      minHeight: 54,
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.medium,
    },
    alarmRowLargeText: {
      alignItems: 'flex-start',
    },
    alarmIcon: {
      width: 42,
      height: 42,
      flexShrink: 0,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 14,
      backgroundColor: palette.violetSoft,
    },
    alarmIssueIcon: {
      backgroundColor: palette.dangerSoft,
    },
    alarmIdleIcon: {
      backgroundColor: palette.surfaceSoft,
    },
    alarmCopy: {
      flex: 1,
      minWidth: 0,
      gap: spacing.tiny,
    },
    alarmTitleRow: {
      minWidth: 0,
      flexDirection: 'row',
      flexWrap: 'wrap',
      alignItems: 'center',
      gap: spacing.small,
    },
    alarmSummary: {
      minWidth: 0,
    },
    rowPressed: {
      opacity: 0.72,
      transform: [{ scale: 0.985 }],
    },
  });
