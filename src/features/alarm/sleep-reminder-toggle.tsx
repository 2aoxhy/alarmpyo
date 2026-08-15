import { ToggleRow } from '@/design-system';

type SleepReminderToggleProps = {
  disabled?: boolean;
  onValueChange: (enabled: boolean) => void;
  value: boolean;
};

export function SleepReminderToggle({
  disabled = false,
  onValueChange,
  value,
}: SleepReminderToggleProps) {
  return (
    <ToggleRow
      disabled={disabled}
      icon="shift-night"
      onValueChange={onValueChange}
      subtitle="참고 취침 시각에 일반 알림으로 알립니다."
      testID="sleep-reminder-enabled-toggle"
      title="수면 시작 알림"
      value={value}
    />
  );
}
