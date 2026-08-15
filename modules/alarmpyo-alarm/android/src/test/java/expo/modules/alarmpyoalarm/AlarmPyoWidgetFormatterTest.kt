package expo.modules.alarmpyoalarm

import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Test
import java.text.SimpleDateFormat
import java.util.Calendar
import java.util.Locale
import java.util.TimeZone

class AlarmPyoWidgetFormatterTest {
  private val seoul = TimeZone.getTimeZone("Asia/Seoul")

  @Test
  fun `keeps today and the next shift separate in the four by one widget`() {
    val snapshot = AlarmPyoWidgetSnapshot(
      generatedAt = timestamp(2026, 7, 13, 10, 0),
      entries = listOf(
        entry("2026-07-13", "day", "주간", 7 * 60, 18 * 60),
        entry("2026-07-14", "night", "야간", 18 * 60, 7 * 60, endsNextDay = true),
        entry("2026-07-15", "off", "휴무", null, null, isOff = true)
      )
    )

    val state = AlarmPyoWidgetFormatter.format(
      snapshot,
      timestamp(2026, 7, 13, 10, 0),
      seoul
    )

    assertEquals("2026년 7월 13일 월요일", state.dateText)
    assertEquals("현재 근무 중", state.statusText)
    assertEquals("주간 근무 중", state.titleText)
    assertEquals("07:00–18:00", state.scheduleText)
    assertEquals("다음 근무", state.bottomLabel)
    assertEquals("내일 야간 · 18:00", state.bottomText)
    assertEquals(AlarmPyoWidgetVisual.DAY, state.visual)
    assertNotNull(state.nextRefreshAt)
  }

  @Test
  fun `keeps an overnight shift active after midnight`() {
    val snapshot = AlarmPyoWidgetSnapshot(
      generatedAt = timestamp(2026, 7, 14, 2, 10),
      entries = listOf(
        entry("2026-07-13", "night", "야간", 18 * 60, 7 * 60, endsNextDay = true),
        entry("2026-07-14", "off", "휴무", null, null, isOff = true)
      )
    )

    val state = AlarmPyoWidgetFormatter.format(
      snapshot,
      timestamp(2026, 7, 14, 2, 10),
      seoul
    )

    assertEquals("현재 근무 중", state.statusText)
    assertEquals("야간 근무 중", state.titleText)
    assertEquals("18:00–익일 07:00", state.scheduleText)
    assertEquals("다음 근무", state.bottomLabel)
    assertEquals("예정 없음", state.bottomText)
    assertEquals(AlarmPyoWidgetVisual.NIGHT, state.visual)
  }

  @Test
  fun `keeps the completed day shift as today and shows the next night separately`() {
    val snapshot = AlarmPyoWidgetSnapshot(
      generatedAt = timestamp(2026, 7, 13, 19, 0),
      entries = listOf(
        entry("2026-07-13", "day", "주간", 7 * 60, 18 * 60),
        entry("2026-07-14", "night", "야간", 18 * 60, 7 * 60, endsNextDay = true)
      )
    )

    val state = AlarmPyoWidgetFormatter.format(
      snapshot,
      timestamp(2026, 7, 13, 19, 0),
      seoul
    )

    assertEquals("오늘 근무 완료", state.statusText)
    assertEquals("주간 근무 완료", state.titleText)
    assertEquals("07:00–18:00", state.scheduleText)
    assertEquals("다음 근무", state.bottomLabel)
    assertEquals("내일 야간 · 18:00", state.bottomText)
    assertEquals(AlarmPyoWidgetVisual.DAY, state.visual)
  }

  @Test
  fun `marks an overridden next shift after the current shift is complete`() {
    val snapshot = AlarmPyoWidgetSnapshot(
      generatedAt = timestamp(2026, 7, 13, 19, 0),
      entries = listOf(
        entry("2026-07-13", "day", "주간", 7 * 60, 18 * 60),
        entry(
          "2026-07-14",
          "night",
          "야간",
          18 * 60,
          7 * 60,
          endsNextDay = true,
          isOverride = true
        )
      )
    )

    val state = AlarmPyoWidgetFormatter.format(
      snapshot,
      timestamp(2026, 7, 13, 19, 0),
      seoul
    )

    assertEquals("오늘 근무 완료", state.statusText)
    assertEquals("주간 근무 완료", state.titleText)
    assertEquals("내일 야간 · 18:00", state.bottomText)
    assertEquals(AlarmPyoWidgetVisual.DAY, state.visual)
  }

  @Test
  fun `keeps a refresh that is less than thirty seconds from shift start`() {
    val snapshot = AlarmPyoWidgetSnapshot(
      generatedAt = timestamp(2026, 7, 13, 17, 59),
      entries = listOf(
        entry("2026-07-13", "night", "야간", 18 * 60, 7 * 60, endsNextDay = true)
      )
    )

    val state = AlarmPyoWidgetFormatter.format(
      snapshot,
      timestamp(2026, 7, 13, 17, 59) + 45_000L,
      seoul
    )

    assertEquals(timestamp(2026, 7, 13, 18, 0) + 1_000L, state.nextRefreshAt)
  }

  @Test
  fun `shows the next shift on a day off`() {
    val snapshot = AlarmPyoWidgetSnapshot(
      generatedAt = timestamp(2026, 7, 13, 10, 0),
      entries = listOf(
        entry("2026-07-13", "off", "휴무", null, null, isOff = true),
        entry("2026-07-14", "day", "주간", 7 * 60, 18 * 60)
      )
    )

    val state = AlarmPyoWidgetFormatter.format(
      snapshot,
      timestamp(2026, 7, 13, 10, 0),
      seoul
    )

    assertEquals("오늘 휴무", state.statusText)
    assertEquals("휴무", state.titleText)
    assertEquals("다음 근무", state.bottomLabel)
    assertEquals("내일 주간 · 07:00", state.bottomText)
    assertEquals(AlarmPyoWidgetVisual.OFF, state.visual)
  }

  @Test
  fun `marks a directly changed shift`() {
    val snapshot = AlarmPyoWidgetSnapshot(
      generatedAt = 0,
      entries = listOf(
        entry(
          "2026-07-13",
          "night",
          "야간",
          18 * 60,
          7 * 60,
          endsNextDay = true,
          isOverride = true
        )
      )
    )

    val state = AlarmPyoWidgetFormatter.format(
      snapshot,
      timestamp(2026, 7, 13, 10, 0),
      seoul
    )

    assertEquals("변경된 근무 예정", state.statusText)
    assertEquals("야간 근무 예정", state.titleText)
    assertEquals("다음 근무", state.bottomLabel)
    assertEquals("오늘 야간 · 18:00", state.bottomText)
  }

  @Test
  fun `uses dedicated visuals for training and reserve schedules`() {
    val training = AlarmPyoWidgetFormatter.format(
      AlarmPyoWidgetSnapshot(
        generatedAt = 0,
        entries = listOf(
          entry("2026-07-14", "exception-training", "교육", 7 * 60, 18 * 60)
        )
      ),
      timestamp(2026, 7, 14, 10, 0),
      seoul
    )
    val reserve = AlarmPyoWidgetFormatter.format(
      AlarmPyoWidgetSnapshot(
        generatedAt = 0,
        entries = listOf(
          entry("2026-07-15", "exception-reserve", "예비군", 7 * 60, 18 * 60)
        )
      ),
      timestamp(2026, 7, 15, 10, 0),
      seoul
    )

    assertEquals("교육 근무 중", training.titleText)
    assertEquals("07:00–18:00", training.scheduleText)
    assertEquals(AlarmPyoWidgetVisual.TRAINING, training.visual)
    assertEquals("예비군 근무 중", reserve.titleText)
    assertEquals(AlarmPyoWidgetVisual.RESERVE, reserve.visual)
  }

  @Test
  fun `shows today next shift and next alarm without crowding the primary panel`() {
    val alarmAt = timestamp(2026, 7, 14, 16, 10)
    val state = AlarmPyoWidgetFormatter.format(
      AlarmPyoWidgetSnapshot(
        generatedAt = timestamp(2026, 7, 13, 10, 0),
        entries = listOf(
          entry("2026-07-13", "day", "주간", 7 * 60, 18 * 60),
          entry("2026-07-14", "night", "야간", 18 * 60, 7 * 60, endsNextDay = true)
        ),
        displayOptions = AlarmPyoWidgetDisplayOptions(
          todayShift = true,
          nextShift = true,
          nextAlarm = true
        ),
        alarms = listOf(AlarmPyoWidgetAlarm(alarmAt, "night", "야간"))
      ),
      timestamp(2026, 7, 13, 10, 0),
      seoul
    )

    assertEquals("주간 근무 중", state.titleText)
    assertEquals("다음 근무", state.bottomLabel)
    assertEquals("내일 야간 · 18:00", state.bottomText)
    assertEquals("다음 알람", state.secondaryLabel)
    assertEquals("내일 16:10 · 야간", state.secondaryText)
  }

  @Test
  fun `uses the next alarm as the primary panel when it is the only selection`() {
    val alarmAt = timestamp(2026, 7, 13, 16, 10)
    val state = AlarmPyoWidgetFormatter.format(
      AlarmPyoWidgetSnapshot(
        generatedAt = timestamp(2026, 7, 13, 10, 0),
        entries = listOf(
          entry("2026-07-13", "day", "주간", 7 * 60, 18 * 60),
          entry("2026-07-14", "night", "야간", 18 * 60, 7 * 60, endsNextDay = true)
        ),
        displayOptions = AlarmPyoWidgetDisplayOptions(
          todayShift = false,
          nextShift = false,
          nextAlarm = true
        ),
        alarms = listOf(AlarmPyoWidgetAlarm(alarmAt, "night", "야간"))
      ),
      timestamp(2026, 7, 13, 10, 0),
      seoul
    )

    assertEquals("다음 알람", state.dateText)
    assertEquals("오늘 16:10", state.titleText)
    assertEquals("야간 알람", state.scheduleText)
    assertEquals("", state.bottomLabel)
    assertEquals(AlarmPyoWidgetVisual.NIGHT, state.visual)
    assertEquals(alarmAt + 1_000L, state.nextRefreshAt)
  }

  @Test
  fun `accepts current snapshots without an end time`() {
    val parsed = AlarmPyoWidgetSnapshot.fromJson(
      """{"version":2,"setupCompleted":true,"entries":[{"dateKey":"2026-07-13","shiftTypeId":"day","shiftName":"주간","startMinutes":420,"isOff":false}]}"""
    )

    assertNotNull(parsed)
    assertNull(parsed?.entries?.first()?.endMinutes)
  }

  @Test
  fun `rejects a version one snapshot so the app refreshes the widget`() {
    assertNull(
      AlarmPyoWidgetSnapshot.fromJson(
        """{"version":1,"setupCompleted":true,"entries":[{"dateKey":"2026-07-13","shiftTypeId":"day","shiftName":"주간","startMinutes":420,"endMinutes":1080,"isOff":false}]}"""
      )
    )
  }

  @Test
  fun `asks for a schedule refresh when no current snapshot exists`() {
    val state = AlarmPyoWidgetFormatter.format(
      AlarmPyoWidgetSnapshot(generatedAt = 0, setupCompleted = false, entries = emptyList()),
      timestamp(2026, 7, 13, 19, 0),
      seoul
    )

    assertEquals("일정 갱신 필요", state.statusText)
    assertEquals("근무표 갱신 필요", state.titleText)
    assertEquals(AlarmPyoWidgetVisual.UNKNOWN, state.visual)
  }

  @Test
  fun `rejects malformed or duplicate widget entries`() {
    assertNull(AlarmPyoWidgetSnapshot.fromJson("{}"))
    assertNull(
      AlarmPyoWidgetSnapshot.fromJson(
        """{"version":2,"entries":[{"dateKey":"2026-07-13","startMinutes":420},{"dateKey":"2026-07-13","startMinutes":420}]}"""
      )
    )
    assertNull(
      AlarmPyoWidgetSnapshot.fromJson(
        """{"version":2,"entries":[{"dateKey":"2026-07-13","startMinutes":420,"endMinutes":420,"isOff":false}]}"""
      )
    )
    assertNull(
      AlarmPyoWidgetSnapshot.fromJson(
        """{"version":2,"displayOptions":{"todayShift":false,"nextShift":false,"nextAlarm":false},"entries":[{"dateKey":"2026-07-13","startMinutes":420,"endMinutes":1080,"isOff":false}]}"""
      )
    )
  }

  @Test
  fun `parses widget display options and upcoming alarms`() {
    val alarmAt = timestamp(2026, 7, 13, 5, 10)
    val parsed = AlarmPyoWidgetSnapshot.fromJson(
      """{"version":2,"displayOptions":{"todayShift":false,"nextShift":false,"nextAlarm":true},"alarms":[{"alarmAt":$alarmAt,"shiftTypeId":"day","shiftName":"주간"}],"entries":[{"dateKey":"2026-07-13","shiftTypeId":"day","shiftName":"주간","startMinutes":420,"endMinutes":1080,"isOff":false}]}"""
    )

    assertNotNull(parsed)
    assertEquals(false, parsed?.displayOptions?.todayShift)
    assertEquals(true, parsed?.displayOptions?.nextAlarm)
    assertEquals(alarmAt, parsed?.alarms?.first()?.alarmAt)
  }

  @Test
  fun `accepts yesterday plus 366 days and a full year of alarm candidates`() {
    val entries = JSONArray()
    val alarms = JSONArray()
    val calendar = Calendar.getInstance(seoul).apply {
      clear()
      set(2026, Calendar.JANUARY, 1, 0, 0, 0)
    }
    val formatter = SimpleDateFormat("yyyy-MM-dd", Locale.US).apply {
      timeZone = seoul
    }
    repeat(367) { index ->
      entries.put(
        JSONObject()
          .put("dateKey", formatter.format(calendar.time))
          .put("shiftTypeId", "day")
          .put("shiftName", "주간")
          .put("startMinutes", 420)
          .put("endMinutes", 1080)
          .put("isOff", false)
      )
      if (index < 366) {
        alarms.put(
          JSONObject()
            .put("alarmAt", calendar.timeInMillis + 1L)
            .put("shiftTypeId", "day")
            .put("shiftName", "주간")
        )
      }
      calendar.add(Calendar.DAY_OF_MONTH, 1)
    }
    val parsed = AlarmPyoWidgetSnapshot.fromJson(
      JSONObject()
        .put("version", 2)
        .put("entries", entries)
        .put("alarms", alarms)
        .toString()
    )

    assertNotNull(parsed)
    assertEquals(367, parsed?.entries?.size)
    assertEquals(366, parsed?.alarms?.size)
  }

  private fun entry(
    dateKey: String,
    shiftTypeId: String,
    shiftName: String,
    startMinutes: Int?,
    endMinutes: Int?,
    endsNextDay: Boolean = false,
    isOff: Boolean = false,
    isOverride: Boolean = false
  ) = AlarmPyoWidgetEntry(
    dateKey = dateKey,
    shiftTypeId = shiftTypeId,
    shiftName = shiftName,
    startMinutes = startMinutes,
    endMinutes = endMinutes,
    endsNextDay = endsNextDay,
    isOff = isOff,
    isOverride = isOverride
  )

  private fun timestamp(
    year: Int,
    month: Int,
    day: Int,
    hour: Int,
    minute: Int
  ): Long = Calendar.getInstance(seoul).apply {
    clear()
    set(year, month - 1, day, hour, minute, 0)
  }.timeInMillis
}
