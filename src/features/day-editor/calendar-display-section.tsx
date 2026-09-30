import { StyleSheet, View } from 'react-native';

import { SelectionPill } from '@/components/selection-controls';
import { AppText } from '@/components/ui-kit';
import { space, useDesignSystemTheme } from '@/design-system';

export function CalendarDisplaySection({
  hidden,
  onChange,
}: {
  hidden: boolean;
  onChange: (hidden: boolean) => void;
}) {
  const { colors } = useDesignSystemTheme();
  return (
    <View style={styles.container}>
      <AppText tone="secondary" variant="caption">
        휴무와 달리 이 날짜의 근무 배지를 달력에서 숨깁니다.
      </AppText>
      <View accessibilityRole="radiogroup" style={styles.options}>
        <SelectionPill
          accessibilityLabel="이 날짜 일정 표시"
          label="일정 표시"
          onPress={() => onChange(false)}
          selected={!hidden}
          semanticColor={colors.focus}
          style={styles.option}
        />
        <SelectionPill
          accessibilityLabel="이 날짜 일정 표시 안 함"
          label="표시 안 함"
          onPress={() => onChange(true)}
          selected={hidden}
          semanticColor={colors.textMuted}
          style={styles.option}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: space.sm },
  options: { flexDirection: 'row', gap: space.sm },
  option: { minHeight: 48, minWidth: 0, flex: 1 },
});
