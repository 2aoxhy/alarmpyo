package expo.modules.alarmpyoalarm

import org.junit.Assert.assertEquals
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
}
