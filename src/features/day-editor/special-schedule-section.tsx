import { Pressable, StyleSheet, View } from 'react-native';

import { AppIcon, type AppIconName } from '@/components/app-icon';
import { AppText, MenuGroup } from '@/components/ui-kit';
import { radii, spacing, type AppPalette } from '@/constants/app-theme';
import { useAppTheme } from '@/hooks/use-app-theme';
import { useThemedStyles } from '@/hooks/use-themed-styles';
import type { DayExceptionType } from '@/models/app-data';
import { getDayExceptionAppearance } from '@/utils/day-exception-appearance';

const EXCEPTION_OPTIONS: readonly {
  icon: AppIconName;
  label: string;
  value: DayExceptionType | null;
}[] = [
  { icon: 'remove', label: '없음', value: null },
  { icon: 'shift-off', label: '연차', value: 'leave' },
  { icon: 'book-outline', label: '교육', value: 'training' },
  { icon: 'shield-outline', label: '예비군', value: 'reserve' },
];

type SpecialScheduleSectionProps = {
  dayException: DayExceptionType | null;
  onChange: (value: DayExceptionType | null) => void;
  showTitle?: boolean;
};

export function SpecialScheduleSection({
  dayException,
  onChange,
  showTitle = true,
}: SpecialScheduleSectionProps) {
  const { palette } = useAppTheme();
  const styles = useThemedStyles(createStyles);
  const selectedAppearance = dayException
    ? getDayExceptionAppearance(dayException, palette)
    : null;

  const content = (
    <View style={styles.exceptionCard}>
        <View accessibilityRole="radiogroup" style={styles.exceptionGrid}>
          {EXCEPTION_OPTIONS.map((option) => {
            const selected = dayException === option.value;
            const appearance = option.value
              ? getDayExceptionAppearance(option.value, palette)
              : null;
            const accentColor = appearance?.accentColor ?? palette.inkMuted;
            const softColor = appearance?.softColor ?? palette.surfaceSoft;
            return (
              <Pressable
                key={option.label}
                accessibilityLabel={`${option.label} 예외 일정${
                  selected ? ', 선택됨' : ''
                }`}
                accessibilityRole="radio"
                accessibilityState={{ checked: selected }}
                onPress={() => onChange(option.value)}
                style={({ pressed }) => [
                  styles.exceptionChoice,
                  selected && {
                    backgroundColor: softColor,
                    borderColor: accentColor,
                  },
                  pressed && styles.pressed,
                ]}>
                <AppIcon
                  accessible={false}
                  color={accentColor}
                  name={appearance?.iconName ?? option.icon}
                  size={17}
                />
                <AppText
                  color={selected ? accentColor : palette.inkMuted}
                  variant="caption">
                  {option.label}
                </AppText>
              </Pressable>
            );
          })}
        </View>
        {dayException && selectedAppearance ? (
          <View accessibilityLiveRegion="polite" style={styles.exceptionGuide}>
            <AppIcon
              accessible={false}
              color={selectedAppearance.accentColor}
              name={selectedAppearance.iconName}
              size={18}
            />
            <AppText
              tone="secondary"
              style={styles.exceptionGuideText}
              variant="caption">
              {dayException === 'leave'
                ? '연차일에는 근무 알람이 울리지 않아요.'
                : `${selectedAppearance.label} 일정에는 주간 근무 알람이 울려요. 기본 근무표는 그대로 유지돼요.`}
            </AppText>
          </View>
        ) : null}
    </View>
  );
  return showTitle ? (
    <MenuGroup centered title="특별 일정" style={styles.sectionGroup}>
      {content}
    </MenuGroup>
  ) : content;
}

function createStyles(palette: AppPalette) {
  return StyleSheet.create({
    sectionGroup: { gap: spacing.small },
    exceptionCard: { gap: spacing.small },
    exceptionGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.small,
    },
    exceptionChoice: {
      flexBasis: '48%',
      minWidth: 0,
      minHeight: 48,
      flexGrow: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      borderRadius: radii.pill,
      borderWidth: 1,
      borderColor: palette.controlLine,
      backgroundColor: palette.surfaceSoft,
      paddingHorizontal: spacing.small,
    },
    exceptionGuide: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.small,
      borderRadius: radii.medium,
      backgroundColor: palette.surfaceSoft,
      padding: spacing.medium,
    },
    exceptionGuideText: { flex: 1, minWidth: 0 },
    pressed: { opacity: 0.65 },
  });
}
