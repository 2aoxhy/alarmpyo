package expo.modules.alarmpyoalarm

import android.content.Intent
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.util.Calendar
import java.util.GregorianCalendar
import java.util.TimeZone

class AlarmPyoSleepReminderPolicyTest {
  @Test
  fun `plans are sorted and only the nearest three are scheduled`() {
    val plans = listOf(
      plan("four", 4_000L),
      plan("two", 2_000L),
      plan("one", 1_000L),
      plan("three", 3_000L)
    )

    assertEquals(
      listOf("one", "two", "three"),
      AlarmPyoSleepReminderPolicy.scheduled(plans, nowMillis = 500L).map { it.id }
    )
  }

  @Test
  fun `multiple reminders per day fit in the fourteen day snapshot`() {
    val plans = (1L..16L).map { plan("plan-$it", it * 1_000L) }
    val snapshot = AlarmPyoSleepReminderSnapshot(plans, emptySet())

    assertEquals(
      16,
      AlarmPyoSleepReminderSnapshotCodec.decode(
        AlarmPyoSleepReminderSnapshotCodec.encode(snapshot)
      )?.plans?.size
    )
    assertEquals(14, SLEEP_REMINDER_PLAN_HORIZON_DAYS)
    assertTrue(MAX_STORED_SLEEP_REMINDERS >= 16)
  }

  @Test
  fun `consuming one plan exposes the next stored plan for refill`() {
    val plans = (1L..4L).map { plan("plan-$it", it * 1_000L) }

    val (consumed, remaining) = AlarmPyoSleepReminderPolicy.consume(
      plans,
      id = "plan-1",
      reminderAt = 1_000L,
      nowMillis = 1_000L
    )

    assertEquals("plan-1", consumed?.id)
    assertEquals(
      listOf("plan-2", "plan-3", "plan-4"),
      AlarmPyoSleepReminderPolicy.scheduled(remaining, nowMillis = 1_000L).map { it.id }
    )
  }

  @Test
  fun `an identical fully scheduled snapshot can be reused without registration`() {
    val plans = (1L..4L).map { plan("plan-$it", it * 1_000L) }
    val snapshot = AlarmPyoSleepReminderSnapshot(
      plans,
      setOf("plan-1", "plan-2", "plan-3")
    )

    assertTrue(
      AlarmPyoSleepReminderPolicy.canReuseScheduledSnapshot(
        snapshot,
        plans,
        nowMillis = 500L
      )
    )
  }

  @Test
  fun `a changed plan or incomplete scheduled ids cannot be reused`() {
    val plans = (1L..4L).map { plan("plan-$it", it * 1_000L) }
    val incomplete = AlarmPyoSleepReminderSnapshot(plans, setOf("plan-1", "plan-2"))
    val changed = plans.map { item ->
      if (item.id == "plan-4") item.copy(reminderAt = 5_000L) else item
    }

    assertTrue(
      !AlarmPyoSleepReminderPolicy.canReuseScheduledSnapshot(
        incomplete,
        plans,
        nowMillis = 500L
      )
    )
    assertTrue(
      !AlarmPyoSleepReminderPolicy.canReuseScheduledSnapshot(
        AlarmPyoSleepReminderSnapshot(plans, setOf("plan-1", "plan-2", "plan-3")),
        changed,
        nowMillis = 500L
      )
    )
  }

  @Test
  fun `a stale delivery generation does not consume the current plan`() {
    val plans = listOf(plan("same-id", 5_000L))

    val (consumed, remaining) = AlarmPyoSleepReminderPolicy.consume(
      plans,
      id = "same-id",
      reminderAt = 4_000L,
      nowMillis = 3_000L
    )

    assertNull(consumed)
    assertEquals(plans, remaining)
  }

  @Test
  fun `snapshot codec preserves every plan field and scheduled ids`() {
    val original = plan("sleep-reminder:day", 1_800_000_000_000L)
    val snapshot = AlarmPyoSleepReminderSnapshot(listOf(original), setOf(original.id))

    assertEquals(
      snapshot,
      AlarmPyoSleepReminderSnapshotCodec.decode(AlarmPyoSleepReminderSnapshotCodec.encode(snapshot))
    )
    assertNull(AlarmPyoSleepReminderSnapshotCodec.decode("{\"schemaVersion\":99}"))
  }

  @Test
  fun `all required system actions restore sleep reminders`() {
    assertTrue(shouldRestoreSleepReminders(Intent.ACTION_BOOT_COMPLETED))
    assertTrue(shouldRestoreSleepReminders(Intent.ACTION_LOCKED_BOOT_COMPLETED))
    assertTrue(shouldRestoreSleepReminders(Intent.ACTION_TIME_CHANGED))
    assertTrue(shouldRestoreSleepReminders(Intent.ACTION_TIMEZONE_CHANGED))
    assertTrue(shouldRestoreSleepReminders(Intent.ACTION_MY_PACKAGE_REPLACED))
  }

  @Test
  fun `time zone restoration keeps the saved local bedtime`() {
    val timeZone = TimeZone.getTimeZone("America/New_York")
    val source = plan("timezone", 1_800_000_000_000L).copy(
      localDateKey = "2027-01-15",
      localMinutes = 21 * 60 + 10
    )
    val restored = AlarmPyoSleepReminderPolicy.recalculateReminderAt(source, timeZone)
    val calendar = GregorianCalendar(timeZone).apply {
      timeInMillis = requireNotNull(restored)
    }

    assertEquals(2027, calendar.get(Calendar.YEAR))
    assertEquals(Calendar.JANUARY, calendar.get(Calendar.MONTH))
    assertEquals(15, calendar.get(Calendar.DAY_OF_MONTH))
    assertEquals(21, calendar.get(Calendar.HOUR_OF_DAY))
    assertEquals(10, calendar.get(Calendar.MINUTE))
  }

  private fun plan(id: String, reminderAt: Long) = AlarmPyoSleepReminderPlan(
    id = id,
    reminderAt = reminderAt,
    shiftDate = "2027-01-15",
    shiftName = "주간",
    title = "수면 시작 시간이에요",
    body = "주간 전환 수면 목표 시각이에요. 지금 주무세요.",
    localDateKey = "2027-01-15",
    localMinutes = 21 * 60 + 10
  )
}
