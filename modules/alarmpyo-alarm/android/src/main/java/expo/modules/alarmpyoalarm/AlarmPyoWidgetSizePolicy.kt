package expo.modules.alarmpyoalarm

internal enum class AlarmPyoWidgetHeightMode {
  MINIMUM,
  REGULAR
}

internal object AlarmPyoWidgetSizePolicy {
  const val DEFAULT_MIN_HEIGHT_DP = 56
  private const val MINIMUM_HEIGHT_MAX_DP = 64

  fun heightMode(minHeightDp: Int): AlarmPyoWidgetHeightMode =
    if (minHeightDp <= MINIMUM_HEIGHT_MAX_DP) {
      AlarmPyoWidgetHeightMode.MINIMUM
    } else {
      AlarmPyoWidgetHeightMode.REGULAR
    }
}
