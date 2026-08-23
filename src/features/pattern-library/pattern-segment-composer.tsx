import { memo, useCallback, useEffect, useState } from 'react';
import { FlatList, StyleSheet, useWindowDimensions, View } from 'react-native';

import { SelectionPill } from '@/components/selection-controls';
import { AppButton, AppText } from '@/components/ui-kit';
import { spacing, type AppPalette } from '@/constants/app-theme';
import { Surface } from '@/design-system';
import { useAppTheme } from '@/hooks/use-app-theme';
import { useThemedStyles } from '@/hooks/use-themed-styles';
import type { PatternShiftCode } from '@/models/app-data';

import {
  getPatternComposerTotalDays,
  getPatternShiftOption,
  MAX_PATTERN_LENGTH,
  PATTERN_SHIFT_OPTIONS,
  type PatternComposerSegment,
} from './pattern-library-model';

const BASIC_SHIFT_OPTIONS = PATTERN_SHIFT_OPTIONS.slice(0, 4);
const SUBSTITUTE_SHIFT_OPTIONS = PATTERN_SHIFT_OPTIONS.slice(4);

export const PatternSegmentComposer = memo(function PatternSegmentComposer({
  canUndo,
  onChange,
  onUndo,
  segments,
}: {
  canUndo: boolean;
  onChange: (segments: PatternComposerSegment[]) => void;
  onUndo: () => void;
  segments: readonly PatternComposerSegment[];
}) {
  const { palette } = useAppTheme();
  const styles = useThemedStyles(createStyles);
  const { fontScale, width } = useWindowDimensions();
  const stacked = width <= 320 || fontScale >= 1.5;
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [substitutesExpanded, setSubstitutesExpanded] = useState(false);
  const activeIndex = Math.min(selectedIndex, segments.length - 1);
  const activeSegment = segments[activeIndex];
  const totalDays = getPatternComposerTotalDays(segments);

  useEffect(() => {
    if (selectedIndex >= segments.length) {
      setSelectedIndex(Math.max(0, segments.length - 1));
    }
  }, [segments.length, selectedIndex]);

  const renderSegment = useCallback(
    ({ item, index }: { item: PatternComposerSegment; index: number }) => {
      const option = getPatternShiftOption(item.shiftCode);
      return (
        <SelectionPill
          accessibilityLabel={`${index + 1}번째 구간, ${option.label} ${item.days}일`}
          accessibilityRole="radio"
          label={`${index + 1} · ${option.shortLabel} ${item.days}일`}
          onPress={() => setSelectedIndex(index)}
          selected={activeIndex === index}
          semanticColor={resolveCodeColor(item.shiftCode, palette)}
          showCheck={false}
          style={styles.segmentPill}
          testID={`pattern-segment-${index}`}
        />
      );
    },
    [activeIndex, palette, styles.segmentPill],
  );

  if (!activeSegment) return null;

  const changeShift = (shiftCode: PatternShiftCode) => {
    const next = segments.map((segment, index) =>
      index === activeIndex ? { ...segment, shiftCode } : { ...segment },
    );
    onChange(next);
    setSelectedIndex(resolveNormalizedSegmentIndex(next, activeIndex));
  };

  const changeDays = (delta: -1 | 1) => {
    const nextDays = activeSegment.days + delta;
    if (nextDays < 1 || totalDays + delta > MAX_PATTERN_LENGTH) return;
    onChange(
      segments.map((segment, index) =>
        index === activeIndex ? { ...segment, days: nextDays } : { ...segment },
      ),
    );
  };

  const addSegment = () => {
    if (totalDays >= MAX_PATTERN_LENGTH) return;
    const shiftCode = activeSegment.shiftCode === 'OFF' ? 'DAY' : 'OFF';
    const next: PatternComposerSegment[] = [
      ...segments.map((segment) => ({ ...segment })),
      { shiftCode, days: 1 },
    ];
    onChange(next);
    setSelectedIndex(resolveNormalizedSegmentIndex(next, next.length - 1));
  };

  const removeSegment = () => {
    if (segments.length <= 1) return;
    const next = segments
      .filter((_, index) => index !== activeIndex)
      .map((segment) => ({ ...segment }));
    const nextSelectedIndex = Math.max(0, activeIndex - 1);
    onChange(next);
    setSelectedIndex(resolveNormalizedSegmentIndex(next, nextSelectedIndex));
  };

  const moveSegment = (direction: -1 | 1) => {
    const nextIndex = activeIndex + direction;
    if (nextIndex < 0 || nextIndex >= segments.length) return;
    const next = segments.map((segment) => ({ ...segment }));
    [next[activeIndex], next[nextIndex]] = [next[nextIndex], next[activeIndex]];
    onChange(next);
    setSelectedIndex(resolveNormalizedSegmentIndex(next, nextIndex));
  };

  const renderShiftOptions = (
    options: typeof PATTERN_SHIFT_OPTIONS,
    groupLabel: string,
  ) => (
    <View
      accessibilityLabel={groupLabel}
      accessibilityRole="radiogroup"
      style={styles.shiftOptions}>
      {options.map((option) => (
        <SelectionPill
          accessibilityLabel={option.label}
          accessibilityRole="radio"
          key={option.code}
          label={option.label}
          onPress={() => changeShift(option.code)}
          selected={activeSegment.shiftCode === option.code}
          semanticColor={resolveCodeColor(option.code, palette)}
          style={[styles.shiftOption, stacked && styles.shiftOptionStacked]}
          testID={`pattern-segment-shift-${option.code}`}
        />
      ))}
    </View>
  );

  return (
    <View style={styles.container}>
      <View style={[styles.heading, stacked && styles.headingStacked]}>
        <View style={styles.headingCopy}>
          <AppText accessibilityRole="header" variant="heading">
            근무 순서
          </AppText>
          <AppText tone="secondary" variant="caption">
            {segments.length}구간 · {totalDays}/42일
          </AppText>
        </View>
        <AppButton
          accessibilityHint="가장 최근 변경을 되돌립니다."
          disabled={!canUndo}
          icon="arrow-undo-outline"
          label="직전 작업 취소"
          onPress={onUndo}
          size="compact"
          variant="ghost"
        />
      </View>

      <FlatList
        accessibilityLabel={`${segments.length}개 근무 구간`}
        accessibilityRole="radiogroup"
        contentContainerStyle={styles.segmentStripContent}
        data={[...segments]}
        horizontal
        initialNumToRender={8}
        keyExtractor={(_, index) => `pattern-composer-segment-${index}`}
        maxToRenderPerBatch={8}
        renderItem={renderSegment}
        showsHorizontalScrollIndicator={false}
        style={styles.segmentStrip}
        windowSize={3}
      />

      <Surface density="compact" style={styles.editor} tone="muted">
        <View style={styles.editorHeading}>
          <View style={styles.headingCopy}>
            <AppText variant="label">{activeIndex + 1}번째 구간</AppText>
            <AppText tone="secondary" variant="caption">
              {getPatternShiftOption(activeSegment.shiftCode).label} {activeSegment.days}일
            </AppText>
          </View>
          <AppButton
          accessibilityHint="선택한 구간을 삭제합니다."
            disabled={segments.length <= 1}
            icon="trash-outline"
            label="구간 삭제"
            onPress={removeSegment}
            size="compact"
            variant="ghost"
          />
        </View>

        {renderShiftOptions(BASIC_SHIFT_OPTIONS, '기본 근무 종류')}
        <AppButton
          icon={substitutesExpanded ? 'chevron-up' : 'chevron-down'}
          label={substitutesExpanded ? '대체근무 접기' : '대체근무 펼치기'}
          onPress={() => setSubstitutesExpanded((current) => !current)}
          size="compact"
          variant="ghost"
        />
        {substitutesExpanded
          ? renderShiftOptions(SUBSTITUTE_SHIFT_OPTIONS, '대체근무 종류')
          : null}

        <View style={[styles.daysRow, stacked && styles.daysRowStacked]}>
          <AppButton
            accessibilityLabel="선택한 구간 하루 줄이기"
            disabled={activeSegment.days <= 1}
            icon="remove"
            label="하루 줄이기"
            onPress={() => changeDays(-1)}
            size="compact"
            variant="secondary"
          />
          <View accessible accessibilityLabel={`${activeSegment.days}일`} style={styles.dayCount}>
            <AppText variant="heading">{activeSegment.days}일</AppText>
          </View>
          <AppButton
            accessibilityLabel="선택한 구간 하루 늘리기"
            disabled={totalDays >= MAX_PATTERN_LENGTH}
            icon="add"
            label="하루 늘리기"
            onPress={() => changeDays(1)}
            size="compact"
            variant="secondary"
          />
        </View>

        <View style={[styles.orderActions, stacked && styles.orderActionsStacked]}>
          <AppButton
            disabled={activeIndex === 0}
            icon="chevron-up"
            label="앞으로"
            onPress={() => moveSegment(-1)}
            size="compact"
            variant="ghost"
          />
          <AppButton
            disabled={activeIndex === segments.length - 1}
            icon="chevron-down"
            label="뒤로"
            onPress={() => moveSegment(1)}
            size="compact"
            variant="ghost"
          />
          <AppButton
            disabled={totalDays >= MAX_PATTERN_LENGTH}
            icon="add"
            label={totalDays >= MAX_PATTERN_LENGTH ? '42일 최대' : '구간 추가'}
            onPress={addSegment}
            size="compact"
            variant="secondary"
          />
        </View>
      </Surface>
    </View>
  );
});

function resolveNormalizedSegmentIndex(
  segments: readonly PatternComposerSegment[],
  sourceIndex: number,
): number {
  let normalizedIndex = 0;
  for (let index = 1; index <= sourceIndex && index < segments.length; index += 1) {
    if (segments[index].shiftCode !== segments[index - 1].shiftCode) {
      normalizedIndex += 1;
    }
  }
  return normalizedIndex;
}

function resolveCodeColor(code: PatternShiftCode, palette: AppPalette): string {
  const shift = getPatternShiftOption(code).shiftTypeId;
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
    container: { gap: spacing.medium },
    heading: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: spacing.medium,
    },
    headingStacked: { alignItems: 'stretch', flexDirection: 'column' },
    headingCopy: { minWidth: 0, flex: 1, gap: spacing.tiny },
    segmentStrip: { marginHorizontal: -spacing.tiny },
    segmentStripContent: { gap: spacing.small, paddingHorizontal: spacing.tiny },
    segmentPill: { minWidth: 96, minHeight: 52 },
    editor: { gap: spacing.medium, padding: spacing.medium },
    editorHeading: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: spacing.small,
    },
    shiftOptions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.small },
    shiftOption: { minWidth: 120, flexBasis: '45%', flexGrow: 1 },
    shiftOptionStacked: { width: '100%', flexBasis: '100%' },
    daysRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: spacing.small,
    },
    daysRowStacked: { alignItems: 'stretch', flexDirection: 'column' },
    dayCount: {
      minWidth: 72,
      minHeight: 48,
      alignItems: 'center',
      justifyContent: 'center',
    },
    orderActions: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      justifyContent: 'flex-end',
      gap: spacing.small,
    },
    orderActionsStacked: { alignItems: 'stretch', flexDirection: 'column' },
  });
}
