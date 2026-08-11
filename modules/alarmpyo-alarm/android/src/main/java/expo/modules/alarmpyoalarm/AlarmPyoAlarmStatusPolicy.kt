package expo.modules.alarmpyoalarm

internal object AlarmPyoAlarmStatusPolicy {
  fun triggerState(
    exactAlarmAllowed: Boolean,
    notificationsAllowed: Boolean,
    fullScreenAllowed: Boolean,
    scheduledCount: Int
  ): String = when {
    !exactAlarmAllowed -> "exact-alarm-required"
    scheduledCount <= 0 -> "not-scheduled"
    !notificationsAllowed || !fullScreenAllowed -> "delivery-blocked"
    else -> "scheduled"
  }

  fun enabled(
    exactAlarmAllowed: Boolean,
    notificationsAllowed: Boolean,
    fullScreenAllowed: Boolean,
    scheduledCount: Int
  ): Boolean = triggerState(
    exactAlarmAllowed,
    notificationsAllowed,
    fullScreenAllowed,
    scheduledCount
  ) == "scheduled"
}
