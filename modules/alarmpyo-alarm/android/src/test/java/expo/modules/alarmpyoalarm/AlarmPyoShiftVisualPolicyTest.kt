package expo.modules.alarmpyoalarm

import org.junit.Assert.assertEquals
import org.junit.Test

class AlarmPyoShiftVisualPolicyTest {
  @Test
  fun mapsBuiltInShiftRolesToSemanticNativeColors() {
    assertEquals(R.color.alarmpyo_day, AlarmPyoShiftVisualPolicy.resolve("day").background)
    assertEquals(R.color.alarmpyo_day_accent, AlarmPyoShiftVisualPolicy.resolve("day").accent)
    assertEquals(R.color.alarmpyo_evening, AlarmPyoShiftVisualPolicy.resolve("evening").background)
    assertEquals(R.color.alarmpyo_evening_accent, AlarmPyoShiftVisualPolicy.resolve("evening").accent)
    assertEquals(R.color.alarmpyo_night, AlarmPyoShiftVisualPolicy.resolve("night").background)
    assertEquals(R.color.alarmpyo_night_accent, AlarmPyoShiftVisualPolicy.resolve("night").accent)
    assertEquals(R.color.alarmpyo_off, AlarmPyoShiftVisualPolicy.resolve("off").background)
    assertEquals(R.color.alarmpyo_off_accent, AlarmPyoShiftVisualPolicy.resolve("off").accent)
  }

  @Test
  fun substituteRolesKeepTheirBaseShiftColor() {
    assertEquals(R.color.alarmpyo_day, AlarmPyoShiftVisualPolicy.resolve("substitute-day").background)
    assertEquals(R.color.alarmpyo_night, AlarmPyoShiftVisualPolicy.resolve("substitute-night").background)
    assertEquals(
      R.color.alarmpyo_substitute_accent,
      AlarmPyoShiftVisualPolicy.resolve("substitute-day").accent
    )
    assertEquals(
      R.color.alarmpyo_substitute_accent,
      AlarmPyoShiftVisualPolicy.resolve("substitute-night").accent
    )
  }

  @Test
  fun unknownRolesUseTheAccessibleBrandAccentPair() {
    val style = AlarmPyoShiftVisualPolicy.resolve("custom-role")
    assertEquals(R.color.alarmpyo_unknown, style.background)
    assertEquals(R.color.alarmpyo_accent, style.accent)
    assertEquals(R.color.alarmpyo_text_primary, style.foreground)
  }
}
