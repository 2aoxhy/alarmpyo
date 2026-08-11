package expo.modules.alarmpyoalarm

import java.util.concurrent.TimeUnit

internal data class AlarmPyoAlarmSafetyTarget(
  val planKey: String,
  val planId: String,
  val alarmAt: Long,
  val checkAt: Long
)

internal object AlarmPyoAlarmSafetyPolicy {
  val CHECK_LEAD_MILLIS: Long = TimeUnit.HOURS.toMillis(10)
  val LATE_CHECK_DELAY_MILLIS: Long = TimeUnit.MINUTES.toMillis(1)

  const val ISSUE_EXACT_ALARM = "exact-alarm"
  const val ISSUE_FULL_SCREEN = "full-screen"
  const val ISSUE_NOTIFICATIONS = "notifications"
  const val ISSUE_DO_NOT_DISTURB = "do-not-disturb"
  const val ISSUE_BATTERY_OPTIMIZATION = "battery-optimization"
  const val ISSUE_ALARM_VOLUME = "alarm-volume"
  const val ISSUE_SCHEDULE = "schedule"
  const val ISSUE_STORAGE = "storage"

  fun target(
    plans: List<AlarmPyoAlarmPlan>,
    nowMillis: Long,
    lastCheckedPlanKey: String? = null
  ): AlarmPyoAlarmSafetyTarget? {
    val plan = plans.asSequence()
      .filter { candidate ->
        candidate.repeatStage == 0 &&
          candidate.shiftTypeId != "test" &&
          candidate.id == candidate.rootPlanId &&
          actualAlarmAt(candidate) > nowMillis
      }
      .minWithOrNull(
        compareBy<AlarmPyoAlarmPlan> { actualAlarmAt(it) }
          .thenBy(AlarmPyoAlarmPlan::id)
      ) ?: return null
    val alarmAt = actualAlarmAt(plan)
    val planKey = planKey(plan)
    if (planKey == lastCheckedPlanKey) return null
    val preferredCheckAt = alarmAt - CHECK_LEAD_MILLIS
    val checkAt = if (preferredCheckAt > nowMillis) {
      preferredCheckAt
    } else {
      // 이미 10시간 전 시각이 지났다면 알람보다 앞선 범위에서 최대 1분 안에 확인해요.
      nowMillis + minOf(
        LATE_CHECK_DELAY_MILLIS,
        ((alarmAt - nowMillis) / 2L).coerceAtLeast(1L)
      )
    }
    return AlarmPyoAlarmSafetyTarget(planKey, plan.id, alarmAt, checkAt)
  }

  fun issueCodes(
    exactAlarmAllowed: Boolean,
    fullScreenAllowed: Boolean,
    notificationsAllowed: Boolean,
    doNotDisturbMaySilenceAlarm: Boolean,
    batteryOptimizationIgnored: Boolean,
    alarmVolume: Int,
    scheduleSynchronized: Boolean,
    storageHealthy: Boolean
  ): List<String> = buildList {
    if (!exactAlarmAllowed) add(ISSUE_EXACT_ALARM)
    if (!fullScreenAllowed) add(ISSUE_FULL_SCREEN)
    if (!notificationsAllowed) add(ISSUE_NOTIFICATIONS)
    if (doNotDisturbMaySilenceAlarm) add(ISSUE_DO_NOT_DISTURB)
    if (!batteryOptimizationIgnored) add(ISSUE_BATTERY_OPTIMIZATION)
    if (alarmVolume <= 0) add(ISSUE_ALARM_VOLUME)
    if (!scheduleSynchronized) add(ISSUE_SCHEDULE)
    if (!storageHealthy) add(ISSUE_STORAGE)
  }.sorted()

  fun canReuseArmedCheck(
    armedPlanKey: String?,
    nextCheckAt: Long,
    target: AlarmPyoAlarmSafetyTarget,
    nowMillis: Long,
    force: Boolean = false
  ): Boolean = !force &&
    armedPlanKey == target.planKey &&
    nextCheckAt > nowMillis

  fun notificationKey(planKey: String, issueCodes: Collection<String>): String = listOf(
    planKey,
    issueCodes.toSortedSet().joinToString(",")
  ).joinToString("|")

  fun actualAlarmAt(plan: AlarmPyoAlarmPlan): Long =
    plan.originalAlarmAt.takeIf { it > 0L } ?: plan.alarmAt

  fun planKey(plan: AlarmPyoAlarmPlan): String =
    "${plan.rootPlanId.ifBlank { plan.id }}@${actualAlarmAt(plan)}"
}
