package expo.modules.alarmpyoalarm

import org.junit.Assert.assertEquals
import org.junit.Test

class AlarmPyoShiftVisualPolicyTest {
  @Test
  fun mapsBuiltInShiftRolesToSemanticNativeColors() {
    assertEquals(R.color.alarmpyo_day, AlarmPyoShiftVisualPolicy.resolve("day").accent)
    assertEquals(R.color.alarmpyo_evening, AlarmPyoShiftVisualPolicy.resolve("evening").accent)
    assertEquals(R.color.alarmpyo_night, AlarmPyoShiftVisualPolicy.resolve("night").accent)
    assertEquals(R.color.alarmpyo_off, AlarmPyoShiftVisualPolicy.resolve("off").accent)
  }

  @Test
  fun substituteRolesKeepTheirBaseShiftColor() {
    assertEquals(R.color.alarmpyo_day, AlarmPyoShiftVisualPolicy.resolve("substitute-day").accent)
    assertEquals(R.color.alarmpyo_night, AlarmPyoShiftVisualPolicy.resolve("substitute-night").accent)
  }

  @Test
  fun unknownRolesUseTheAccessibleBrandAccentPair() {
    val style = AlarmPyoShiftVisualPolicy.resolve("custom-role")
    assertEquals(R.color.alarmpyo_accent, style.accent)
    assertEquals(R.color.alarmpyo_background, style.foreground)
  }
}
