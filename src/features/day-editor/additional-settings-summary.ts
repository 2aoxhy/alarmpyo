export type AdditionalSettingsSummaryInput = {
  exceptionLabel?: string | null;
  hasAlarmOverride?: boolean;
  hasTimeOverride: boolean;
  hasNote: boolean;
};

export type InitialAdditionalSettingsInput = {
  hasAlarmOverride?: boolean;
  hasException: boolean;
  hasTimeOverride: boolean;
  note: string;
};

const DEFAULT_SUMMARY = '특별 일정, 근무 시간, 알람과 메모를 설정해요.';

export function buildAdditionalSettingsSummary({
  exceptionLabel,
  hasAlarmOverride = false,
  hasTimeOverride,
  hasNote,
}: AdditionalSettingsSummaryInput) {
  const activeSettings = [
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
}: InitialAdditionalSettingsInput) {
  return hasException || hasTimeOverride || hasAlarmOverride || note.trim().length > 0;
}
