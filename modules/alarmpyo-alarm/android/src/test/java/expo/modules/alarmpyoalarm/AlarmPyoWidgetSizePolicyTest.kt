package expo.modules.alarmpyoalarm

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class AlarmPyoWidgetSizePolicyTest {
  @Test
  fun `uses the compact layout at the declared 4 by 1 height`() {
    assertEquals(
      AlarmPyoWidgetHeightMode.MINIMUM,
      AlarmPyoWidgetSizePolicy.heightMode(AlarmPyoWidgetSizePolicy.DEFAULT_MIN_HEIGHT_DP)
    )
  }

  @Test
  fun `keeps the compact fallback below the two row threshold`() {
    assertEquals(
      AlarmPyoWidgetHeightMode.MINIMUM,
      AlarmPyoWidgetSizePolicy.heightMode(AlarmPyoWidgetSizePolicy.MEDIUM_HEIGHT_MIN_DP - 1)
    )
  }

  @Test
  fun `restores the medium hierarchy at the two row threshold`() {
    assertEquals(
      AlarmPyoWidgetHeightMode.MEDIUM,
      AlarmPyoWidgetSizePolicy.heightMode(AlarmPyoWidgetSizePolicy.MEDIUM_HEIGHT_MIN_DP)
    )
  }

  @Test
  fun `One UI four by one remains compact at the Samsung measured 100dp height`() {
    val geometry = samsungGeometry(rowSpan = 1, height = 100.27f)
    assertEquals(100, geometry.minHeightDp)
    assertEquals(401, geometry.minWidthDp)
    assertEquals(1, geometry.rowSpan)
    assertEquals(AlarmPyoWidgetHeightMode.MINIMUM, AlarmPyoWidgetSizePolicy.heightMode(geometry))
  }

  @Test
  fun `One UI resize expands and contracts without retaining the previous grid hint`() {
    for (rowSpan in listOf(1, 2, 1, 2)) {
      val geometry = samsungGeometry(rowSpan, if (rowSpan == 1) 100.27f else 216.5f)
      assertEquals(
        if (rowSpan == 1) AlarmPyoWidgetHeightMode.MINIMUM else AlarmPyoWidgetHeightMode.MEDIUM,
        AlarmPyoWidgetSizePolicy.heightMode(geometry)
      )
    }
  }

  @Test
  fun `a multi row hint cannot force an expanded layout into insufficient height`() {
    val geometry = samsungGeometry(rowSpan = 2, height = 72f)
    assertEquals(AlarmPyoWidgetHeightMode.MINIMUM, AlarmPyoWidgetSizePolicy.heightMode(geometry))
  }

  @Test
  fun `launchers without OEM extras retain the standard height fallback`() {
    for (height in listOf(56, 95, 96, 100, 160)) {
      val geometry = AlarmPyoWidgetSizePolicy.geometry(minHeightDp = height, minWidthDp = 320)
      assertNull(geometry.rowSpan)
      assertEquals(AlarmPyoWidgetSizePolicy.heightMode(height), AlarmPyoWidgetSizePolicy.heightMode(geometry))
    }
  }

  @Test
  fun `missing or implausible OEM grid pairs do not override standard geometry`() {
    for ((row, column) in listOf(
      null to 4, 1 to null, 0 to 4, -1 to 4, 1 to 0, 1 to -1,
      1 to Int.MAX_VALUE, Int.MAX_VALUE to 4
    )) {
      val geometry = AlarmPyoWidgetSizePolicy.geometry(
        minHeightDp = 160, rowSpan = row, columnSpan = column
      )
      assertNull(geometry.rowSpan)
      assertEquals(AlarmPyoWidgetHeightMode.MEDIUM, AlarmPyoWidgetSizePolicy.heightMode(geometry))
    }
  }

  @Test
  fun `possible sizes provide conservative dimensions independent of orientation ordering`() {
    val sizes = listOf(
      AlarmPyoWidgetReportedSize(401.07f, 100.27f),
      AlarmPyoWidgetReportedSize(640.9f, 56.8f)
    )
    for (reported in listOf(sizes, sizes.reversed())) {
      val geometry = AlarmPyoWidgetSizePolicy.geometry(
        minHeightDp = 160, minWidthDp = 300, sizes = reported
      )
      assertEquals(56, geometry.minHeightDp)
      assertEquals(401, geometry.minWidthDp)
      assertEquals(AlarmPyoWidgetHeightMode.MINIMUM, AlarmPyoWidgetSizePolicy.heightMode(geometry))
    }
  }

  @Test
  fun `invalid size pairs are ignored rather than contributing one valid dimension`() {
    val invalid = listOf(
      AlarmPyoWidgetReportedSize(Float.NaN, 120f),
      AlarmPyoWidgetReportedSize(320f, Float.POSITIVE_INFINITY),
      AlarmPyoWidgetReportedSize(320f, Float.NEGATIVE_INFINITY),
      AlarmPyoWidgetReportedSize(-1f, 160f),
      AlarmPyoWidgetReportedSize(0f, 160f),
      AlarmPyoWidgetReportedSize(320f, 0.5f),
      AlarmPyoWidgetReportedSize(Float.MAX_VALUE, 160f)
    )
    val fallback = AlarmPyoWidgetSizePolicy.geometry(
      minHeightDp = 100, minWidthDp = 401, sizes = invalid
    )
    assertEquals(100, fallback.minHeightDp)
    assertEquals(401, fallback.minWidthDp)
    val valid = AlarmPyoWidgetSizePolicy.geometry(
      sizes = invalid + AlarmPyoWidgetReportedSize(320.9f, 95.9f)
    )
    assertEquals(95, valid.minHeightDp)
    assertEquals(320, valid.minWidthDp)
  }

  @Test
  fun `empty size options choose valid min max bounds or the compact preview defaults`() {
    assertEquals(AlarmPyoWidgetGeometry(56, 280), AlarmPyoWidgetSizePolicy.geometry())
    assertEquals(
      AlarmPyoWidgetGeometry(56, 280),
      AlarmPyoWidgetSizePolicy.geometry(
        minHeightDp = 0, minWidthDp = -1, maxHeightDp = Int.MAX_VALUE, maxWidthDp = 0
      )
    )
    assertEquals(
      AlarmPyoWidgetGeometry(100, 401),
      AlarmPyoWidgetSizePolicy.geometry(
        minHeightDp = -1, minWidthDp = 0, maxHeightDp = 100, maxWidthDp = 401
      )
    )
    assertEquals(
      AlarmPyoWidgetGeometry(56, 280),
      AlarmPyoWidgetSizePolicy.geometry(
        minHeightDp = 160, minWidthDp = 401, maxHeightDp = 56, maxWidthDp = 280
      )
    )
  }

  private fun samsungGeometry(rowSpan: Int, height: Float) = AlarmPyoWidgetSizePolicy.geometry(
    minHeightDp = height.toInt(),
    maxHeightDp = height.toInt(),
    minWidthDp = 401,
    maxWidthDp = 401,
    sizes = listOf(AlarmPyoWidgetReportedSize(401.07f, height)),
    rowSpan = rowSpan,
    columnSpan = 4
  )
}
