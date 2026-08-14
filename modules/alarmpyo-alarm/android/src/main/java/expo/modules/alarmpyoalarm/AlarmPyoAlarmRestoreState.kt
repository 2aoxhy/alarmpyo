package expo.modules.alarmpyoalarm

import android.content.Context
import android.os.Build
import java.util.concurrent.TimeUnit

internal data class AlarmPyoAlarmRestoreState(
  val workAlarmPending: Boolean,
  val recalculateLocalTimes: Boolean,
  val attemptCount: Int,
  val lastAttemptAt: Long,
  val completedAt: Long,
  val retryAt: Long,
  val expectedCount: Int,
  val scheduledCount: Int,
  val lastAttemptCompleted: Boolean = false,
  val sleepReminderPending: Boolean = false,
  val widgetPending: Boolean = false,
  val quickTimerPending: Boolean = false,
  val watchdogAt: Long = 0L,
  val workAttempted: Boolean = false,
  val journalId: Long = 0L
) {
  val hasPendingWork: Boolean
    get() = workAlarmPending || sleepReminderPending || widgetPending || quickTimerPending
}

internal data class AlarmPyoAlarmRestoreResult(
  val expectedCount: Int,
  val scheduledCount: Int,
  val completed: Boolean = expectedCount == scheduledCount
) {
  init {
    require(expectedCount >= 0) { "복원 예정 알람 수는 0개 이상이어야 해요." }
    require(scheduledCount >= 0) { "실제 예약 알람 수는 0개 이상이어야 해요." }
    require(scheduledCount <= expectedCount) {
      "실제 예약 알람 수는 복원 예정 알람 수보다 많을 수 없어요."
    }
  }

  fun toMap(): Map<String, Any> = mapOf(
    "expectedCount" to expectedCount,
    "scheduledCount" to scheduledCount,
    "completed" to completed
  )
}

internal object AlarmPyoQuickTimerRestoreJournalPolicy {
  fun markPending(
    previous: AlarmPyoAlarmRestoreState?,
    nowMillis: Long
  ): AlarmPyoAlarmRestoreState {
    if (previous?.quickTimerPending == true) return previous
    val base = previous ?: AlarmPyoAlarmRestoreState(
      workAlarmPending = false,
      recalculateLocalTimes = false,
      attemptCount = 0,
      lastAttemptAt = 0L,
      completedAt = 0L,
      retryAt = 0L,
      expectedCount = 0,
      scheduledCount = 0
    )
    val timerRetryAt = nowMillis + AlarmPyoAlarmRestoreStateStore.retryDelayForAttempt(
      base.attemptCount + 1
    )
    val existingWakeup = listOf(base.retryAt, base.watchdogAt)
      .filter { it > nowMillis }
      .minOrNull()
    return base.copy(
      quickTimerPending = true,
      retryAt = minOf(existingWakeup ?: timerRetryAt, timerRetryAt),
      journalId = maxOf(nowMillis, base.journalId + 1L)
    )
  }

  fun markCompleted(
    previous: AlarmPyoAlarmRestoreState?,
    nowMillis: Long
  ): AlarmPyoAlarmRestoreState? {
    if (previous?.quickTimerPending != true) return previous
    val hasOtherPending = previous.workAlarmPending ||
      previous.sleepReminderPending || previous.widgetPending
    return previous.copy(
      quickTimerPending = false,
      retryAt = if (hasOtherPending) previous.retryAt else 0L,
      watchdogAt = if (hasOtherPending) previous.watchdogAt else 0L,
      journalId = maxOf(nowMillis, previous.journalId + 1L)
    )
  }
}

internal object AlarmPyoAlarmRestoreStateStore {
  private const val PREFERENCES_NAME = "alarmpyo-alarm-restore-v1"
  private const val KEY_WORK_PENDING = "work-pending"
  private const val KEY_RECALCULATE_LOCAL_TIMES = "recalculate-local-times"
  private const val KEY_ATTEMPT_COUNT = "attempt-count"
  private const val KEY_LAST_ATTEMPT_AT = "last-attempt-at"
  private const val KEY_COMPLETED_AT = "completed-at"
  private const val KEY_RETRY_AT = "retry-at"
  private const val KEY_EXPECTED_COUNT = "expected-count"
  private const val KEY_SCHEDULED_COUNT = "scheduled-count"
  private const val KEY_LAST_ATTEMPT_COMPLETED = "last-attempt-completed"
  private const val KEY_SLEEP_REMINDER_PENDING = "sleep-reminder-pending"
  private const val KEY_WIDGET_PENDING = "widget-pending"
  private const val KEY_QUICK_TIMER_PENDING = "quick-timer-pending"
  private const val KEY_WATCHDOG_AT = "watchdog-at"
  private const val KEY_WORK_ATTEMPTED = "work-attempted"
  private const val KEY_JOURNAL_ID = "journal-id"
  private const val MAX_AUTOMATIC_RETRIES = 6
  private val RETRY_DELAYS_MILLIS = longArrayOf(
    TimeUnit.MINUTES.toMillis(1),
    TimeUnit.MINUTES.toMillis(5),
    TimeUnit.MINUTES.toMillis(15),
    TimeUnit.HOURS.toMillis(1),
    TimeUnit.HOURS.toMillis(3),
    TimeUnit.HOURS.toMillis(6)
  )

  fun begin(
    context: Context,
    recalculateLocalTimes: Boolean,
    workAlarmPending: Boolean = true,
    sleepReminderPending: Boolean = false,
    widgetPending: Boolean = false,
    quickTimerPending: Boolean = false,
    watchdogAt: Long = 0L,
    journalId: Long = 0L
  ): AlarmPyoAlarmRestoreState = AlarmPyoAlarmRestoreState(
    workAlarmPending = workAlarmPending,
    recalculateLocalTimes = recalculateLocalTimes,
    attemptCount = 0,
    lastAttemptAt = 0L,
    completedAt = 0L,
    retryAt = 0L,
    expectedCount = 0,
    scheduledCount = 0,
    lastAttemptCompleted = false,
    sleepReminderPending = sleepReminderPending,
    widgetPending = widgetPending,
    quickTimerPending = quickTimerPending,
    watchdogAt = watchdogAt,
    workAttempted = false,
    journalId = journalId
  ).also { write(context, it) }

  fun read(context: Context): AlarmPyoAlarmRestoreState? {
    val values = preferences(context)
    if (!values.contains(KEY_WORK_PENDING)) return null
    return AlarmPyoAlarmRestoreState(
      workAlarmPending = values.getBoolean(KEY_WORK_PENDING, false),
      recalculateLocalTimes = values.getBoolean(KEY_RECALCULATE_LOCAL_TIMES, false),
      attemptCount = values.getInt(KEY_ATTEMPT_COUNT, 0).coerceAtLeast(0),
      lastAttemptAt = values.getLong(KEY_LAST_ATTEMPT_AT, 0L).coerceAtLeast(0L),
      completedAt = values.getLong(KEY_COMPLETED_AT, 0L).coerceAtLeast(0L),
      retryAt = values.getLong(KEY_RETRY_AT, 0L).coerceAtLeast(0L),
      expectedCount = values.getInt(KEY_EXPECTED_COUNT, 0).coerceAtLeast(0),
      scheduledCount = values.getInt(KEY_SCHEDULED_COUNT, 0).coerceAtLeast(0),
      lastAttemptCompleted = if (values.contains(KEY_LAST_ATTEMPT_COMPLETED)) {
        values.getBoolean(KEY_LAST_ATTEMPT_COMPLETED, false)
      } else {
        !values.getBoolean(KEY_WORK_PENDING, false) &&
          values.getInt(KEY_EXPECTED_COUNT, 0) == values.getInt(KEY_SCHEDULED_COUNT, 0)
      },
      sleepReminderPending = values.getBoolean(KEY_SLEEP_REMINDER_PENDING, false),
      widgetPending = values.getBoolean(KEY_WIDGET_PENDING, false),
      quickTimerPending = values.getBoolean(KEY_QUICK_TIMER_PENDING, false),
      watchdogAt = values.getLong(KEY_WATCHDOG_AT, 0L).coerceAtLeast(0L),
      workAttempted = if (values.contains(KEY_WORK_ATTEMPTED)) {
        values.getBoolean(KEY_WORK_ATTEMPTED, false)
      } else {
        values.getLong(KEY_LAST_ATTEMPT_AT, 0L) > 0L
      },
      journalId = values.getLong(KEY_JOURNAL_ID, 0L).coerceAtLeast(0L)
    )
  }

  fun write(context: Context, state: AlarmPyoAlarmRestoreState) {
    check(
      preferences(context).edit()
        .putBoolean(KEY_WORK_PENDING, state.workAlarmPending)
        .putBoolean(KEY_RECALCULATE_LOCAL_TIMES, state.recalculateLocalTimes)
        .putInt(KEY_ATTEMPT_COUNT, state.attemptCount)
        .putLong(KEY_LAST_ATTEMPT_AT, state.lastAttemptAt)
        .putLong(KEY_COMPLETED_AT, state.completedAt)
        .putLong(KEY_RETRY_AT, state.retryAt)
        .putInt(KEY_EXPECTED_COUNT, state.expectedCount)
        .putInt(KEY_SCHEDULED_COUNT, state.scheduledCount)
        .putBoolean(KEY_LAST_ATTEMPT_COMPLETED, state.lastAttemptCompleted)
        .putBoolean(KEY_SLEEP_REMINDER_PENDING, state.sleepReminderPending)
        .putBoolean(KEY_WIDGET_PENDING, state.widgetPending)
        .putBoolean(KEY_QUICK_TIMER_PENDING, state.quickTimerPending)
        .putLong(KEY_WATCHDOG_AT, state.watchdogAt)
        .putBoolean(KEY_WORK_ATTEMPTED, state.workAttempted)
        .putLong(KEY_JOURNAL_ID, state.journalId)
        .commit()
    ) { "알람 복원 상태를 저장하지 못했어요." }
  }

  internal fun afterAttempt(
    previous: AlarmPyoAlarmRestoreState,
    result: AlarmPyoAlarmRestoreResult?,
    nowMillis: Long,
    retryAllowed: Boolean = true,
    sleepRemindersCompleted: Boolean = true,
    widgetCompleted: Boolean = true,
    quickTimerCompleted: Boolean = true
  ): AlarmPyoAlarmRestoreState {
    val workWasPending = previous.workAlarmPending
    val workCompleted = !workWasPending || result?.completed == true
    val workPending = previous.workAlarmPending && !workCompleted && retryAllowed
    val sleepPending = previous.sleepReminderPending && !sleepRemindersCompleted
    val pendingWidget = previous.widgetPending && !widgetCompleted
    val timerPending = previous.quickTimerPending && !quickTimerCompleted
    val anyPending = workPending || sleepPending || pendingWidget || timerPending
    val attemptCount = previous.attemptCount + 1
    return previous.copy(
      workAlarmPending = workPending,
      sleepReminderPending = sleepPending,
      widgetPending = pendingWidget,
      quickTimerPending = timerPending,
      attemptCount = attemptCount,
      lastAttemptAt = nowMillis,
      completedAt = if (workWasPending && workCompleted) nowMillis else previous.completedAt,
      retryAt = if (anyPending && shouldScheduleRetry(attemptCount)) {
        nowMillis + retryDelayForAttempt(attemptCount)
      } else {
        0L
      },
      expectedCount = result?.expectedCount ?: previous.expectedCount,
      scheduledCount = result?.scheduledCount ?: previous.scheduledCount,
      lastAttemptCompleted = if (workWasPending) workCompleted else previous.lastAttemptCompleted,
      watchdogAt = 0L,
      workAttempted = previous.workAttempted || workWasPending
    )
  }

  fun lastResult(context: Context): AlarmPyoAlarmRestoreResult? {
    val state = read(context) ?: return null
    if (state.lastAttemptAt <= 0L || !state.workAttempted) return null
    val expectedCount = state.expectedCount
    val scheduledCount = state.scheduledCount.coerceAtMost(expectedCount)
    return AlarmPyoAlarmRestoreResult(
      expectedCount = expectedCount,
      scheduledCount = scheduledCount,
      completed = state.lastAttemptCompleted
    )
  }

  internal fun shouldScheduleRetry(attemptCount: Int): Boolean =
    attemptCount in 1..MAX_AUTOMATIC_RETRIES

  internal fun retryDelayForAttempt(attemptCount: Int): Long =
    RETRY_DELAYS_MILLIS[(attemptCount.coerceAtLeast(1) - 1)
      .coerceAtMost(RETRY_DELAYS_MILLIS.lastIndex)]

  private fun preferences(context: Context) =
    (if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
      context.createDeviceProtectedStorageContext()
    } else {
      context
    }).getSharedPreferences(PREFERENCES_NAME, Context.MODE_PRIVATE)
}
