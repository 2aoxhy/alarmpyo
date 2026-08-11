import { StyleSheet, View } from 'react-native';

import { AppButton, AppText } from '@/components/ui-kit';
import { spacing } from '@/constants/app-theme';

type Props = {
  onCancelSelection: () => void;
  onGoToday: () => void;
  onStartSelection: () => void;
  selectionMode: boolean;
};

export function CalendarScreenHeader({
  onCancelSelection,
  onGoToday,
  onStartSelection,
  selectionMode,
}: Props) {
  return (
    <View style={styles.header}>
      <AppText accessibilityRole="header" variant="title">
        달력
      </AppText>
      <View style={styles.actions}>
        <AppButton
          accessibilityHint={
            selectionMode
              ? '선택한 날짜를 모두 해제하고 일반 달력으로 돌아가요.'
              : '날짜를 누르거나 손가락을 끌어 여러 일정을 선택해요.'
          }
          accessibilityLabel={selectionMode ? '일정 선택 취소하기' : '일정 선택 시작하기'}
          icon={selectionMode ? 'close' : 'checkmark-circle'}
          label={selectionMode ? '선택 취소하기' : '일정 선택하기'}
          onPress={selectionMode ? onCancelSelection : onStartSelection}
          size="compact"
          variant="secondary"
        />
        <AppButton
          accessibilityHint="오늘이 있는 달로 이동해요."
          accessibilityLabel="오늘 날짜로 이동하기"
          icon="today-outline"
          label="오늘로 이동하기"
          onPress={onGoToday}
          size="compact"
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
    flexWrap: 'wrap',
    rowGap: spacing.small,
    gap: spacing.medium,
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    flexShrink: 1,
    justifyContent: 'flex-end',
    gap: spacing.small,
  },
});
