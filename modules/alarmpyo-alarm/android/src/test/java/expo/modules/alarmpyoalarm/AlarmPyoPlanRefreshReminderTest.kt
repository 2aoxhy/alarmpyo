package expo.modules.alarmpyoalarm

import java.util.concurrent.TimeUnit
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class AlarmPyoPlanRefreshReminderTest {
  private val now = 1_800_000_000_000L

  @Test
  fun `plans spanning ninety days request one reminder fourteen days before expiry`() {
    val first = plan("first", now + TimeUnit.DAYS.toMillis(1))
    val last = plan("last", now + TimeUnit.DAYS.toMillis(90))

    val coverage = AlarmPyoPlanRefreshReminder.calculateCoverage(listOf(last, first), now)

    requireNotNull(coverage)
    assertEquals(last.alarmAt, coverage.plannedThroughAt)
    assertEquals(
      last.alarmAt - AlarmPyoPlanRefreshReminder.REFRESH_LEAD_MILLIS,
      coverage.refreshRecommendedAt
    )
    assertTrue(coverage.refreshReminderPending)
  }

  @Test
  fun `metadata keeps a 366 day safety boundary with a 90 day refresh recommendation`() {
    val first = plan("first", now + TimeUnit.DAYS.toMillis(1))
    val last = plan("last", now + TimeUnit.DAYS.toMillis(365))
    val metadata = AlarmPyoAlarmSyncMetadata(
      generatedAt = now,
      refreshRecommendedAt = now + TimeUnit.DAYS.toMillis(90),
      safetyThroughAt = now + TimeUnit.DAYS.toMillis(366)
    )

    val coverage = AlarmPyoPlanRefreshReminder.calculateCoverage(
      listOf(first, last),
      now,
      metadata
    )

    requireNotNull(coverage)
    assertEquals(metadata.generatedAt, coverage.generatedAt)
    assertEquals(metadata.refreshRecommendedAt, coverage.refreshRecommendedAt)
    assertEquals(metadata.safetyThroughAt, coverage.plannedThroughAt)
  }

  @Test
  fun `short schedules do not create unnecessary refresh reminders`() {
    val first = plan("first", now + TimeUnit.DAYS.toMillis(1))
    val last = plan("last", now + TimeUnit.DAYS.toMillis(20))

    assertNull(AlarmPyoPlanRefreshReminder.calculateCoverage(listOf(first, last), now))
  }

  @Test
  fun `expired plans are ignored when calculating coverage`() {
    val expired = plan("expired", now - 1L)
    val future = plan("future", now + TimeUnit.DAYS.toMillis(90))

    assertNull(AlarmPyoPlanRefreshReminder.calculateCoverage(listOf(expired, future), now))
  }

  @Test
  fun `refresh reminder completes only after the notification is posted`() {
    assertTrue(
      AlarmPyoPlanRefreshReminder.shouldCompleteReminder(AlarmPyoNotificationPostResult.POSTED)
    )
    assertEquals(
      false,
      AlarmPyoPlanRefreshReminder.shouldCompleteReminder(AlarmPyoNotificationPostResult.BLOCKED)
    )
    assertEquals(
      false,
      AlarmPyoPlanRefreshReminder.shouldCompleteReminder(AlarmPyoNotificationPostResult.FAILED)
    )
  }

  @Test
  fun `blocked refresh notification is checked at most once per day`() {
    val coverage = AlarmPyoAlarmPlanCoverage(
      plannedThroughAt = now + TimeUnit.DAYS.toMillis(20),
      refreshRecommendedAt = now - 1L,
      refreshReminderPending = true
    )

    assertEquals(
      now + AlarmPyoPlanRefreshReminder.BLOCKED_RECHECK_DELAY_MILLIS,
      AlarmPyoPlanRefreshReminder.nextTriggerAt(
        coverage = coverage,
        nowMillis = now,
        lastBlockedAttemptAt = now
      )
    )
  }

  private fun plan(id: String, alarmAt: Long) = AlarmPyoAlarmPlan(
    id = id,
    dateKey = "2027-01-01",
    shiftTypeId = "day",
    shiftName = "주간",
    alarmAt = alarmAt,
    originalAlarmAt = alarmAt,
    startMinutes = 7 * 60,
    alarmMinutesBefore = 2 * 60
  )
}
