import { Pressable, StyleSheet, View } from 'react-native';
import { useState } from 'react';

import { AppIcon } from '@/components/app-icon';
import { AppText, Card } from '@/components/ui-kit';
import { WorkRoutinePanel } from '@/components/work-routine-panel';
import {
  buildCollapsedSleepSummaryModel,
  type CollapsedSleepAction,
} from '@/components/sleep-timing-card-model';
import { radii, spacing, type AppPalette } from '@/constants/app-theme';
import { shape } from '@/design-system';
import { useAppTheme } from '@/hooks/use-app-theme';
import { useThemedStyles } from '@/hooks/use-themed-styles';
import type {
  SleepTimingGuidance,
  SleepTimingTransition,
  SleepTimingWindow,
} from '@/services/sleep-timing-planner';
import {
  ROUTINE_ALARM_LEAD_MINUTES,
  type WorkRoutinePlan,
} from '@/services/work-routine-planner';
import { formatDuration, toDateKey } from '@/utils/date';

type SleepTimingCardProps = {
  guidance: SleepTimingGuidance;
  now: Date;
  compact?: boolean;
  routinePlan?: WorkRoutinePlan | null;
};

function formatClock(timestamp: number): string {
  const date = new Date(timestamp);
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

function formatDateLabel(timestamp: number, now: Date): string {
  const date = new Date(timestamp);
  const dateKey = toDateKey(date);
  const todayKey = toDateKey(now);
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);

  if (dateKey === todayKey) return '오늘';
  if (dateKey === toDateKey(tomorrow)) return '내일';
  return `${date.getMonth() + 1}월 ${date.getDate()}일`;
}

function formatShortDateTime(timestamp: number, now: Date): string {
  return `${formatDateLabel(timestamp, now)} ${formatClock(timestamp)}`;
}

function formatShortTimeRange(startAt: number, endAt: number, now: Date): string {
  if (toDateKey(new Date(startAt)) === toDateKey(new Date(endAt))) {
    return `${formatDateLabel(startAt, now)} ${formatClock(startAt)}–${formatClock(endAt)}`;
  }
  return `${formatShortDateTime(startAt, now)}–${formatShortDateTime(endAt, now)}`;
}

function formatBedtimeRange(window: SleepTimingWindow, now: Date): string {
  const startsAt = new Date(window.bedtimeRangeStartAt);
  const endsAt = new Date(window.bedtimeRangeEndAt);
  if (startsAt.getTime() === endsAt.getTime()) {
    return formatShortDateTime(window.bedtimeRangeStartAt, now);
  }
  if (toDateKey(startsAt) === toDateKey(endsAt)) {
    return `${formatDateLabel(window.bedtimeRangeStartAt, now)} ${formatClock(window.bedtimeRangeStartAt)}–${formatClock(window.bedtimeRangeEndAt)}`;
  }
  return `${formatShortDateTime(window.bedtimeRangeStartAt, now)}–${formatShortDateTime(window.bedtimeRangeEndAt, now)}`;
}

function formatNaturalDateTime(timestamp: number): string {
  const date = new Date(timestamp);
  const weekday = ['일', '월', '화', '수', '목', '금', '토'][date.getDay()];
  const period = date.getHours() < 12 ? '오전' : '오후';
  const hour = date.getHours() % 12 || 12;
  const minute = date.getMinutes();
  return `${date.getMonth() + 1}월 ${date.getDate()}일 ${weekday}요일 ${period} ${hour}시${minute > 0 ? ` ${minute}분` : ''}`;
}

function getDurationMinutes(window: SleepTimingWindow): number {
  return Math.max(0, Math.round((window.endAt - window.startAt) / 60_000));
}

function getWindowAccessibilityLabel(window: SleepTimingWindow): string {
  if (window.kind === 'pre-night-nap') {
    return `${window.title}. 보충 수면 ${formatNaturalDateTime(window.startAt)}부터 ${formatNaturalDateTime(window.endAt)}까지. 눕기 준비 ${formatNaturalDateTime(window.bedtimeRangeStartAt)}부터 ${formatNaturalDateTime(window.bedtimeRangeEndAt)}까지. 총 ${formatDuration(getDurationMinutes(window))}.`;
  }
  return `${window.title}. 취침 ${formatNaturalDateTime(window.startAt)}. 기상 ${formatNaturalDateTime(window.endAt)}. 취침 범위 ${formatNaturalDateTime(window.bedtimeRangeStartAt)}부터 ${formatNaturalDateTime(window.bedtimeRangeEndAt)}까지. 총 ${formatDuration(getDurationMinutes(window))}.`;
}

function formatCollapsedSleepAction(
  action: CollapsedSleepAction,
  now: Date,
): string {
  if (action.kind === 'continue') return '수면 유지';
  if (action.kind === 'prepare-nap') {
    return action.at <= now.getTime()
      ? '보충 수면 준비'
      : `${formatShortDateTime(action.at, now)} 보충 수면 준비`;
  }
  return `${formatShortDateTime(action.at, now)}까지 취침`;
}

function getCoreTimingLine(window: SleepTimingWindow, now: Date): string {
  const startLabel = window.kind === 'pre-night-nap' ? '보충 수면' : '취침';
  return `${startLabel} ${formatShortDateTime(window.startAt, now)} · 기상 ${formatShortDateTime(window.endAt, now)}`;
}

function TimingWindow({
  compact,
  now,
  primary,
  window,
}: {
  compact: boolean;
  now: Date;
  primary: boolean;
  window: SleepTimingWindow;
}) {
  const { palette } = useAppTheme();
  const styles = useThemedStyles(createStyles);
  const duration = formatDuration(getDurationMinutes(window));
  const isNap = window.kind === 'pre-night-nap';

  return (
    <View
      accessible
      accessibilityLabel={getWindowAccessibilityLabel(window)}
      style={[
        styles.window,
        primary ? styles.primaryWindow : styles.additionalWindow,
        compact && styles.windowCompact,
      ]}>
      <View style={styles.windowHeading}>
        <AppText
          variant="label"
          color={primary ? palette.blue : undefined}
          tone="secondary"
          style={styles.windowTitle}>
          {window.title}
        </AppText>
        <View style={styles.durationBadge}>
          <AppText
            variant="caption"
            color={primary ? palette.blue : undefined}
            tone="secondary"
            style={styles.durationText}>
            목표 {duration}
          </AppText>
        </View>
      </View>
      <AppText
        variant={primary ? 'heading' : 'label'}
        style={styles.timeRange}>
        {isNap ? '보충 수면' : '취침 목표'} {formatShortDateTime(window.startAt, now)}
      </AppText>
      <AppText variant="caption" tone="secondary" style={styles.shiftContext}>
        {isNap ? '눕기 준비' : '취침 범위'} {formatBedtimeRange(window, now)} · 기상 {formatShortDateTime(window.endAt, now)}
      </AppText>
    </View>
  );
}

function TransitionPanel({
  compact,
  now,
  transition,
}: {
  compact: boolean;
  now: Date;
  transition: SleepTimingTransition;
}) {
  const { palette } = useAppTheme();
  const styles = useThemedStyles(createStyles);
  const remainingMinutes = Math.max(
    1,
    Math.ceil((transition.endAt - now.getTime()) / 60_000),
  );
  const accessibilityLabel = `야간 전환. ${formatNaturalDateTime(transition.startAt)}부터 ${formatNaturalDateTime(transition.endAt)}까지. 보충 수면 준비까지 ${formatDuration(remainingMinutes)} 남음.`;

  return (
    <View
      accessible
      accessibilityLabel={accessibilityLabel}
      style={[styles.transition, compact && styles.transitionCompact]}>
      <View style={styles.transitionHeading}>
        <View style={styles.transitionTitleRow}>
          <View style={styles.transitionIcon}>
            <AppIcon accessible={false} color={palette.amber} name="swap-horizontal" size={19} />
          </View>
          <View style={styles.transitionCopy}>
            <AppText variant="label" color={palette.amber}>
              야간 전환
            </AppText>
            <AppText variant="caption" tone="secondary">
              {formatShortTimeRange(transition.startAt, transition.endAt, now)}
            </AppText>
          </View>
        </View>
        <View style={styles.transitionBadge}>
          <AppText variant="caption" color={palette.amber} style={styles.durationText}>
            {formatDuration(remainingMinutes)} 남음
          </AppText>
        </View>
      </View>
      <AppText variant="caption" tone="primary">
        {formatShortDateTime(transition.endAt, now)} 보충 수면 준비
      </AppText>
    </View>
  );
}

export function SleepTimingCard({
  guidance,
  now,
  compact = false,
  routinePlan = null,
}: SleepTimingCardProps) {
  const { palette } = useAppTheme();
  const styles = useThemedStyles(createStyles);
  const [expanded, setExpanded] = useState(false);
  const collapsedSummary = buildCollapsedSleepSummaryModel(
    guidance,
    now.getTime(),
  );
  const collapsedAction = formatCollapsedSleepAction(
    collapsedSummary.action,
    now,
  );
  const collapsedTiming = getCoreTimingLine(
    collapsedSummary.nearestWindow,
    now,
  );
  const summaryAccessibilityLabel = [
    collapsedAction,
    collapsedTiming,
  ].join(' ');

  return (
    <Card style={[styles.card, compact && styles.cardCompact]}>
      <View style={[styles.header, compact && styles.headerCompact]}>
        <View style={styles.headerIcon}>
          <AppIcon accessible={false} color={palette.blue} name="shift-night" size={22} />
        </View>
        <View style={styles.headerCopy}>
          <AppText accessibilityRole="header" aria-level={3} variant="label">
            수면 시간
          </AppText>
          <AppText variant="caption" tone="secondary">
            취침·기상 참고
          </AppText>
        </View>
      </View>

      <View
        accessible
        accessibilityLabel={summaryAccessibilityLabel}
        style={[styles.coreSummary, compact && styles.coreSummaryCompact]}>
        <AppText variant="label" color={palette.blue}>
          {collapsedAction}
        </AppText>
        <AppText variant="caption" tone="secondary">
          {collapsedTiming}
        </AppText>
      </View>

      <View accessible style={styles.referenceNotice}>
        <AppIcon
          accessible={false}
          color={palette.inkMuted}
          name="alert-circle-outline"
          size={17}
        />
        <AppText tone="secondary" style={styles.referenceNoticeCopy} variant="caption">
          수면 참고용 · 의료 조언 아님
        </AppText>
      </View>

      {guidance.primary.usesFallbackAlarmLead ? (
        <View accessible accessibilityLiveRegion="polite" style={styles.fallbackNotice}>
          <AppIcon accessible={false} color={palette.amber} name="alert-circle-outline" size={18} />
          <AppText variant="caption" tone="primary" style={styles.fallbackNoticeCopy}>
            기상 설정 없음 · 근무 시작 {formatDuration(ROUTINE_ALARM_LEAD_MINUTES)} 전 기준
          </AppText>
        </View>
      ) : null}

      <Pressable
        accessibilityHint={expanded ? '전체 일정을 접습니다.' : '전체 일정을 펼칩니다.'}
        accessibilityLabel={expanded ? '일정 접기' : '전체 일정 보기'}
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        onPress={() => setExpanded((current) => !current)}
        style={({ pressed }) => [styles.detailToggle, pressed && styles.detailTogglePressed]}>
        <AppText variant="label" color={palette.blue}>
          {expanded ? '일정 접기' : '전체 일정'}
        </AppText>
        <AppIcon
          accessible={false}
          color={palette.blue}
          name={expanded ? 'chevron-up' : 'chevron-down'}
          size={18}
        />
      </Pressable>

      {expanded ? (
        <View style={styles.details}>
          {guidance.transition ? (
            <TransitionPanel compact={compact} now={now} transition={guidance.transition} />
          ) : null}

          <TimingWindow compact={compact} now={now} primary window={guidance.primary} />

          {guidance.additional.length > 0 ? (
            <View style={styles.additionalList}>
              {guidance.additional.map((window) => (
                <TimingWindow
                  compact={compact}
                  key={window.id}
                  now={now}
                  primary={false}
                  window={window}
                />
              ))}
            </View>
          ) : null}

          {routinePlan ? <WorkRoutinePanel compact={compact} plan={routinePlan} /> : null}
        </View>
      ) : null}
    </Card>
  );
}

const createStyles = (palette: AppPalette) =>
  StyleSheet.create({
    card: {
      gap: spacing.medium,
    },
    cardCompact: {
      padding: spacing.large,
    },
    header: {
      minWidth: 0,
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.medium,
    },
    headerCompact: {
      alignItems: 'flex-start',
    },
    headerIcon: {
      width: 32,
      height: 44,
      flexShrink: 0,
      alignItems: 'center',
      justifyContent: 'center',
    },
    headerCopy: {
      flex: 1,
      minWidth: 0,
      gap: 2,
    },
    coreSummary: {
      minWidth: 0,
      gap: 4,
      borderLeftWidth: 3,
      borderLeftColor: palette.blue,
      paddingLeft: spacing.medium,
      paddingVertical: spacing.medium,
    },
    referenceNotice: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: spacing.small,
      paddingHorizontal: spacing.small,
    },
    referenceNoticeCopy: { flex: 1, minWidth: 0 },
    coreSummaryCompact: {
      paddingHorizontal: spacing.medium,
    },
    fallbackNotice: {
      minWidth: 0,
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.small,
      borderRadius: shape.panel,
      backgroundColor: palette.amberSoft,
      paddingHorizontal: spacing.medium,
      paddingVertical: spacing.small,
    },
    fallbackNoticeCopy: {
      flex: 1,
      minWidth: 0,
    },
    detailToggle: {
      minHeight: 48,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.small,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: palette.line,
    },
    detailTogglePressed: {
      opacity: 0.72,
    },
    details: {
      gap: spacing.medium,
    },
    window: {
      minWidth: 0,
      gap: 5,
      borderRadius: shape.panel,
      paddingHorizontal: spacing.large,
      paddingVertical: spacing.medium,
    },
    windowCompact: {
      paddingHorizontal: spacing.medium,
    },
    primaryWindow: {
      borderLeftWidth: 3,
      borderLeftColor: palette.blue,
      backgroundColor: palette.surfaceSoft,
    },
    additionalWindow: {
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: palette.line,
    },
    windowHeading: {
      minWidth: 0,
      flexDirection: 'row',
      flexWrap: 'wrap',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: spacing.small,
    },
    windowTitle: {
      flexShrink: 1,
    },
    durationBadge: {
      minHeight: 28,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: spacing.small,
      paddingVertical: 4,
    },
    durationText: {
      textAlign: 'center',
    },
    timeRange: {
      flexShrink: 1,
    },
    shiftContext: {
      flexShrink: 1,
    },
    additionalList: {
      gap: spacing.small,
    },
    transition: {
      minWidth: 0,
      gap: spacing.small,
      borderLeftWidth: 3,
      borderLeftColor: palette.amber,
      backgroundColor: palette.amberSoft,
      paddingHorizontal: spacing.large,
      paddingVertical: spacing.medium,
    },
    transitionCompact: {
      paddingHorizontal: spacing.medium,
    },
    transitionHeading: {
      minWidth: 0,
      flexDirection: 'row',
      flexWrap: 'wrap',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: spacing.small,
    },
    transitionTitleRow: {
      minWidth: 0,
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.small,
    },
    transitionIcon: {
      width: 34,
      height: 34,
      flexShrink: 0,
      alignItems: 'center',
      justifyContent: 'center',
    },
    transitionCopy: {
      minWidth: 0,
      flex: 1,
      gap: 1,
    },
    transitionBadge: {
      minHeight: 28,
      flexShrink: 0,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: radii.pill,
      backgroundColor: palette.surface,
      paddingHorizontal: spacing.medium,
      paddingVertical: 4,
    },
  });
