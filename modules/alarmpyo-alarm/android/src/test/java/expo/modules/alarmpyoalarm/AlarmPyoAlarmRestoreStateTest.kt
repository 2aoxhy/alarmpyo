package expo.modules.alarmpyoalarm

import java.util.concurrent.TimeUnit
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class AlarmPyoAlarmRestoreStateTest {
  private val initial = AlarmPyoAlarmRestoreState(
    workAlarmPending = true,
    recalculateLocalTimes = true,
    attemptCount = 0,
    lastAttemptAt = 0L,
    completedAt = 0L,
    retryAt = 0L,
    expectedCount = 0,
    scheduledCount = 0
  )

  @Test
  fun `completed marker is written after work alarms restore`() {
    val next = AlarmPyoAlarmRestoreStateStore.afterAttempt(
      initial,
      result = AlarmPyoAlarmRestoreResult(expectedCount = 3, scheduledCount = 3),
      nowMillis = 1_000L
    )

    assertFalse(next.hasPendingWork)
    assertEquals(1_000L, next.completedAt)
    assertEquals(0L, next.retryAt)
    assertEquals(3, next.expectedCount)
    assertEquals(3, next.scheduledCount)
  }

  @Test
  fun `failed work alarm restore remains pending for retry`() {
    val next = AlarmPyoAlarmRestoreStateStore.afterAttempt(
      initial,
      result = null,
      nowMillis = 1_000L
    )

    assertTrue(next.workAlarmPending)
    assertEquals(1_000L + TimeUnit.MINUTES.toMillis(1), next.retryAt)
  }

  @Test
  fun `partial work alarm restore remains pending for retry`() {
    val next = AlarmPyoAlarmRestoreStateStore.afterAttempt(
      initial,
      result = AlarmPyoAlarmRestoreResult(expectedCount = 3, scheduledCount = 2),
      nowMillis = 1_000L
    )

    assertTrue(next.workAlarmPending)
    assertEquals(0L, next.completedAt)
    assertEquals(3, next.expectedCount)
    assertEquals(2, next.scheduledCount)
    assertEquals(1_000L + TimeUnit.MINUTES.toMillis(1), next.retryAt)
  }

  @Test
  fun `empty restore is complete when no alarms are expected`() {
    val result = AlarmPyoAlarmRestoreResult(expectedCount = 0, scheduledCount = 0)
    val next = AlarmPyoAlarmRestoreStateStore.afterAttempt(
      initial,
      result = result,
      nowMillis = 1_000L
    )

    assertTrue(result.completed)
    assertFalse(next.hasPendingWork)
  }

  @Test
  fun `corrupt empty restore remains incomplete instead of reporting zero of zero success`() {
    val result = AlarmPyoAlarmRestoreResult(
      expectedCount = 0,
      scheduledCount = 0,
      completed = false
    )
    val next = AlarmPyoAlarmRestoreStateStore.afterAttempt(
      initial,
      result = result,
      nowMillis = 1_000L
    )

    assertFalse(result.completed)
    assertTrue(next.hasPendingWork)
    assertFalse(next.lastAttemptCompleted)
  }

  @Test
  fun `automatic restore retry is bounded`() {
    assertTrue(AlarmPyoAlarmRestoreStateStore.shouldScheduleRetry(1))
    assertTrue(AlarmPyoAlarmRestoreStateStore.shouldScheduleRetry(6))
    assertFalse(AlarmPyoAlarmRestoreStateStore.shouldScheduleRetry(7))
    assertEquals(
      TimeUnit.HOURS.toMillis(6),
      AlarmPyoAlarmRestoreStateStore.retryDelayForAttempt(99)
    )
  }

  @Test
  fun `missing permissions stop automatic wakeup retries`() {
    val next = AlarmPyoAlarmRestoreStateStore.afterAttempt(
      initial,
      result = AlarmPyoAlarmRestoreResult(expectedCount = 3, scheduledCount = 0),
      nowMillis = 1_000L,
      retryAllowed = false
    )

    assertFalse(next.hasPendingWork)
    assertEquals(0L, next.completedAt)
    assertEquals(0L, next.retryAt)
    assertEquals(1, next.attemptCount)
    assertEquals(3, next.expectedCount)
    assertEquals(0, next.scheduledCount)
  }

  @Test
  fun `independent sleep failure keeps the restore journal pending`() {
    val state = initial.copy(
      sleepReminderPending = true,
      watchdogAt = 500L,
      journalId = 7L
    )

    val next = AlarmPyoAlarmRestoreStateStore.afterAttempt(
      state,
      result = AlarmPyoAlarmRestoreResult(expectedCount = 3, scheduledCount = 3),
      nowMillis = 1_000L,
      sleepRemindersCompleted = false
    )

    assertFalse(next.workAlarmPending)
    assertTrue(next.sleepReminderPending)
    assertTrue(next.hasPendingWork)
    assertEquals(0L, next.watchdogAt)
    assertEquals(7L, next.journalId)
    assertEquals(1_000L + TimeUnit.MINUTES.toMillis(1), next.retryAt)
  }

  @Test
  fun `isolated subtask successes clear the watchdog and pending journal`() {
    val state = initial.copy(
      sleepReminderPending = true,
      widgetPending = true,
      watchdogAt = 500L
    )

    val next = AlarmPyoAlarmRestoreStateStore.afterAttempt(
      state,
      result = AlarmPyoAlarmRestoreResult(expectedCount = 3, scheduledCount = 3),
      nowMillis = 1_000L,
      sleepRemindersCompleted = true,
      widgetCompleted = true
    )

    assertFalse(next.hasPendingWork)
    assertEquals(0L, next.watchdogAt)
    assertEquals(0L, next.retryAt)
  }

  @Test
  fun `new system event merges pending targets and keeps earliest retry`() {
    val previous = initial.copy(
      workAlarmPending = false,
      sleepReminderPending = true,
      quickTimerPending = true,
      attemptCount = 2,
      retryAt = 1_500L,
      watchdogAt = 1_800L,
      journalId = 8L
    )

    val merged = AlarmPyoAlarmRestoreTransactionPolicy.mergeTargets(
      previous = previous,
      recalculateLocalTimes = true,
      workAlarmPending = true,
      sleepReminderPending = false,
      widgetPending = true,
      quickTimerPending = false,
      nowMillis = 1_000L,
      watchdogAt = 2_000L,
      journalId = 9L
    )

    assertTrue(merged.workAlarmPending)
    assertTrue(merged.sleepReminderPending)
    assertTrue(merged.quickTimerPending)
    assertTrue(merged.widgetPending)
    assertTrue(merged.recalculateLocalTimes)
    assertEquals(2, merged.attemptCount)
    assertEquals(1_500L, merged.retryAt)
    assertEquals(1_800L, merged.watchdogAt)
    assertEquals(9L, merged.journalId)
  }
}
