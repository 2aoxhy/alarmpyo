package expo.modules.alarmpyoalarm

internal enum class AlarmPyoWidgetHeightMode {
  MINIMUM,
  MEDIUM
}

internal data class AlarmPyoWidgetReportedSize(val widthDp: Float, val heightDp: Float)

internal data class AlarmPyoWidgetGeometry(
  val minHeightDp: Int,
  val minWidthDp: Int,
  val rowSpan: Int? = null
)

internal object AlarmPyoWidgetSizePolicy {
  const val DEFAULT_MIN_HEIGHT_DP = 56
  const val DEFAULT_MIN_WIDTH_DP = 280
  internal const val MEDIUM_HEIGHT_MIN_DP = 96
  private const val MAX_DIMENSION_DP = 10_000
  private const val MAX_GRID_SPAN = 16

  fun geometry(
    minHeightDp: Int? = null,
    minWidthDp: Int? = null,
    maxHeightDp: Int? = null,
    maxWidthDp: Int? = null,
    sizes: List<AlarmPyoWidgetReportedSize> = emptyList(),
    rowSpan: Int? = null,
    columnSpan: Int? = null
  ): AlarmPyoWidgetGeometry {
    val validSizes = sizes.filter { validDimension(it.widthDp) && validDimension(it.heightDp) }
    // appWidgetSizes lists possible portrait/landscape/folded sizes, not the
    // current size. A single RemoteViews must fit their smallest dimensions.
    val height = validSizes.minOfOrNull { it.heightDp }?.toInt()
      ?: fallbackDimension(minHeightDp, maxHeightDp, DEFAULT_MIN_HEIGHT_DP)
    val width = validSizes.minOfOrNull { it.widthDp }?.toInt()
      ?: fallbackDimension(minWidthDp, maxWidthDp, DEFAULT_MIN_WIDTH_DP)
    // Only trust the optional One UI grid hint when both grid dimensions are
    // present and plausible. Missing/invalid OEM extras use standard geometry.
    val validRowSpan = rowSpan?.takeIf {
      it in 1..MAX_GRID_SPAN && columnSpan != null && columnSpan in 1..MAX_GRID_SPAN
    }
    return AlarmPyoWidgetGeometry(height, width, validRowSpan)
  }

  fun heightMode(geometry: AlarmPyoWidgetGeometry): AlarmPyoWidgetHeightMode =
    if (geometry.rowSpan == 1) {
      // One UI's 4x1 is about 100dp tall on the verified device. Grid height
      // wins over the generic 96dp threshold, including after a 4x2 resize.
      AlarmPyoWidgetHeightMode.MINIMUM
    } else {
      heightMode(geometry.minHeightDp)
    }

  fun heightMode(minHeightDp: Int): AlarmPyoWidgetHeightMode =
    if (minHeightDp >= MEDIUM_HEIGHT_MIN_DP) {
      AlarmPyoWidgetHeightMode.MEDIUM
    } else {
      // 기존 4x1 위젯과 2행 미만으로 줄인 위젯은 계속 압축형을 사용합니다.
      AlarmPyoWidgetHeightMode.MINIMUM
    }

  private fun validDimension(value: Float): Boolean =
    value.isFinite() && value >= 1f && value <= MAX_DIMENSION_DP

  private fun fallbackDimension(minimum: Int?, maximum: Int?, fallback: Int): Int =
    listOfNotNull(minimum, maximum).filter { it in 1..MAX_DIMENSION_DP }.minOrNull()
      ?: fallback
}
