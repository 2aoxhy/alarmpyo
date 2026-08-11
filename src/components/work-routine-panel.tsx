import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppIcon } from '@/components/app-icon';
import { AppText } from '@/components/ui-kit';
import { radii, spacing, type AppPalette } from '@/constants/app-theme';
import { useAppTheme } from '@/hooks/use-app-theme';
import { useThemedStyles } from '@/hooks/use-themed-styles';
import type {
  WorkRoutinePlan,
  WorkRoutineStep,
} from '@/services/work-routine-planner';

type WorkRoutinePanelProps = {
  plan: WorkRoutinePlan;
  compact?: boolean;
};

function formatClock(timestamp: number): string {
  const date = new Date(timestamp);
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

function formatStepTime(step: WorkRoutineStep): string {
  if (step.id === 'depart' || step.id === 'handover') {
    return formatClock(step.at);
  }
  return `${formatClock(step.at)}–${formatClock(step.endAt)}`;
}

export function WorkRoutinePanel({
  plan,
  compact = false,
}: WorkRoutinePanelProps) {
  const { palette } = useAppTheme();
  const styles = useThemedStyles(createStyles);
  const [expanded, setExpanded] = useState(false);
  const currentStepIndex = plan.currentStep
    ? plan.steps.findIndex((step) => step.id === plan.currentStep?.id)
    : -1;
  const headline = plan.currentStep ? '지금 할 일' : plan.title;
  const detail = plan.currentStep?.instruction ?? plan.summary;
  const disclosureLabel = expanded ? '상세 일정 접기' : '상세 일정 펼치기';

  return (
    <View style={[styles.panel, compact && styles.panelCompact]}>
      <Pressable
        accessibilityHint={`${disclosureLabel}를 실행해요.`}
        accessibilityLabel={`${plan.title}. ${headline}. ${detail}. ${disclosureLabel}`}
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        onPress={() => setExpanded((value) => !value)}
        style={({ pressed }) => [
          styles.summaryButton,
          compact && styles.summaryButtonCompact,
          pressed && styles.pressed,
        ]}>
        <View style={styles.summaryIcon}>
          <AppIcon
            accessible={false}
            color={plan.kind === 'night' ? palette.violet : palette.mintDark}
            name={plan.kind === 'night' ? 'shift-night' : 'shift-day'}
            size={20}
          />
        </View>
        <View style={styles.summaryCopy}>
          <AppText
            color={plan.currentStep ? palette.blue : palette.inkMuted}
            variant="caption">
            {headline}
          </AppText>
          <AppText variant="label" style={styles.summaryText}>
            {detail}
          </AppText>
        </View>
        <View style={[styles.disclosureIcon, expanded && styles.disclosureIconExpanded]}>
          <AppIcon
            accessible={false}
            color={palette.inkSoft}
            name="chevron-forward"
            size={18}
          />
        </View>
      </Pressable>

      {expanded ? (
        <View style={[styles.details, compact && styles.detailsCompact]}>
          <View style={styles.detailsHeading}>
            <AppText accessibilityRole="header" variant="label">
              {plan.title}
            </AppText>
            <AppText color={palette.inkMuted} variant="caption">
              {formatClock(plan.handoverAt)} 교대에 맞춘 일정이에요.
            </AppText>
          </View>

          <View accessibilityLabel={`${plan.title} 상세 일정`} style={styles.timeline}>
            {plan.steps.map((step, index) => {
              const current = index === currentStepIndex;
              return (
                <View
                  accessible
                  accessibilityLabel={`${formatStepTime(step)}. ${step.instruction}${current ? ' 현재 단계예요.' : ''}`}
                  key={`${step.id}:${step.at}`}
                  style={styles.timelineItem}>
                  <View style={styles.timelineRail}>
                    <View style={[styles.timelineDot, current && styles.timelineDotCurrent]} />
                    {index < plan.steps.length - 1 ? <View style={styles.timelineLine} /> : null}
                  </View>
                  <View style={[styles.stepCopy, current && styles.stepCopyCurrent]}>
                    <AppText
                      color={current ? palette.blue : palette.inkMuted}
                      variant="caption">
                      {formatStepTime(step)}
                    </AppText>
                    <AppText
                      color={current ? palette.ink : palette.inkMuted}
                      variant={current ? 'label' : 'body'}>
                      {step.instruction}
                    </AppText>
                  </View>
                </View>
              );
            })}
          </View>

        </View>
      ) : null}
    </View>
  );
}

const createStyles = (palette: AppPalette) =>
  StyleSheet.create({
    panel: {
      minWidth: 0,
      overflow: 'hidden',
      borderWidth: 1,
      borderColor: palette.line,
      borderRadius: radii.medium,
      backgroundColor: palette.surfaceSoft,
    },
    panelCompact: {
      borderRadius: radii.small,
    },
    summaryButton: {
      minWidth: 0,
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: spacing.medium,
      paddingHorizontal: spacing.large,
      paddingVertical: spacing.medium,
    },
    summaryButtonCompact: {
      gap: spacing.small,
      paddingHorizontal: spacing.medium,
    },
    summaryIcon: {
      width: 38,
      height: 38,
      flexShrink: 0,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: radii.small,
      backgroundColor: palette.surface,
    },
    summaryCopy: {
      flex: 1,
      minWidth: 0,
      gap: 3,
    },
    summaryText: {
      flexShrink: 1,
    },
    disclosureIcon: {
      flexShrink: 0,
      marginTop: spacing.small,
    },
    disclosureIconExpanded: {
      transform: [{ rotate: '90deg' }],
    },
    pressed: {
      opacity: 0.72,
    },
    details: {
      gap: spacing.large,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: palette.line,
      paddingHorizontal: spacing.large,
      paddingTop: spacing.large,
      paddingBottom: spacing.large,
    },
    detailsCompact: {
      paddingHorizontal: spacing.medium,
    },
    detailsHeading: {
      minWidth: 0,
      gap: 3,
    },
    timeline: {
      minWidth: 0,
    },
    timelineItem: {
      minWidth: 0,
      flexDirection: 'row',
      alignItems: 'stretch',
      gap: spacing.small,
    },
    timelineRail: {
      width: 18,
      flexShrink: 0,
      alignItems: 'center',
    },
    timelineDot: {
      width: 9,
      height: 9,
      flexShrink: 0,
      marginTop: 7,
      borderRadius: radii.pill,
      backgroundColor: palette.controlLine,
    },
    timelineDotCurrent: {
      width: 12,
      height: 12,
      marginTop: 5,
      backgroundColor: palette.blue,
    },
    timelineLine: {
      width: StyleSheet.hairlineWidth,
      flex: 1,
      minHeight: spacing.large,
      backgroundColor: palette.line,
    },
    stepCopy: {
      flex: 1,
      minWidth: 0,
      gap: 2,
      paddingBottom: spacing.large,
    },
    stepCopyCurrent: {
      marginBottom: spacing.medium,
      borderRadius: radii.small,
      backgroundColor: palette.blueSoft,
      padding: spacing.medium,
    },
  });
