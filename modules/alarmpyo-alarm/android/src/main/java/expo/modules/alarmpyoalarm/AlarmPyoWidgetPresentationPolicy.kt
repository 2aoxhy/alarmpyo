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
  val titleSizeSp: Float,
  val estimatedHeightDp: Float
)

/** Standard dimensions plus an optional validated launcher grid hint. */
internal object AlarmPyoWidgetPresentationPolicy {
  const val DETAIL_SIZE_SP = 14f
  private const val LINE_HEIGHT_FACTOR = 1.25f

  fun resolve(
    state: AlarmPyoWidgetViewState,
    minHeightDp: Int,
    minWidthDp: Int,
    fontScale: Float
  ): AlarmPyoWidgetPresentation = resolve(
    state,
    AlarmPyoWidgetSizePolicy.geometry(minHeightDp = minHeightDp, minWidthDp = minWidthDp),
    fontScale
  )

  fun resolve(
    state: AlarmPyoWidgetViewState,
    geometry: AlarmPyoWidgetGeometry,
    fontScale: Float
  ): AlarmPyoWidgetPresentation {
    val height = geometry.minHeightDp
    val minWidthDp = geometry.minWidthDp
    val mode = AlarmPyoWidgetSizePolicy.heightMode(geometry)
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
    var next = if (compact) {
      sections.firstOrNull { it.kind == AlarmPyoWidgetSectionKind.NEXT_WORK }
        ?: sections.firstOrNull { it.kind == AlarmPyoWidgetSectionKind.GENERIC }
    } else {
      sections.firstOrNull()
    }
    var alarm = if (!compact && !veryLargeText) sections.getOrNull(1) else null
    var schedule = if (compact) !largeText else !veryLargeText
    // A centered single column gives the primary the full width. Long custom
    // names may ellipsize at 16sp; the root description keeps the full text.
    val preferredTitleSize = if (compact) 24f else 32f
    val titleUnits = state.titleText.sumOf { character ->
      when {
        character.isWhitespace() -> 0.35
        character.code < 128 -> 0.6
        else -> 1.0
      }
    }.toFloat().coerceAtLeast(1f)
    val availableWidth = (minWidthDp - 44).coerceAtLeast(1)
    var titleSize = kotlin.math.floor(availableWidth / (titleUnits * scale))
      .coerceIn(16f, preferredTitleSize)
    var date = !compact
    // Match the XML's symmetric card padding, root inset and row margins.
    // Center the entire measured group instead of stretching its middle row.
    val verticalInsets = if (compact) 16f else 28f
    fun estimatedHeight(): Float = verticalInsets +
      titleSize * scale * LINE_HEIGHT_FACTOR +
      (if (date) 12f * scale * LINE_HEIGHT_FACTOR + 6f else 0f) +
      (if (schedule) DETAIL_SIZE_SP * scale * LINE_HEIGHT_FACTOR + 3f else 0f) +
      (if (next != null) DETAIL_SIZE_SP * scale * LINE_HEIGHT_FACTOR + 4f else 0f) +
      (if (alarm != null) DETAIL_SIZE_SP * scale * LINE_HEIGHT_FACTOR + 4f else 0f)
    if (estimatedHeight() > height) alarm = null
    if (estimatedHeight() > height) schedule = false
    if (estimatedHeight() > height) date = false
    if (estimatedHeight() > height) next = null
    if (estimatedHeight() > height) {
      titleSize = kotlin.math.floor((height - verticalInsets) / (scale * LINE_HEIGHT_FACTOR))
        .coerceIn(12f, titleSize)
    }
    return AlarmPyoWidgetPresentation(
      heightMode = mode,
      nextSection = next,
      alarmSection = alarm,
      showDate = date,
      showStatus = date && !veryLargeText && minWidthDp >= 300,
      showSchedule = schedule,
      titleSizeSp = titleSize,
      estimatedHeightDp = estimatedHeight()
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
