import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppIcon } from '@/components/app-icon';
import { AnimatedShiftIcon, getShiftIconKind } from '@/components/animated-shift-icon';
import { SelectionCard } from '@/components/selection-controls';
import { AppText, MenuGroup } from '@/components/ui-kit';
import { spacing, type AppPalette } from '@/constants/app-theme';
import { useAppTheme } from '@/hooks/use-app-theme';
import { useThemedStyles } from '@/hooks/use-themed-styles';
import type { ShiftType } from '@/models/app-data';
import { formatMinutes } from '@/utils/date';
import { getShiftAppearance } from '@/utils/shift-appearance';

import {
  isSubstituteShiftId,
  type DaySelection,
} from './day-editor-types';

type ShiftSelectionSectionProps = {
  compact: boolean;
  onChoose: (selection: DaySelection) => void;
  patternShift: ShiftType | null;
  selection: DaySelection;
  shiftTypes: ShiftType[];
};

export function ShiftSelectionSection({
  compact,
  onChoose,
  patternShift,
  selection,
  shiftTypes,
}: ShiftSelectionSectionProps) {
  const { isDark, palette } = useAppTheme();
  const styles = useThemedStyles(createStyles);
  const substituteShifts = shiftTypes.filter((shift) =>
    isSubstituteShiftId(shift.id),
  );

  return (
    <MenuGroup centered title="근무" style={styles.sectionGroup}>
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

          {substituteShifts.map((shift) => {
            const appearance = getShiftAppearance(shift, palette, isDark);
            const day = shift.id === 'substitute-day';
            return (
              <CompactChoice
                accessibilityLabel={`${day ? '주간' : '야간'} 특근. ${shift.name} 일정을 적용합니다.`}
                compact={compact}
                icon={
                  <AnimatedShiftIcon
                    animated={selection === shift.id}
                    color={appearance.accentColor}
                    kind="substitute"
                    size={23}
                  />
                }
                key={shift.id}
                label={`${day ? '주간' : '야간'} 특근`}
                onPress={() => onChoose(shift.id)}
                selected={selection === shift.id}
                selectedColor={appearance.accentColor}
                softColor={appearance.softColor}
              />
            );
          })}
        </View>
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
  });
}
