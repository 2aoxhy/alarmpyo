import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppIcon } from '@/components/app-icon';
import { AnimatedShiftIcon, getShiftIconKind } from '@/components/animated-shift-icon';
import { SelectionCard, SelectionPill } from '@/components/selection-controls';
import { AppText, MenuDivider, MenuGroup } from '@/components/ui-kit';
import { radii, spacing, type AppPalette } from '@/constants/app-theme';
import { useAppTheme } from '@/hooks/use-app-theme';
import { useThemedStyles } from '@/hooks/use-themed-styles';
import type { ShiftType } from '@/models/app-data';
import { formatMinutes } from '@/utils/date';
import { getShiftAppearance } from '@/utils/shift-appearance';

import {
  isSubstituteShiftId,
  SUBSTITUTE_DAY_ID,
  SUBSTITUTE_NIGHT_ID,
  type DaySelection,
  type SubstituteMode,
} from './day-editor-types';

type ShiftSelectionSectionProps = {
  compact: boolean;
  onChoose: (selection: DaySelection) => void;
  onChooseSubstituteMode: (mode: SubstituteMode) => void;
  patternShift: ShiftType | null;
  selection: DaySelection;
  shiftTypes: ShiftType[];
  substituteMode: SubstituteMode;
};

export function ShiftSelectionSection({
  compact,
  onChoose,
  onChooseSubstituteMode,
  patternShift,
  selection,
  shiftTypes,
  substituteMode,
}: ShiftSelectionSectionProps) {
  const { isDark, palette } = useAppTheme();
  const styles = useThemedStyles(createStyles);
  const substituteDay = shiftTypes.find((shift) => shift.id === SUBSTITUTE_DAY_ID);
  const substituteNight = shiftTypes.find((shift) => shift.id === SUBSTITUTE_NIGHT_ID);
  const activeSubstitute = substituteMode === 'night' ? substituteNight : substituteDay;
  const activeSubstituteAppearance = activeSubstitute
    ? getShiftAppearance(activeSubstitute, palette, isDark)
    : null;
  const substituteDayAppearance = substituteDay
    ? getShiftAppearance(substituteDay, palette, isDark)
    : null;
  const substituteNightAppearance = substituteNight
    ? getShiftAppearance(substituteNight, palette, isDark)
    : null;
  const substituteSelected =
    selection === SUBSTITUTE_DAY_ID || selection === SUBSTITUTE_NIGHT_ID;

  return (
    <MenuGroup centered title="이날의 근무" style={styles.sectionGroup}>
      <View style={styles.selectionMenu}>
        <View
          accessibilityRole="radiogroup"
          style={[styles.selectionGrid, compact && styles.selectionGridCompact]}>
          <CompactChoice
            accessibilityLabel={`기본 근무표 적용하기. 이날 적용되는 일정은 다음과 같습니다. ${patternShift?.name ?? '일정 없음'}.`}
            compact={compact}
            icon={
              <AppIcon
                accessible={false}
                color={palette.indigo}
                name="repeat"
                size={21}
              />
            }
            label="기본"
            onPress={() => onChoose('pattern')}
            selected={selection === 'pattern'}
            selectedColor={palette.indigo}
            softColor={palette.indigoSoft}
          />

          {shiftTypes
            .filter((shift) => !isSubstituteShiftId(shift.id))
            .map((shift) => {
              const appearance = getShiftAppearance(shift, palette, isDark);
              return (
                <CompactChoice
                  key={shift.id}
                  accessibilityLabel={`${shift.name}. ${
                    shift.isOff
                      ? '쉬는 날입니다.'
                      : `${formatMinutes(shift.startMinutes)}부터 ${
                          shift.endsNextDay ? '다음 날 ' : ''
                        }${formatMinutes(shift.endMinutes)}까지입니다.`
                  }`}
                  compact={compact}
                  icon={
                    <AnimatedShiftIcon
                      animated={selection === shift.id}
                      color={appearance.accentColor}
                      kind={getShiftIconKind(shift.id, shift.isOff)}
                      size={23}
                    />
                  }
                  label={shift.name}
                  onPress={() => onChoose(shift.id)}
                  selected={selection === shift.id}
                  selectedColor={appearance.accentColor}
                  softColor={appearance.softColor}
                />
              );
            })}

          {activeSubstitute && activeSubstituteAppearance ? (
            <CompactChoice
              accessibilityLabel={`${activeSubstitute.name}. 특근 일정을 추가합니다.`}
              compact={compact}
              icon={
                <AnimatedShiftIcon
                  animated={substituteSelected}
                  color={activeSubstituteAppearance.accentColor}
                  kind="substitute"
                  size={23}
                />
              }
              label="특근"
              onPress={() => onChoose(activeSubstitute.id)}
              selected={substituteSelected}
              selectedColor={activeSubstituteAppearance.accentColor}
              softColor={palette.surfaceSoft}
            />
          ) : null}

          <CompactChoice
            accessibilityLabel="일정 없음. 휴무와 달리 달력에 아무 일정도 표시하지 않습니다."
            compact={compact}
            icon={
              <AppIcon
                accessible={false}
                color={palette.inkSoft}
                name="remove"
                size={21}
              />
            }
            label="일정 없음"
            onPress={() => onChoose(null)}
            selected={selection === null}
            selectedColor={palette.inkSoft}
            softColor={palette.surfaceSoft}
          />
        </View>

        {substituteSelected ? (
          <>
            <MenuDivider inset={false} />
            <View
              accessibilityLabel="특근 종류"
              accessibilityRole="radiogroup"
              style={styles.substituteModeTabs}>
              {(
                [
                  {
                    appearance: substituteDayAppearance,
                    label: substituteDay?.shortName ?? '주대',
                    value: 'day' as const,
                  },
                  {
                    appearance: substituteNightAppearance,
                    label: substituteNight?.shortName ?? '야대',
                    value: 'night' as const,
                  },
                ]
              ).map((option) => {
                const selected = substituteMode === option.value;
                const color = option.appearance?.accentColor ?? palette.indigo;
                return (
                  <SelectionPill
                    key={option.value}
                    accessibilityLabel={`${option.label} 특근`}
                    label={option.label}
                    onPress={() => {
                      if (!selected) onChooseSubstituteMode(option.value);
                    }}
                    selected={selected}
                    semanticColor={color}
                    style={styles.substituteModeTab}
                  />
                );
              })}
            </View>
          </>
        ) : null}
      </View>
    </MenuGroup>
  );
}

type CompactChoiceProps = {
  accessibilityLabel: string;
  compact: boolean;
  icon: ReactNode;
  label: string;
  onPress: () => void;
  selected: boolean;
  selectedColor: string;
  softColor: string;
};

function CompactChoice({
  accessibilityLabel,
  compact,
  icon,
  label,
  onPress,
  selected,
  selectedColor,
  softColor,
}: CompactChoiceProps) {
  const styles = useThemedStyles(createStyles);
  return (
    <SelectionCard
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      selected={selected}
      semanticColor={selectedColor}
      style={[styles.compactChoice, compact && styles.compactChoiceCompact]}
      contentStyle={styles.compactChoiceContent}>
      <View style={[styles.compactChoiceIcon, { backgroundColor: softColor }]}>
        {icon}
      </View>
      <AppText numberOfLines={2} style={styles.compactChoiceLabel} variant="label">
        {label}
      </AppText>
    </SelectionCard>
  );
}

function createStyles(palette: AppPalette) {
  return StyleSheet.create({
    sectionGroup: { gap: spacing.small },
    selectionMenu: { gap: spacing.small },
    selectionGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      justifyContent: 'space-between',
      gap: spacing.small,
    },
    selectionGridCompact: { flexDirection: 'column' },
    compactChoice: {
      width: '48%',
      minHeight: 54,
    },
    compactChoiceContent: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.small,
      paddingHorizontal: spacing.small,
      paddingVertical: spacing.small,
    },
    compactChoiceCompact: { width: '100%' },
    compactChoiceIcon: {
      width: 32,
      height: 32,
      flexShrink: 0,
      borderRadius: 13,
      alignItems: 'center',
      justifyContent: 'center',
    },
    compactChoiceLabel: { flex: 1, minWidth: 0 },
    substituteModeTabs: {
      flexDirection: 'row',
      gap: spacing.tiny,
      padding: spacing.tiny,
      borderRadius: radii.medium,
      backgroundColor: palette.surfaceSoft,
    },
    substituteModeTab: {
      minHeight: 48,
      flex: 1,
      paddingHorizontal: spacing.small,
    },
  });
}
