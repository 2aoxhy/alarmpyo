import * as Haptics from 'expo-haptics';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppIcon } from '@/components/app-icon';
import { AppButton, AppText, Card } from '@/components/ui-kit';
import { radii, spacing, type AppPalette } from '@/constants/app-theme';
import {
  DisclosureRow,
  StatusBanner,
} from '@/design-system';
import { useAppTheme } from '@/hooks/use-app-theme';
import { useThemedStyles } from '@/hooks/use-themed-styles';
import type { WorkRoutineProfiles, WorkRoutineTiming } from '@/models/app-data';
import {
  createDefaultWorkRoutineProfiles,
  isValidWorkRoutineTiming,
  WORK_ROUTINE_MINUTES_STEP,
} from '@/services/work-routine-settings';
import { formatDuration } from '@/utils/date';
import { formatTimeInput } from '@/utils/shift-time';

export function RoutineTimingEditor({
  alarmMinutesBefore,
  compact,
  expanded,
  kind,
  onChange,
  onExpandedChange,
  profile,
  startMinutes,
}: {
  alarmMinutesBefore: number;
  compact: boolean;
  expanded: boolean;
  kind: keyof WorkRoutineProfiles;
  onChange: (profile: WorkRoutineTiming) => void;
  onExpandedChange: (expanded: boolean) => void;
  profile: WorkRoutineTiming;
  startMinutes: number | null;
}) {
  const styles = useThemedStyles(createStyles);
  const defaultProfile = createDefaultWorkRoutineProfiles()[kind];
  const valid =
    isValidWorkRoutineTiming(profile) &&
    alarmMinutesBefore > profile.departMinutesBefore;
  const formatMilestoneTime = (minutesBefore: number) =>
    startMinutes === null
      ? '--:--'
      : formatTimeInput(
          (startMinutes - minutesBefore + 24 * 60) % (24 * 60),
        );
  const updateMinutes = (key: keyof WorkRoutineTiming, amount: number) => {
    const next = {
      ...profile,
      [key]: profile[key] + amount,
    };
    if (!isValidWorkRoutineTiming(next)) return;
    void Haptics.selectionAsync();
    onChange(next);
  };
  const rows: readonly {
    key: keyof WorkRoutineTiming;
    label: string;
  }[] = [
    { key: 'departMinutesBefore', label: '출발' },
    { key: 'arriveMinutesBefore', label: '도착' },
    { key: 'handoverMinutesBefore', label: '교대 완료' },
  ];

  return (
    <View style={styles.container}>
      <DisclosureRow
        expanded={expanded}
        icon="time-outline"
        onPress={() => onExpandedChange(!expanded)}
        subtitle={`${formatMilestoneTime(profile.departMinutesBefore)} 출발 · ${formatMilestoneTime(profile.arriveMinutesBefore)} 도착 · ${formatMilestoneTime(profile.handoverMinutesBefore)} 교대 완료`}
        title={`${kind === 'night' ? '야간' : '주간'} 출근 루틴`}
      />

      {expanded ? (
        <Card density="compact" style={styles.body}>
          <StatusBanner
            message={
              valid
                ? '근무 시작을 기준으로 출근 준비 시간을 계산해요.'
                : '기상 시각은 출발보다 빨라야 해요.'
            }
            tone={valid ? 'success' : 'danger'}
          />

          {rows.map((row) => {
            const current = profile[row.key];
            const canDecrease = isValidWorkRoutineTiming({
              ...profile,
              [row.key]: current - WORK_ROUTINE_MINUTES_STEP,
            });
            const canIncrease = isValidWorkRoutineTiming({
              ...profile,
              [row.key]: current + WORK_ROUTINE_MINUTES_STEP,
            });
            return (
              <View
                key={row.key}
                style={[styles.row, compact && styles.rowCompact]}>
                <View style={styles.rowCopy}>
                  <AppText variant="label">{row.label}</AppText>
                  <AppText tone="secondary" variant="caption">
                    {formatMilestoneTime(current)} · 근무 {formatDuration(current)} 전
                  </AppText>
                </View>
                <View style={styles.controls}>
                  <RoutineStepButton
                    accessibilityLabel={`${row.label} 시간을 5분 늦추기`}
                    disabled={!canDecrease}
                    icon="remove"
                    onPress={() =>
                      updateMinutes(row.key, -WORK_ROUTINE_MINUTES_STEP)
                    }
                  />
                  <AppText style={styles.minutes} variant="label">
                    {current}분
                  </AppText>
                  <RoutineStepButton
                    accessibilityLabel={`${row.label} 시간을 5분 앞당기기`}
                    disabled={!canIncrease}
                    icon="add"
                    onPress={() =>
                      updateMinutes(row.key, WORK_ROUTINE_MINUTES_STEP)
                    }
                  />
                </View>
              </View>
            );
          })}

          <AppButton
            disabled={
              profile.departMinutesBefore ===
                defaultProfile.departMinutesBefore &&
              profile.arriveMinutesBefore ===
                defaultProfile.arriveMinutesBefore &&
              profile.handoverMinutesBefore ===
                defaultProfile.handoverMinutesBefore
            }
            label="기본 시간으로 되돌리기"
            onPress={() => {
              void Haptics.selectionAsync();
              onChange({ ...defaultProfile });
            }}
            size="compact"
            variant="ghost"
          />
        </Card>
      ) : null}
    </View>
  );
}

function RoutineStepButton({
  accessibilityLabel,
  disabled,
  icon,
  onPress,
}: {
  accessibilityLabel: string;
  disabled: boolean;
  icon: 'add' | 'remove';
  onPress: () => void;
}) {
  const { palette } = useAppTheme();
  const styles = useThemedStyles(createStyles);
  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.stepButton,
        disabled && styles.stepButtonDisabled,
        pressed && !disabled && styles.stepButtonPressed,
      ]}>
      <AppIcon
        accessible={false}
        color={disabled ? palette.disabledInk : palette.indigoDark}
        name={icon}
        size={19}
      />
    </Pressable>
  );
}

function createStyles(palette: AppPalette) {
  return StyleSheet.create({
    container: {
      gap: spacing.small,
    },
    body: {
      gap: spacing.medium,
    },
    row: {
      minHeight: 64,
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.medium,
      paddingVertical: spacing.tiny,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: palette.line,
    },
    rowCompact: {
      minHeight: 112,
      alignItems: 'stretch',
      flexDirection: 'column',
      gap: spacing.small,
    },
    rowCopy: {
      minWidth: 0,
      flex: 1,
      gap: 2,
    },
    controls: {
      minWidth: 190,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'flex-end',
      gap: spacing.small,
    },
    stepButton: {
      width: 48,
      minWidth: 48,
      height: 48,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: palette.controlLine,
      borderRadius: radii.medium,
      backgroundColor: palette.surfaceSoft,
    },
    stepButtonDisabled: {
      opacity: 0.42,
    },
    stepButtonPressed: {
      opacity: 0.68,
    },
    minutes: {
      minWidth: 78,
      flexShrink: 1,
      textAlign: 'center',
    },
  });
}
