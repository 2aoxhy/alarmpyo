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
  fun `compact work shows work time and next work without alarm or date rows`() {
    val presentation = resolve(state(), height = 56)
    assertEquals(AlarmPyoWidgetHeightMode.MINIMUM, presentation.heightMode)
    assertFalse(presentation.showDate)
    assertFalse(presentation.showStatus)
    assertTrue(presentation.showSchedule)
    assertEquals(AlarmPyoWidgetSectionKind.NEXT_WORK, presentation.nextSection?.kind)
    assertNull(presentation.alarmSection)
  }

  @Test
  fun `all saved display combinations retain the configured primary and compact only removes alarm details`() {
    for (today in listOf(false, true)) {
      for (next in listOf(false, true)) {
        for (alarm in listOf(false, true)) {
          if (!today && !next && !alarm) continue
          val snapshot = snapshot(AlarmPyoWidgetDisplayOptions(today, next, alarm))
          val original = AlarmPyoWidgetFormatter.format(snapshot, NOW, UTC)
          val compact = resolve(original, height = 56)
          val expanded = resolve(original, height = 160)
          assertNull(compact.alarmSection)
          assertTrue(compact.nextSection?.kind != AlarmPyoWidgetSectionKind.NEXT_ALARM)
          // Presentation is derived from the formatted primary, never a changed
          // snapshot or forced display preference.
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
          if (!today && !next && alarm) {
            assertEquals("오늘 06:30", original.titleText)
            assertNull(compact.nextSection)
          }
        }
      }
    }
  }

  @Test
  fun `130 percent removes compact time but retains next work`() {
    assertTrue(resolve(state(), 56, scale = 1.29f).showSchedule)
    val large = resolve(state(), 56, scale = 1.3f)
    assertFalse(large.showSchedule)
    assertNotNull(large.nextSection)
    assertEquals(2, large.nextMaxLines)
    val veryLarge = resolve(state(), 56, scale = 2f)
    assertNotNull(veryLarge.nextSection)
    assertEquals(1, veryLarge.nextMaxLines)
  }

  @Test
  fun `expanded layout uses real available height to preserve details when they fit`() {
    val small = resolve(state(), 96, scale = 1.3f)
    val tall = resolve(state(), 160, scale = 1.3f)
    assertNull(small.alarmSection)
    assertTrue(small.showSchedule)
    assertNotNull(tall.alarmSection)
    assertTrue(tall.showSchedule)
    assertTrue(tall.showDate)
    assertTrue(tall.showStatus)
  }

  @Test
  fun `180 percent expanded layout keeps date title and next work without shrinking below 12sp`() {
    for (scale in listOf(1.8f, 2f)) {
      val presentation = resolve(state(), 96, scale = scale)
      assertTrue(presentation.showDate)
      assertFalse(presentation.showStatus)
      assertFalse(presentation.showSchedule)
      assertNotNull(presentation.nextSection)
      assertNull(presentation.alarmSection)
      assertTrue(presentation.titleSizeSp >= 12f)
      val estimatedHeight = (24f + presentation.titleSizeSp) * scale * 1.2f + 8f
      assertTrue(estimatedHeight <= 96f)
    }
  }

  @Test
  fun `shrinking after expansion restores compact policy without changing the snapshot`() {
    val state = state()
    assertNotNull(resolve(state, 160).alarmSection)
    assertNull(resolve(state, 95).alarmSection)
    assertFalse(resolve(state, 95).showDate)
    assertNotNull(resolve(state, 96).alarmSection)
  }

  @Test
  fun `narrow launcher widths collapse labels and invalid scale uses readable defaults`() {
    val narrow = resolve(state(), 56, width = 180)
    assertFalse(narrow.showSectionLabels)
    assertEquals(14f, narrow.titleSizeSp, 0f)
    assertEquals(2, narrow.nextMaxLines)
    assertEquals(resolve(state(), 56), resolve(state(), 56, scale = Float.NaN))
  }

  @Test
  fun `Samsung measured four by one applies compact hierarchy at 115 percent`() {
    val geometry = AlarmPyoWidgetSizePolicy.geometry(
      sizes = listOf(AlarmPyoWidgetReportedSize(401.07f, 100.27f)),
      rowSpan = 1, columnSpan = 4
    )
    val compact = AlarmPyoWidgetPresentationPolicy.resolve(state(), geometry, 1.15f)
    assertEquals(AlarmPyoWidgetHeightMode.MINIMUM, compact.heightMode)
    assertFalse(compact.showDate)
    assertFalse(compact.showStatus)
    assertTrue(compact.showSchedule)
    assertNotNull(compact.nextSection)
    assertNull(compact.alarmSection)
  }

  @Test
  fun `One UI compact layout retains next work and hides time for large text`() {
    val geometry = AlarmPyoWidgetSizePolicy.geometry(
      minHeightDp = 100, minWidthDp = 401, rowSpan = 1, columnSpan = 4
    )
    for (scale in listOf(1.3f, 1.4f, 1.8f, 2f)) {
      val compact = AlarmPyoWidgetPresentationPolicy.resolve(state(), geometry, scale)
      assertEquals(AlarmPyoWidgetHeightMode.MINIMUM, compact.heightMode)
      assertFalse(compact.showSchedule)
      assertFalse(compact.showDate)
      assertFalse(compact.showStatus)
      assertNotNull(compact.nextSection)
      assertNull(compact.alarmSection)
      assertEquals(2, compact.nextMaxLines)
    }
  }

  @Test
  fun `One UI expanded hierarchy still adapts to available height and font scale`() {
    val geometry = AlarmPyoWidgetSizePolicy.geometry(
      minHeightDp = 216, minWidthDp = 401, rowSpan = 2, columnSpan = 4
    )
    val normal = AlarmPyoWidgetPresentationPolicy.resolve(state(), geometry, 1.15f)
    assertEquals(AlarmPyoWidgetHeightMode.MEDIUM, normal.heightMode)
    assertNotNull(normal.alarmSection)
    assertTrue(normal.showDate)
    assertTrue(normal.showStatus)
    assertTrue(normal.showSchedule)
    val large = AlarmPyoWidgetPresentationPolicy.resolve(state(), geometry, 2f)
    assertEquals(AlarmPyoWidgetHeightMode.MEDIUM, large.heightMode)
    assertNotNull(large.nextSection)
    assertNull(large.alarmSection)
    assertTrue(large.showDate)
    assertFalse(large.showStatus)
    assertFalse(large.showSchedule)
  }

  private fun resolve(
    state: AlarmPyoWidgetViewState,
    height: Int,
    width: Int = 320,
    scale: Float = 1f
  ) = AlarmPyoWidgetPresentationPolicy.resolve(state, height, width, scale)

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
