import { memo, useCallback } from 'react';
import { FlatList, StyleSheet, useWindowDimensions, View } from 'react-native';

import { AppButton, AppText } from '@/components/ui-kit';
import { SelectionPill } from '@/components/selection-controls';
import { spacing, type AppPalette } from '@/constants/app-theme';
import { Surface } from '@/design-system';
import { useAppTheme } from '@/hooks/use-app-theme';
import { useThemedStyles } from '@/hooks/use-themed-styles';
import type { PatternShiftCode } from '@/models/app-data';

import {
  formatPatternDayAccessibilityLabel,
  PATTERN_SHIFT_OPTIONS,
} from './pattern-library-model';

export const PatternSequenceStrip = memo(function PatternSequenceStrip({
  codes,
  onSelect,
  selectedIndex,
}: {
  codes: readonly PatternShiftCode[];
  onSelect: (index: number) => void;
  selectedIndex: number;
}) {
  const { palette } = useAppTheme();
  const styles = useThemedStyles(createStyles);
  const renderItem = useCallback(
    ({ item, index }: { item: PatternShiftCode; index: number }) => {
      const option = PATTERN_SHIFT_OPTIONS.find((candidate) => candidate.code === item);
      return (
        <SelectionPill
          accessibilityLabel={formatPatternDayAccessibilityLabel(index, codes.length, item)}
          accessibilityRole="radio"
          label={`${index + 1} · ${option?.shortLabel ?? item}`}
          onPress={() => onSelect(index)}
          selected={selectedIndex === index}
          semanticColor={resolveCodeColor(item, palette)}
          showCheck={false}
          style={styles.stripItem}
          testID={`pattern-strip-day-${index}`}
        />
      );
    },
    [codes.length, onSelect, palette, selectedIndex, styles.stripItem],
  );

  return (
    <FlatList
      accessibilityLabel={`${codes.length}일 근무 순서`}
      accessibilityRole="radiogroup"
      contentContainerStyle={styles.stripContent}
      data={codes}
      horizontal
      initialNumToRender={8}
      keyExtractor={(_, index) => `pattern-strip-${index}`}
      maxToRenderPerBatch={8}
      renderItem={renderItem}
      showsHorizontalScrollIndicator={false}
      style={styles.strip}
      windowSize={3}
    />
  );
});

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
    <Surface density="compact" tone="muted" style={styles.editor}>
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
    </Surface>
  );
});

function resolveCodeColor(code: PatternShiftCode, palette: AppPalette): string {
  const shift = PATTERN_SHIFT_OPTIONS.find((option) => option.code === code)?.shiftTypeId;
  return shift === 'day'
    ? palette.mint
    : shift === 'evening'
      ? palette.indigoDark
      : shift === 'night'
        ? palette.violet
        : shift === 'off'
          ? palette.inkSoft
          : palette.amber;
}

function createStyles(_palette: AppPalette) {
  return StyleSheet.create({
    strip: { marginHorizontal: -spacing.tiny },
    stripContent: { gap: spacing.small, paddingHorizontal: spacing.tiny },
    stripItem: { minWidth: 80, minHeight: 52 },
    editor: {
      gap: spacing.medium,
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
