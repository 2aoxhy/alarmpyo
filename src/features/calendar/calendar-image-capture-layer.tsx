import type { RefObject } from 'react';
import {
  ActivityIndicator,
  Modal,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import ViewShot, { type ViewShotRef } from 'react-native-view-shot';

import { AppText } from '@/components/ui-kit';
import type { ShiftVisualRole } from '@/design-system';
import {
  CALENDAR_IMAGE_LOGICAL_HEIGHT,
  CALENDAR_IMAGE_LOGICAL_WIDTH,
  type CalendarImageShareDay,
  type CalendarImageShareSnapshot,
} from './calendar-image-share-model';

const WEEKDAY_LABELS = ['일', '월', '화', '수', '목', '금', '토'] as const;

const ROLE_COLORS: Readonly<
  Record<ShiftVisualRole, Readonly<{ backgroundColor: string; color: string }>>
> = {
  custom: { backgroundColor: '#2A2F35', color: '#D9DEE5' },
  day: { backgroundColor: '#0E4B43', color: '#7BE4CD' },
  evening: { backgroundColor: '#4A3518', color: '#F0C36A' },
  night: { backgroundColor: '#112B46', color: '#A8DAFF' },
  off: { backgroundColor: '#2A2F35', color: '#D9DEE5' },
  special: { backgroundColor: '#3A2B14', color: '#F0C36A' },
  'substitute-day': { backgroundColor: '#0E4B43', color: '#F0C36A' },
  'substitute-night': { backgroundColor: '#112B46', color: '#F0C36A' },
};

type Props = {
  captureRef: RefObject<ViewShotRef | null>;
  onCaptureLayout: () => void;
  snapshot: CalendarImageShareSnapshot;
};

export function CalendarImageCaptureLayer({
  captureRef,
  onCaptureLayout,
  snapshot,
}: Props) {
  return (
    <Modal
      animationType="fade"
      onRequestClose={() => undefined}
      statusBarTranslucent
      transparent
      visible>
      <View style={styles.modalRoot}>
      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        pointerEvents="none"
        style={styles.captureStage}>
        <ViewShot
          ref={captureRef}
          onLayout={onCaptureLayout}
          style={styles.image}>
          <View style={styles.titleArea}>
            <Text style={styles.title}>
              {snapshot.year}년 {snapshot.month + 1}월 근무표
            </Text>
          </View>
          <View style={styles.weekdayRow}>
            {WEEKDAY_LABELS.map((label, index) => (
              <View key={label} style={styles.weekdayCell}>
                <Text
                  style={[
                    styles.weekdayText,
                    index === 0 && styles.sundayText,
                    index === 6 && styles.saturdayText,
                  ]}>
                  {label}
                </Text>
              </View>
            ))}
          </View>
          <View style={styles.weeks}>
            {snapshot.weeks.map((week) => (
              <View key={week[0]?.dateKey} style={styles.weekRow}>
                {week.map((day, weekdayIndex) => (
                  <CalendarImageDayCell
                    day={day}
                    key={day.dateKey}
                    weekdayIndex={weekdayIndex}
                  />
                ))}
              </View>
            ))}
          </View>
        </ViewShot>
      </View>
      <View
        accessible
        accessibilityLabel="근무표 공유 이미지를 만드는 중입니다."
        accessibilityLiveRegion="polite"
        accessibilityRole="progressbar"
        accessibilityViewIsModal
        style={styles.busyCover}>
        <View style={styles.busyCard}>
          <ActivityIndicator color="#89CEFF" size="small" />
          <AppText variant="label">공유 이미지 만드는 중</AppText>
        </View>
      </View>
      </View>
    </Modal>
  );
}

function CalendarImageDayCell({
  day,
  weekdayIndex,
}: {
  day: CalendarImageShareDay;
  weekdayIndex: number;
}) {
  if (!day.inCurrentMonth) return <View style={styles.emptyDayCell} />;
  const roleColors = day.shiftRole ? ROLE_COLORS[day.shiftRole] : null;
  const dateColorStyle =
    weekdayIndex === 0
      ? styles.sundayText
      : weekdayIndex === 6
        ? styles.saturdayText
        : null;

  return (
    <View style={styles.dayCell}>
      <Text style={[styles.dayNumber, dateColorStyle]}>{day.day}</Text>
      <View style={styles.dayDetails}>
        {day.holidayLabel ? (
          <Text numberOfLines={1} style={styles.holidayLabel}>
            {day.holidayLabel}
          </Text>
        ) : (
          <View style={styles.emptyLabel} />
        )}
        {day.shiftLabel && roleColors ? (
          <View
            style={[
              styles.shiftBadge,
              { backgroundColor: roleColors.backgroundColor },
            ]}>
            <Text
              adjustsFontSizeToFit
              minimumFontScale={0.72}
              numberOfLines={1}
              style={[styles.shiftLabel, { color: roleColors.color }]}>
              {day.shiftLabel}
            </Text>
          </View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  modalRoot: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  captureStage: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    zIndex: 100,
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingTop: 20,
  },
  image: {
    width: CALENDAR_IMAGE_LOGICAL_WIDTH,
    height: CALENDAR_IMAGE_LOGICAL_HEIGHT,
    overflow: 'hidden',
    backgroundColor: '#101214',
    borderWidth: 1,
    borderColor: '#353A42',
  },
  titleArea: {
    height: 65,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#353A42',
    backgroundColor: '#181B1F',
  },
  title: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: -0.6,
  },
  weekdayRow: {
    height: 29,
    flexDirection: 'row',
    backgroundColor: '#181B1F',
    borderBottomWidth: 1,
    borderBottomColor: '#59616C',
  },
  weekdayCell: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  weekdayText: { color: '#D9DEE5', fontSize: 12, fontWeight: '700' },
  sundayText: { color: '#FF899B' },
  saturdayText: { color: '#89CEFF' },
  weeks: { flex: 1 },
  weekRow: { flex: 1, flexDirection: 'row' },
  dayCell: {
    minWidth: 0,
    flex: 1,
    paddingHorizontal: 4,
    paddingVertical: 5,
    borderRightWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: '#59616C',
    backgroundColor: '#181B1F',
  },
  emptyDayCell: {
    flex: 1,
    borderRightWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: '#353A42',
    backgroundColor: '#22262B',
  },
  dayNumber: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
    lineHeight: 18,
    fontVariant: ['tabular-nums'],
  },
  dayDetails: { minHeight: 31, flex: 1, justifyContent: 'flex-end', gap: 3 },
  holidayLabel: {
    color: '#FF899B',
    fontSize: 8,
    fontWeight: '700',
    lineHeight: 10,
  },
  emptyLabel: { height: 10 },
  shiftBadge: {
    minHeight: 18,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
    borderRadius: 5,
  },
  shiftLabel: { fontSize: 10, fontWeight: '800', lineHeight: 13 },
  busyCover: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    zIndex: 101,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    backgroundColor: 'rgba(16,18,20,0.94)',
  },
  busyCard: {
    minHeight: 64,
    minWidth: 220,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: '#353A42',
    borderRadius: 12,
    backgroundColor: '#181B1F',
  },
});
