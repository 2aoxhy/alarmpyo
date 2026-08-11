package expo.modules.alarmpyoalarm

import org.junit.Assert.assertEquals
import org.junit.Test

class AlarmPyoWidgetSizePolicyTest {
  @Test
  fun `uses the minimum layout at the declared 4 by 1 height`() {
    assertEquals(
      AlarmPyoWidgetHeightMode.MINIMUM,
      AlarmPyoWidgetSizePolicy.heightMode(AlarmPyoWidgetSizePolicy.DEFAULT_MIN_HEIGHT_DP)
    )
  }

  @Test
  fun `keeps the minimum layout through small launcher rounding`() {
    assertEquals(AlarmPyoWidgetHeightMode.MINIMUM, AlarmPyoWidgetSizePolicy.heightMode(64))
  }

  @Test
  fun `restores details when the launcher provides enough height`() {
    assertEquals(AlarmPyoWidgetHeightMode.REGULAR, AlarmPyoWidgetSizePolicy.heightMode(65))
  }
}
