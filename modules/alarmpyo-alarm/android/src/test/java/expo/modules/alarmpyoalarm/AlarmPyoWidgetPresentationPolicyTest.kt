package expo.modules.alarmpyoalarm

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.util.Calendar
import java.util.TimeZone

class AlarmPyoWidgetPresentationPolicyTest {
  @Test
  fun `Samsung four by one fits a large title and full width detail lines at 115 percent`() {
    val presentation = compact(state(), scale = 1.15f)
    assertEquals(AlarmPyoWidgetHeightMode.MINIMUM, presentation.heightMode)
    assertEquals(24f, presentation.titleSizeSp, 0f)
    assertEquals(14f, AlarmPyoWidgetPresentationPolicy.DETAIL_SIZE_SP, 0f)
    assertFalse(presentation.showDate)
    assertFalse(presentation.showStatus)
    assertTrue(presentation.showSchedule)
    assertEquals(AlarmPyoWidgetSectionKind.NEXT_WORK, presentation.nextSection?.kind)
    assertNull(presentation.alarmSection)
    assertTrue(presentation.estimatedHeightDp <= 100f)
  }

  @Test
  fun `Samsung four by two uses 32sp primary with symmetric safe insets`() {
    val presentation = expanded(state(), scale = 1.15f)
    assertEquals(32f, presentation.titleSizeSp, 0f)
    assertTrue(presentation.showDate)
    assertTrue(presentation.showStatus)
    assertTrue(presentation.showSchedule)
    assertNotNull(presentation.nextSection)
    assertNotNull(presentation.alarmSection)
    assertTrue(presentation.estimatedHeightDp <= 226f)
  }

  @Test
  fun `all saved display combinations retain the configured primary`() {
    for (today in listOf(false, true)) {
      for (next in listOf(false, true)) {
        for (alarm in listOf(false, true)) {
          if (!today && !next && !alarm) continue
          val snapshot = snapshot(AlarmPyoWidgetDisplayOptions(today, next, alarm))
          val original = AlarmPyoWidgetFormatter.format(snapshot, NOW, UTC)
          val compact = compact(original)
          val expanded = expanded(original)
          assertNull(compact.alarmSection)
          assertTrue(compact.nextSection?.kind != AlarmPyoWidgetSectionKind.NEXT_ALARM)
          assertEquals(
            when {
              today -> "주간 근무 예정"
              next -> "오늘 주간"
              else -> "오늘 06:30"
            },
            original.titleText
          )
          assertEquals(today && next, compact.nextSection != null)
          assertEquals(
            if (today && next) AlarmPyoWidgetSectionKind.NEXT_WORK
            else if (alarm && (today || next)) AlarmPyoWidgetSectionKind.NEXT_ALARM
            else null,
            expanded.nextSection?.kind
          )
          if (today && next && alarm) assertNotNull(expanded.alarmSection)
          assertEquals(original, AlarmPyoWidgetFormatter.format(snapshot, NOW, UTC))
        }
      }
    }
  }

  @Test
  fun `tiny widgets hide details before shrinking the centered title`() {
    for (scale in listOf(1f, 1.3f, 1.8f, 2f)) {
      val small = compact(state(), height = 56, width = 180, scale = scale)
      assertFalse(small.showDate)
      assertFalse(small.showStatus)
      assertFalse(small.showSchedule)
      assertNull(small.alarmSection)
      assertTrue(small.titleSizeSp >= 12f)
      assertTrue(small.estimatedHeightDp <= 56f)
    }
    val regular = compact(state(), height = 56)
    assertEquals(24f, regular.titleSizeSp, 0f)
    assertNull(regular.nextSection)
  }

  @Test
  fun `large text prioritizes the primary instead of crowding a compact next work panel`() {
    val regular = compact(state(), scale = 1.15f)
    val large = compact(state(), scale = 1.3f)
    assertTrue(regular.showSchedule)
    assertFalse(large.showSchedule)
    assertNotNull(large.nextSection)
    val huge = compact(state(), scale = 2f)
    assertFalse(huge.showSchedule)
    assertFalse(huge.showDate)
    assertNull(huge.nextSection)
    assertEquals(24f, huge.titleSizeSp, 0f)
    assertTrue(huge.estimatedHeightDp <= 100f)
  }

  @Test
  fun `expanded large text keeps date and next work only when the actual height fits`() {
    for (scale in listOf(1.8f, 2f)) {
      val tall = expanded(state(), scale = scale)
      assertTrue(tall.showDate)
      assertFalse(tall.showStatus)
      assertFalse(tall.showSchedule)
      assertNotNull(tall.nextSection)
      assertNull(tall.alarmSection)
      val small = expanded(state(), height = 96, scale = scale)
      assertFalse(small.showDate)
      assertFalse(small.showStatus)
      assertNull(small.nextSection)
      assertTrue(small.estimatedHeightDp <= 96f)
    }
  }

  @Test
  fun `long custom and substitute names adapt to the full width without altering the content`() {
    for (title in listOf("야간 대체근무 예정", "아주 긴 사용자 지정 근무 일정", "근무표 갱신 필요")) {
      val original = state().copy(titleText = title)
      val narrow = compact(original, width = 180)
      val wide = compact(original, width = 401)
      assertTrue(narrow.titleSizeSp in 16f..24f)
      assertTrue(narrow.titleSizeSp <= wide.titleSizeSp)
      assertEquals(title, original.titleText)
    }
  }

  @Test
  fun `every supported size and font scale respects its vertical budget`() {
    for (height in listOf(56, 95, 96, 100, 160, 216, 226)) {
      for (width in listOf(180, 259, 260, 279, 280, 320, 401)) {
        for (scale in listOf(1f, 1.15f, 1.29f, 1.3f, 1.4f, 1.79f, 1.8f, 2f)) {
          for (rowSpan in listOf(1, 2)) {
            val geometry = AlarmPyoWidgetSizePolicy.geometry(
              minHeightDp = height, minWidthDp = width, rowSpan = rowSpan, columnSpan = 4
            )
            val presentation = AlarmPyoWidgetPresentationPolicy.resolve(state(), geometry, scale)
            assertTrue("$height x $width @ $scale row $rowSpan", presentation.estimatedHeightDp <= height)
            assertTrue(presentation.titleSizeSp >= 12f)
            assertFalse(presentation.showStatus && !presentation.showDate)
          }
        }
      }
    }
  }

  @Test
  fun `growing within a layout restores lower priority details without changing the primary`() {
    for (rowSpan in listOf(1, 2)) {
      var previousRows = 0
      for (height in 96..226) {
        val geometry = AlarmPyoWidgetSizePolicy.geometry(
          minHeightDp = height, minWidthDp = 401, rowSpan = rowSpan, columnSpan = 4
        )
        val presentation = AlarmPyoWidgetPresentationPolicy.resolve(state(), geometry, 1.15f)
        val rows = listOf(
          presentation.showDate, presentation.showSchedule,
          presentation.nextSection != null, presentation.alarmSection != null
        ).count { it }
        assertTrue(rows >= previousRows)
        previousRows = rows
      }
    }
  }

  @Test
  fun `shrinking after expansion restores compact policy and invalid scales use defaults`() {
    val original = compact(state())
    assertNotNull(expanded(state()).alarmSection)
    assertEquals(original, compact(state()))
    assertEquals(original, compact(state(), scale = Float.NaN))
    assertEquals(original, compact(state(), scale = Float.POSITIVE_INFINITY))
    assertEquals(original, compact(state(), scale = 0f))
    assertEquals(original, compact(state(), scale = -1f))
  }

  private fun compact(
    state: AlarmPyoWidgetViewState,
    height: Int = 100,
    width: Int = 401,
    scale: Float = 1f
  ) = AlarmPyoWidgetPresentationPolicy.resolve(
    state,
    AlarmPyoWidgetSizePolicy.geometry(
      minHeightDp = height, minWidthDp = width, rowSpan = 1, columnSpan = 4
    ),
    scale
  )

  private fun expanded(
    state: AlarmPyoWidgetViewState,
    height: Int = 226,
    scale: Float = 1f
  ) = AlarmPyoWidgetPresentationPolicy.resolve(
    state,
    AlarmPyoWidgetSizePolicy.geometry(
      minHeightDp = height, minWidthDp = 401, rowSpan = 2, columnSpan = 4
    ),
    scale
  )

  private fun state() = AlarmPyoWidgetFormatter.format(
    snapshot(AlarmPyoWidgetDisplayOptions(true, true, true)), NOW, UTC
  )

  private fun snapshot(options: AlarmPyoWidgetDisplayOptions) = AlarmPyoWidgetSnapshot(
    generatedAt = NOW,
    displayOptions = options,
    entries = listOf(
      AlarmPyoWidgetEntry("2026-09-06", "day", "주간", 420, 960, false, false, false),
      AlarmPyoWidgetEntry("2026-09-07", "night", "야간", 1080, 360, true, false, false)
    ),
    alarms = listOf(AlarmPyoWidgetAlarm(NOW + 30 * 60_000L, "day", "주간"))
  )

  companion object {
    private val UTC = TimeZone.getTimeZone("UTC")
    private val NOW = Calendar.getInstance(UTC).apply {
      clear()
      set(2026, Calendar.SEPTEMBER, 6, 6, 0, 0)
    }.timeInMillis
  }
}
