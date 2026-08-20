import { StyleSheet, useWindowDimensions, View } from 'react-native';

import { AppButton, AppText } from '@/components/ui-kit';
import { spacing } from '@/constants/app-theme';

type Props = {
  onGoToday: () => void;
  onStartSelection: () => void;
  selectionMode: boolean;
  supportsDragSelection: boolean;
};

export function CalendarScreenHeader({
  onGoToday,
  onStartSelection,
  selectionMode,
  supportsDragSelection,
}: Props) {
  const { fontScale } = useWindowDimensions();
  const stackHeader = fontScale >= 1.4;

  return (
    <View style={[styles.header, stackHeader && styles.headerStacked]}>
      <AppText accessibilityRole="header" variant="title">
        달력
      </AppText>
      <View style={[styles.actions, stackHeader && styles.actionsStacked]}>
        {!selectionMode ? (
          <AppButton
            accessibilityHint={
              supportsDragSelection
                ? '날짜를 누르거나 손가락을 끌어 여러 일정을 선택합니다.'
                : '날짜를 하나씩 눌러 여러 일정을 선택합니다.'
            }
            accessibilityLabel="여러 날짜 선택 시작하기"
            icon="checkmark-circle"
            label="선택"
            onPress={onStartSelection}
            size="compact"
            style={stackHeader && styles.actionStacked}
            variant="secondary"
          />
        ) : null}
        <AppButton
          accessibilityHint="오늘이 있는 달로 이동합니다."
          accessibilityLabel="오늘 날짜로 이동하기"
          icon="today-outline"
          label="오늘"
          onPress={onGoToday}
          size="compact"
          style={stackHeader && styles.actionStacked}
          variant="secondary"
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    minHeight: 46,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'nowrap',
    rowGap: spacing.small,
    gap: spacing.medium,
  },
  headerStacked: {
    alignItems: 'stretch',
    flexWrap: 'wrap',
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'nowrap',
    flexShrink: 1,
    justifyContent: 'flex-end',
    gap: spacing.small,
  },
  actionsStacked: {
    width: '100%',
    flexWrap: 'nowrap',
    justifyContent: 'flex-start',
  },
  actionStacked: {
    minHeight: 48,
    flex: 1,
  },
});
