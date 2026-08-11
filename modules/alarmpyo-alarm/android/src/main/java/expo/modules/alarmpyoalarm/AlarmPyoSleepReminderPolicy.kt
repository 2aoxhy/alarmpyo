package expo.modules.alarmpyoalarm

import java.util.Calendar
import java.util.GregorianCalendar
import java.util.Locale
import java.util.TimeZone

internal data class AlarmPyoSleepReminderLocalTime(
  val dateKey: String,
  val minutes: Int
)

internal object AlarmPyoSleepReminderPolicy {
  private val DATE_PATTERN = Regex("^(\\d{4})-(\\d{2})-(\\d{2})$")

  fun normalize(plans: List<AlarmPyoSleepReminderPlan>): List<AlarmPyoSleepReminderPlan> = plans
    .distinctBy(AlarmPyoSleepReminderPlan::id)
    .sortedWith(compareBy(AlarmPyoSleepReminderPlan::reminderAt).thenBy(AlarmPyoSleepReminderPlan::id))

  fun active(plans: List<AlarmPyoSleepReminderPlan>, nowMillis: Long): List<AlarmPyoSleepReminderPlan> =
    normalize(plans).filter { it.reminderAt > nowMillis }

  fun scheduled(plans: List<AlarmPyoSleepReminderPlan>, nowMillis: Long): List<AlarmPyoSleepReminderPlan> =
    active(plans, nowMillis).take(MAX_SCHEDULED_SLEEP_REMINDERS)

  /**
   * 앱 복귀 때 같은 14일 계획을 다시 전달해도 이미 준비된 가까운 알림을
   * AlarmManager에 반복 등록하지 않게 해요. 저장 계획뿐 아니라 실제 예약을
   * 대표하는 scheduledIds까지 모두 일치할 때만 안전하게 재사용해요.
   */
  fun canReuseScheduledSnapshot(
    snapshot: AlarmPyoSleepReminderSnapshot,
    plans: List<AlarmPyoSleepReminderPlan>,
    nowMillis: Long
  ): Boolean {
    val activePlans = active(plans, nowMillis)
    val desiredIds = scheduled(activePlans, nowMillis)
      .mapTo(linkedSetOf(), AlarmPyoSleepReminderPlan::id)
    return snapshot.plans == activePlans && snapshot.scheduledIds == desiredIds
  }

  fun consume(
    plans: List<AlarmPyoSleepReminderPlan>,
    id: String,
    reminderAt: Long,
    nowMillis: Long
  ): Pair<AlarmPyoSleepReminderPlan?, List<AlarmPyoSleepReminderPlan>> {
    val matched = plans.firstOrNull { it.id == id && it.reminderAt == reminderAt }
    val remaining = plans.filterNot { it.id == id && it.reminderAt == reminderAt }
      .filter { it.reminderAt > nowMillis }
    return matched to normalize(remaining)
  }

  fun captureLocalTime(
    timestamp: Long,
    timeZone: TimeZone = TimeZone.getDefault()
  ): AlarmPyoSleepReminderLocalTime {
    val calendar = GregorianCalendar(timeZone).apply { timeInMillis = timestamp }
    return AlarmPyoSleepReminderLocalTime(
      dateKey = String.format(
        Locale.ROOT,
        "%04d-%02d-%02d",
        calendar.get(Calendar.YEAR),
        calendar.get(Calendar.MONTH) + 1,
        calendar.get(Calendar.DAY_OF_MONTH)
      ),
      minutes = calendar.get(Calendar.HOUR_OF_DAY) * 60 + calendar.get(Calendar.MINUTE)
    )
  }

  fun recalculateReminderAt(
    plan: AlarmPyoSleepReminderPlan,
    timeZone: TimeZone = TimeZone.getDefault()
  ): Long? {
    val match = DATE_PATTERN.matchEntire(plan.localDateKey) ?: return null
    if (plan.localMinutes !in 0..1439) return null
    val year = match.groupValues[1].toIntOrNull() ?: return null
    val month = match.groupValues[2].toIntOrNull() ?: return null
    val day = match.groupValues[3].toIntOrNull() ?: return null
    runCatching {
      GregorianCalendar(timeZone).apply {
        isLenient = false
        clear()
        set(year, month - 1, day, 12, 0, 0)
        timeInMillis
      }
    }.getOrNull() ?: return null
    return GregorianCalendar(timeZone).apply {
      isLenient = true
      clear()
      set(
        year,
        month - 1,
        day,
        plan.localMinutes / 60,
        plan.localMinutes % 60,
        0
      )
      set(Calendar.MILLISECOND, 0)
    }.timeInMillis
  }
}
