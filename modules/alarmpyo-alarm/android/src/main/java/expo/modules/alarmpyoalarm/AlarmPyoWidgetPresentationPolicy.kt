package expo.modules.alarmpyoalarm

internal data class AlarmPyoWidgetSection(
  val kind: AlarmPyoWidgetSectionKind,
  val label: String,
  val text: String
)

internal data class AlarmPyoWidgetPresentation(
  val heightMode: AlarmPyoWidgetHeightMode,
  val nextSection: AlarmPyoWidgetSection?,
  val alarmSection: AlarmPyoWidgetSection?,
  val showDate: Boolean,
  val showStatus: Boolean,
  val showSchedule: Boolean,
  val showSectionLabels: Boolean,
  val titleSizeSp: Float,
  val nextMaxLines: Int
)

/** Layout decisions use the space reported by the launcher, not its cell label. */
internal object AlarmPyoWidgetPresentationPolicy {
  fun resolve(
    state: AlarmPyoWidgetViewState,
    minHeightDp: Int,
    minWidthDp: Int,
    fontScale: Float
  ): AlarmPyoWidgetPresentation {
    val height = minHeightDp.coerceAtLeast(AlarmPyoWidgetSizePolicy.DEFAULT_MIN_HEIGHT_DP)
    val mode = AlarmPyoWidgetSizePolicy.heightMode(height)
    val compact = mode == AlarmPyoWidgetHeightMode.MINIMUM
    val scale = fontScale.takeIf { it.isFinite() && it > 0f } ?: 1f
    val largeText = scale >= 1.3f
    val veryLargeText = scale >= 1.8f
    val sections = listOfNotNull(
      section(state.bottomSectionKind, state.bottomLabel, state.bottomText),
      section(state.secondarySectionKind, state.secondaryLabel, state.secondaryText)
    )
    // The configured primary stays intact, including an existing alarm-only
    // selection. A compact work widget does not append a second alarm block.
    val next = if (compact) {
      sections.firstOrNull { it.kind == AlarmPyoWidgetSectionKind.NEXT_WORK }
        ?: sections.firstOrNull { it.kind == AlarmPyoWidgetSectionKind.GENERIC }
    } else {
      sections.firstOrNull()
    }
    var alarm = if (!compact && !veryLargeText) sections.getOrNull(1) else null
    var schedule = if (compact) !largeText else !veryLargeText
    var titleSize = when {
      veryLargeText || minWidthDp < 260 -> 14f
      compact || largeText -> 16f
      else -> 18f
    }
    var date = !compact

    if (!compact) {
      // includeFontPadding=false still needs ascent/descent room. Remove lower
      // priority rows before changing the title size; never reduce below 12sp.
      fun estimatedHeight(): Float =
        (titleSize + (if (date) 12f else 0f) +
          (if (schedule) 12f else 0f) + (if (next != null) 12f else 0f) +
          (if (alarm != null) 12f else 0f)) * scale * 1.2f + 8f
      if (estimatedHeight() > height) alarm = null
      if (estimatedHeight() > height) schedule = false
      if (estimatedHeight() > height) titleSize = 12f
      if (estimatedHeight() > height) date = false
    }

    val sectionLabels = !largeText && minWidthDp >= 280
    val nextLines = if (compact && !sectionLabels) {
      ((height - 12f) / (12f * scale * 1.2f)).toInt().coerceIn(1, 2)
    } else 1
    return AlarmPyoWidgetPresentation(
      heightMode = mode,
      nextSection = next,
      alarmSection = alarm,
      showDate = date,
      showStatus = !compact && !veryLargeText,
      showSchedule = schedule,
      showSectionLabels = sectionLabels,
      titleSizeSp = titleSize,
      nextMaxLines = nextLines
    )
  }

  private fun section(
    kind: AlarmPyoWidgetSectionKind,
    label: String?,
    text: String?
  ): AlarmPyoWidgetSection? =
    if (label.isNullOrBlank() || text.isNullOrBlank()) null
    else AlarmPyoWidgetSection(kind, label, text)
}
