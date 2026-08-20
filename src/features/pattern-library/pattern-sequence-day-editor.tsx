import { memo } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';

import { AppButton, AppText, Card } from '@/components/ui-kit';
import { SelectionPill } from '@/components/selection-controls';
import { spacing, type AppPalette } from '@/constants/app-theme';
import { useAppTheme } from '@/hooks/use-app-theme';
import { useThemedStyles } from '@/hooks/use-themed-styles';
import type { PatternShiftCode } from '@/models/app-data';

import {
  formatPatternDayAccessibilityLabel,
  PATTERN_SHIFT_OPTIONS,
} from './pattern-library-model';

export const PatternSequenceDayEditor = memo(function PatternSequenceDayEditor({
  code,
  index,
  onChange,
  onRemove,
  total,
}: {
  code: PatternShiftCode;
  index: number;
  onChange: (index: number, code: PatternShiftCode) => void;
  onRemove: (index: number) => void;
  total: number;
}) {
  const { palette } = useAppTheme();
  const styles = useThemedStyles(createStyles);
  const { fontScale, width } = useWindowDimensions();
  const stacked = width <= 320 || fontScale >= 1.5;

  return (
    <Card density="compact" style={styles.card}>
      <View style={[styles.heading, stacked && styles.headingStacked]}>
        <View style={styles.headingCopy}>
          <AppText variant="label">{index + 1}일차 근무</AppText>
          <AppText tone="secondary" variant="caption">
            {formatPatternDayAccessibilityLabel(index, total, code)}
          </AppText>
        </View>
        <AppButton
          accessibilityHint="이 날을 패턴 순서에서 제거합니다."
          disabled={total <= 1}
          icon="trash-outline"
          label="제거"
          onPress={() => onRemove(index)}
          size="compact"
          variant="ghost"
        />
      </View>
      <View accessibilityLabel={`${index + 1}일차 근무 종류`} accessibilityRole="radiogroup" style={styles.options}>
        {PATTERN_SHIFT_OPTIONS.map((option) => {
          const shift = option.shiftTypeId;
          const semanticColor =
            shift === 'day'
              ? palette.mint
              : shift === 'evening'
                ? palette.indigoDark
                : shift === 'night'
                  ? palette.violet
                  : shift === 'off'
                    ? palette.inkSoft
                    : palette.amber;
          return (
            <SelectionPill
              accessibilityLabel={option.label}
              accessibilityRole="radio"
              key={option.code}
              label={option.shortLabel}
              onPress={() => onChange(index, option.code)}
              selected={code === option.code}
              semanticColor={semanticColor}
              style={[styles.option, stacked && styles.optionStacked]}
              testID={`pattern-day-${index}-${option.code}`}
            />
          );
        })}
      </View>
    </Card>
  );
});

function createStyles(_palette: AppPalette) {
  return StyleSheet.create({
    card: {
      gap: spacing.medium,
      marginBottom: spacing.medium,
      padding: spacing.medium,
    },
    heading: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: spacing.medium,
    },
    headingStacked: {
      alignItems: 'stretch',
      flexDirection: 'column',
    },
    headingCopy: {
      minWidth: 0,
      flex: 1,
      gap: 2,
    },
    options: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.small,
    },
    option: {
      minWidth: 90,
      flexBasis: '30%',
      flexGrow: 1,
    },
    optionStacked: {
      width: '100%',
      flexBasis: '100%',
    },
  });
}
