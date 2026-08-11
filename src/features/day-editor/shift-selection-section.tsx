import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppIcon } from '@/components/app-icon';
import { AnimatedShiftIcon, getShiftIconKind } from '@/components/animated-shift-icon';
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
            accessibilityLabel={`기본 근무표 적용하기. 이날 적용되는 일정은 다음과 같아요. ${patternShift?.name ?? '일정 없음'}.`}
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
                      ? '쉬는 날이에요.'
                      : `${formatMinutes(shift.startMinutes)}부터 ${
                          shift.endsNextDay ? '다음 날 ' : ''
                        }${formatMinutes(shift.endMinutes)}까지예요.`
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
              accessibilityLabel={`${activeSubstitute.name}. 대체근무를 추가해요.`}
              compact={compact}
              icon={
                <AnimatedShiftIcon
                  animated={substituteSelected}
                  color={activeSubstituteAppearance.accentColor}
                  kind="substitute"
                  size={23}
                />
              }
              label="대체근무"
              onPress={() => onChoose(activeSubstitute.id)}
              selected={substituteSelected}
              selectedColor={activeSubstituteAppearance.accentColor}
              softColor={activeSubstituteAppearance.softColor}
            />
          ) : null}

          <CompactChoice
            accessibilityLabel="일정 없음. 휴무와 달리 달력에 아무 일정도 표시하지 않아요."
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
              accessibilityLabel="대체근무 종류"
              accessibilityRole="radiogroup"
              style={styles.substituteModeTabs}>
              {(
                [
                  {
                    appearance: substituteDayAppearance,
                    label: '주간 대체',
                    value: 'day' as const,
                  },
                  {
                    appearance: substituteNightAppearance,
                    label: '야간 대체',
                    value: 'night' as const,
                  },
                ]
              ).map((option) => {
                const selected = substituteMode === option.value;
                const color = option.appearance?.accentColor ?? palette.indigo;
                return (
                  <Pressable
                    key={option.value}
                    accessibilityLabel={`${option.label}근무`}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: selected }}
                    onPress={() => {
                      if (!selected) onChooseSubstituteMode(option.value);
                    }}
                    style={({ pressed }) => [
                      styles.substituteModeTab,
                      selected && {
                        backgroundColor:
                          option.appearance?.softColor ?? palette.indigoSoft,
                        borderColor: color,
                      },
                      pressed && styles.pressed,
                    ]}>
                    <AppText
                      color={selected ? color : palette.inkMuted}
                      variant="label">
                      {option.label}
                    </AppText>
                  </Pressable>
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
    <Pressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="radio"
      accessibilityState={{ checked: selected }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.compactChoice,
        compact && styles.compactChoiceCompact,
        selected && {
          backgroundColor: softColor,
          borderColor: selectedColor,
        },
        pressed && styles.pressed,
      ]}>
      <View style={[styles.compactChoiceIcon, { backgroundColor: softColor }]}>
        {icon}
      </View>
      <AppText numberOfLines={2} style={styles.compactChoiceLabel} variant="label">
        {label}
      </AppText>
      {selected ? (
        <AppIcon
          accessible={false}
          color={selectedColor}
          name="checkmark-circle"
          size={20}
        />
      ) : null}
    </Pressable>
  );
}

function createStyles(palette: AppPalette, isDark: boolean) {
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
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.small,
      paddingHorizontal: spacing.small,
      paddingVertical: spacing.small,
      borderRadius: radii.medium,
      borderWidth: 1.5,
      borderColor: palette.controlLine,
      backgroundColor: isDark ? palette.surfaceSoft : palette.canvas,
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
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: radii.small,
      borderWidth: 1,
      borderColor: palette.transparent,
      paddingHorizontal: spacing.small,
    },
    pressed: { opacity: 0.65 },
  });
}
