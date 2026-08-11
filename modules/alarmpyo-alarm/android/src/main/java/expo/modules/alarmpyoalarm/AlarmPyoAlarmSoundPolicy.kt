package expo.modules.alarmpyoalarm

internal object AlarmPyoAlarmSoundPolicy {
  fun candidateValues(
    selected: String?,
    defaultAlarm: String?,
    defaultRingtone: String?,
    defaultNotification: String?
  ): List<String> = listOfNotNull(
    selected?.takeIf(String::isNotBlank),
    defaultAlarm?.takeIf(String::isNotBlank),
    defaultRingtone?.takeIf(String::isNotBlank),
    defaultNotification?.takeIf(String::isNotBlank)
  ).distinct()
}
