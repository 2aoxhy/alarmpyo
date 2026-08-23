import { StyleSheet, useWindowDimensions, View } from 'react-native';

import {
  SelectionCard,
  SelectionIndicator,
} from '@/components/selection-controls';
import { AppText } from '@/components/ui-kit';
import { spacing, type AppPalette } from '@/constants/app-theme';
import { StatusBanner, ToggleRow } from '@/design-system';
import { triggerSelectionFeedback } from '@/features/feedback/feedback-controller';
import { useAppTheme } from '@/hooks/use-app-theme';
import { useThemedStyles } from '@/hooks/use-themed-styles';
import type { ShiftType } from '@/models/app-data';
import { formatDuration } from '@/utils/date';
import {
  calculateAlarmMinutes,
  formatTimeInput,
  parseTimeInput,
} from '@/utils/shift-time';

import {
  ALARM_OPTIONS,
  resolveWakeTimeOptionColumns,
  type ShiftDraft,
} from './shift-settings-model';

function formatShiftWakeTime(
  shift: ShiftType,
  draft: ShiftDraft,
  alarmMinutesBefore: number,
): string {
  const startMinutes = parseTimeInput(draft.start);
  return `${shift.name} ${
    startMinutes === null
      ? '--:--'
      : formatTimeInput(
          calculateAlarmMinutes(startMinutes, alarmMinutesBefore),
        )
  }`;
}

export function SharedWakeSettingsEditor({
  compact,
  drafts,
  onChange,
  shifts,
}: {
  compact: boolean;
  drafts: readonly ShiftDraft[];
  onChange: (draftIds: readonly string[], patch: Partial<ShiftDraft>) => void;
  shifts: readonly ShiftType[];
}) {
  const { isDark, palette } = useAppTheme();
  const styles = useThemedStyles(createStyles);
  const { fontScale, width } = useWindowDimensions();
  const stackOptions = resolveWakeTimeOptionColumns(width, fontScale) === 1;
  const entries = shifts
    .map((shift) => {
      const draft = drafts.find((item) => item.id === shift.id);
      return draft ? { draft, shift } : null;
    })
    .filter((entry): entry is { draft: ShiftDraft; shift: ShiftType } => entry !== null);
  const draftIds = entries.map((entry) => entry.draft.id);
  const allEnabled = entries.length > 0 && entries.every((entry) => entry.draft.alarmEnabled);
  const anyEnabled = entries.some((entry) => entry.draft.alarmEnabled);
  const sharedLead =
    entries.length > 0 &&
    entries.every(
      (entry) =>
        entry.draft.alarmMinutesBefore === entries[0].draft.alarmMinutesBefore,
    )
      ? entries[0].draft.alarmMinutesBefore
      : null;
  const shiftNames = entries.map((entry) => entry.shift.name).join('·');
  const sharedTimes =
    sharedLead === null
      ? null
      : entries
          .map((entry) =>
            formatShiftWakeTime(entry.shift, entry.draft, sharedLead),
          )
          .join(' · ');

  if (entries.length === 0) return null;

  return (
    <View style={styles.container}>
      <ToggleRow
        icon="alarm-outline"
        onValueChange={(alarmEnabled) => {
          void triggerSelectionFeedback();
          onChange(draftIds, { alarmEnabled });
        }}
        subtitle={`${shiftNames} 근무에 같은 알람 설정을 적용합니다.`}
        title="기상 알람 울리기"
        value={allEnabled}
      />

      <View style={styles.alarmSection}>
        <AppText accessibilityRole="header" variant="label">
          기상 시간
        </AppText>
        <AppText tone="secondary" variant="caption">
          한 번 선택하면 {shiftNames} 근무에 동일하게 적용됩니다.
        </AppText>
        <View
          accessibilityLabel={`${shiftNames} 공통 기상 시간`}
          accessibilityRole="radiogroup"
          style={[styles.options, stackOptions && styles.optionsStacked]}>
          {ALARM_OPTIONS.map((minutes) => {
            const selected = sharedLead === minutes;
            const timeSummary = entries
              .map((entry) =>
                formatShiftWakeTime(entry.shift, entry.draft, minutes),
              )
              .join(' · ');
            return (
              <SelectionCard
                accessibilityLabel={`${formatDuration(minutes)} 전. ${timeSummary}. ${shiftNames} 근무에 동일 적용`}
                contentStyle={styles.optionContent}
                key={minutes}
                onPress={() => {
                  void triggerSelectionFeedback();
                  onChange(draftIds, { alarmMinutesBefore: minutes });
                }}
                selected={selected}
                semanticColor={isDark ? palette.indigoDark : palette.indigo}
                showCheck={false}
                style={[
                  styles.option,
                  compact && styles.optionCompact,
                  stackOptions && styles.optionStacked,
                ]}>
                <View style={styles.optionCopy}>
                  <View style={styles.optionTitleRow}>
                    <AppText
                      color={palette.ink}
                      maxFontSizeMultiplier={stackOptions ? undefined : 1.25}
                      style={styles.optionTitle}
                      variant="label">
                      {formatDuration(minutes)} 전
                    </AppText>
                    <SelectionIndicator selected={selected} />
                  </View>
                  <AppText
                    color={palette.inkMuted}
                    style={styles.optionTimes}
                    variant="caption">
                    {timeSummary}
                  </AppText>
                </View>
              </SelectionCard>
            );
          })}
        </View>

        <StatusBanner
          message={
            sharedLead === null
              ? '현재 근무별 기상 시간이 다릅니다. 위에서 한 번 선택하면 같은 기준으로 맞춥니다.'
              : `${sharedTimes}. 수면 가이드와 출근 루틴도 이 기상 시각을 사용합니다.${!allEnabled ? ' 알람을 꺼도 기상 시각은 유지됩니다.' : ''}`
          }
          title={
            sharedLead === null
              ? `${shiftNames} 설정이 서로 다릅니다`
              : `${formatDuration(sharedLead)} 전 · ${shiftNames} 동일 적용`
          }
          tone={sharedLead === null || (anyEnabled && !allEnabled) ? 'warning' : 'info'}
        />
      </View>
    </View>
  );
}

function createStyles(palette: AppPalette) {
  return StyleSheet.create({
    container: {
      gap: spacing.large,
      paddingVertical: spacing.small,
      paddingLeft: spacing.medium,
      borderLeftWidth: 2,
      borderLeftColor: palette.controlLine,
    },
    alarmSection: { gap: spacing.small },
    options: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.small,
    },
    optionsStacked: { flexDirection: 'column', flexWrap: 'nowrap' },
    option: { minHeight: 78, flexBasis: '46%', flexGrow: 1 },
    optionCompact: { minHeight: 84 },
    optionStacked: { width: '100%', flexBasis: 'auto' },
    optionContent: {
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: spacing.small,
      paddingVertical: spacing.small,
    },
    optionCopy: { width: '100%', alignItems: 'center', gap: 3 },
    optionTitleRow: {
      minWidth: 0,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.tiny,
    },
    optionTitle: { fontSize: 17, textAlign: 'center' },
    optionTimes: { textAlign: 'center' },
  });
}
