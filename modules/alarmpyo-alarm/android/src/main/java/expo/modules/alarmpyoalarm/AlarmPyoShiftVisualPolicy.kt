package expo.modules.alarmpyoalarm

import androidx.annotation.ColorRes

internal data class AlarmPyoShiftVisualStyle(
  @ColorRes val background: Int,
  @ColorRes val accent: Int,
  @ColorRes val foreground: Int
)

/**
 * Keeps native alarm shift semantics aligned with the React design system
 * without changing the persisted shift or alarm wire contracts.
 */
internal object AlarmPyoShiftVisualPolicy {
  fun resolve(shiftTypeId: String): AlarmPyoShiftVisualStyle {
    val background = when (shiftTypeId) {
      "day", "substitute-day" -> R.color.alarmpyo_day
      "evening" -> R.color.alarmpyo_evening
      "night", "substitute-night" -> R.color.alarmpyo_night
      "exception-training" -> R.color.alarmpyo_training
      "exception-reserve" -> R.color.alarmpyo_reserve
      "off" -> R.color.alarmpyo_off
      "substitute" -> R.color.alarmpyo_unknown
      else -> R.color.alarmpyo_unknown
    }
    val accent = when (shiftTypeId) {
      "day" -> R.color.alarmpyo_day_accent
      "evening" -> R.color.alarmpyo_evening_accent
      "night" -> R.color.alarmpyo_night_accent
      "substitute-day", "substitute-night", "substitute" ->
        R.color.alarmpyo_substitute_accent
      "off" -> R.color.alarmpyo_off_accent
      else -> R.color.alarmpyo_accent
    }
    return AlarmPyoShiftVisualStyle(
      background = background,
      accent = accent,
      foreground = R.color.alarmpyo_text_primary
    )
  }
}
