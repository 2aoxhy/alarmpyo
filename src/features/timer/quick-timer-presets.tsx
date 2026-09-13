import { useMemo, type ElementRef, type Ref } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Button, space } from '@/design-system';

import type { QuickTimerDuration } from './quick-timer-controller';
import {
  getQuickTimerPresetRows,
  type QuickTimerPresetColumns,
} from './quick-timer-model';

export function QuickTimerPresets({
  columns,
  disabled,
  directInputButtonRef,
  onDirectInput,
  onSelectDuration,
  replacingTimer,
  schedulingDuration,
}: {
  columns: QuickTimerPresetColumns;
  disabled: boolean;
  directInputButtonRef: Ref<ElementRef<typeof Pressable>>;
  onDirectInput: () => void;
  onSelectDuration: (durationMinutes: QuickTimerDuration) => void;
  replacingTimer: boolean;
  schedulingDuration: QuickTimerDuration | null;
}) {
  const rows = useMemo(() => getQuickTimerPresetRows(columns), [columns]);
  const schedulingCustomDuration = schedulingDuration !== null &&
    !rows.some((row) => row.some((option) => option === schedulingDuration));

  return (
    // Preserve one native drawing boundary per row as timer content changes.
    // Explicit equal-width rows avoid percentage flexBasis + wrap remeasurement.
    <View collapsable={false} style={styles.presets} testID="quick-timer-presets">
      {rows.map((row) => (
        <View
          collapsable={false}
          key={row.join('-')}
          style={styles.row}>
          {row.map((option) => option === 'custom' ? (
            <Button
              accessibilityHint={replacingTimer
                ? '1분부터 60분까지 입력해 현재 타이머를 변경합니다.'
                : '1분부터 60분까지 타이머 시간을 입력합니다.'}
              accessibilityLabel="타이머 시간 직접 입력"
              disabled={disabled}
              elementRef={directInputButtonRef}
              icon="time-outline"
              key={option}
              label="직접 입력"
              loading={schedulingCustomDuration}
              onPress={onDirectInput}
              style={styles.button}
              testID="quick-timer-preset-custom"
              variant={replacingTimer ? 'secondary' : 'primary'}
            />
          ) : (
            <Button
              accessibilityHint={replacingTimer
                ? `현재 타이머를 취소하고 지금부터 ${option}분 뒤 울리도록 변경합니다.`
                : `지금부터 ${option}분 뒤 알람음과 진동이 울립니다.`}
              accessibilityLabel={`${option}분 타이머${replacingTimer ? '로 변경' : ' 시작'}`}
              disabled={disabled}
              icon="timer-outline"
              key={option}
              label={`${option}분`}
              loading={schedulingDuration === option}
              onPress={() => onSelectDuration(option)}
              style={styles.button}
              testID={`quick-timer-preset-${option}`}
              variant={replacingTimer ? 'secondary' : 'primary'}
            />
          ))}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  presets: { width: '100%', flexShrink: 0, gap: space.sm },
  row: { width: '100%', flexDirection: 'row', gap: space.sm },
  button: { flex: 1, minWidth: 0, minHeight: 64 },
});
