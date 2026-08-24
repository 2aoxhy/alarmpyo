export type AdditionalSettingsSummaryInput = {
  exceptionLabel?: string | null;
  hasAlarmOverride?: boolean;
  hasTimeOverride: boolean;
  hasNote: boolean;
  scheduleHidden?: boolean;
};

export type InitialAdditionalSettingsInput = {
  hasAlarmOverride?: boolean;
  hasException: boolean;
  hasTimeOverride: boolean;
  note: string;
  scheduleHidden?: boolean;
};

const DEFAULT_SUMMARY = '표시 · 특별 일정 · 시간 · 알람 · 메모';

export function buildAdditionalSettingsSummary({
  exceptionLabel,
  hasAlarmOverride = false,
  hasTimeOverride,
  hasNote,
  scheduleHidden = false,
}: AdditionalSettingsSummaryInput) {
  const activeSettings = [
    scheduleHidden ? '표시 안 함' : null,
    exceptionLabel,
    hasTimeOverride ? '시간 변경' : null,
    hasAlarmOverride ? '알람 변경' : null,
    hasNote ? '메모 있음' : null,
  ].filter((value): value is string => Boolean(value));

  return activeSettings.length > 0
    ? activeSettings.join(' · ')
    : DEFAULT_SUMMARY;
}

export function shouldExpandAdditionalSettings({
  hasAlarmOverride = false,
  hasException,
  hasTimeOverride,
  note,
  scheduleHidden = false,
}: InitialAdditionalSettingsInput) {
  return (
    scheduleHidden ||
    hasException ||
    hasTimeOverride ||
    hasAlarmOverride ||
    note.trim().length > 0
  );
}
