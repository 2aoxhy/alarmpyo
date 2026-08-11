package expo.modules.alarmpyoalarm

import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class AlarmPyoAlarmHistoryTest {
  @Test
  fun readsLegacyOrBrokenHistorySafely() {
    assertTrue(AlarmPyoAlarmStore.decodeRecentEvents("not-json").isEmpty())

    val raw = JSONArray()
      .put(JSONObject().put("type", "unknown").put("occurredAt", 10L))
      .put(
        JSONObject()
          .put("type", AlarmPyoAlarmEventType.PLAYBACK_CONFIRMED)
          .put("occurredAt", 20L)
          .put("shiftName", "주간")
      )
      .toString()

    val decoded = AlarmPyoAlarmStore.decodeRecentEvents(raw)
    assertEquals(1, decoded.size)
    assertEquals(AlarmPyoAlarmEventType.PLAYBACK_CONFIRMED, decoded.single().type)
    assertEquals("주간", decoded.single().shiftName)
    assertEquals(0L, decoded.single().nextAlarmAt)
  }

  @Test
  fun keepsOnlyTheNewestTwelveUniqueEvents() {
    val raw = JSONArray()
    repeat(15) { index ->
      raw.put(
        JSONObject()
          .put("id", "event-$index")
          .put("type", AlarmPyoAlarmEventType.RETRY_STARTED)
          .put("occurredAt", (index + 1).toLong())
          .put("planId", "plan")
          .put("shiftName", "야간")
          .put("alarmAt", 1L)
          .put("deliveryAttempt", index)
      )
    }
    raw.put(
      JSONObject()
        .put("id", "event-14")
        .put("type", AlarmPyoAlarmEventType.RETRY_STARTED)
        .put("occurredAt", 15L)
    )

    val decoded = AlarmPyoAlarmStore.decodeRecentEvents(raw.toString())
    assertEquals(AlarmPyoAlarmStore.MAX_RECENT_EVENTS, decoded.size)
    assertEquals("event-14", decoded.first().id)
    assertEquals("event-3", decoded.last().id)
  }

  @Test
  fun createsACompactEventFromAPlan() {
    val plan = AlarmPyoAlarmPlan(
      id = "night-alarm",
      dateKey = "2026-07-14",
      shiftTypeId = "night",
      shiftName = "야간",
      alarmAt = 100L,
      originalAlarmAt = 50L,
      deliveryAttempt = 2
    )

    val event = AlarmPyoAlarmHistoryEvent.create(
      AlarmPyoAlarmEventType.RETRY_SCHEDULED,
      plan,
      isTest = false,
      nextAlarmAt = 200L,
      occurredAt = 150L
    )

    assertEquals(150L, event.occurredAt)
    assertEquals(2, event.deliveryAttempt)
    assertEquals(200L, event.nextAlarmAt)
    assertEquals(50L, event.alarmAt)
    assertEquals("야간", event.shiftName)
  }

  @Test
  fun keepsAutomaticRepeatEventsDistinctFromPlaybackRetries() {
    val plan = AlarmPyoAlarmPlan(
      id = "night-alarm",
      dateKey = "2026-07-14",
      shiftTypeId = "night",
      shiftName = "야간",
      alarmAt = 100L
    )
    val scheduled = AlarmPyoAlarmHistoryEvent.create(
      AlarmPyoAlarmEventType.AUTO_REPEAT_SCHEDULED,
      plan,
      isTest = false,
      nextAlarmAt = 400L,
      occurredAt = 200L
    )
    val started = AlarmPyoAlarmHistoryEvent.create(
      AlarmPyoAlarmEventType.AUTO_REPEAT_STARTED,
      AlarmPyoAlarmScheduler.createSingleRepeatPlan(plan, 400L),
      isTest = false,
      occurredAt = 400L
    )

    assertEquals(AlarmPyoAlarmEventType.AUTO_REPEAT_SCHEDULED, scheduled.type)
    assertEquals(400L, scheduled.nextAlarmAt)
    assertEquals(AlarmPyoAlarmEventType.AUTO_REPEAT_STARTED, started.type)
  }
}
