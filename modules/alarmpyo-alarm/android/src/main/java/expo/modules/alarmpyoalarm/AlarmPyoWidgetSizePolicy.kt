package expo.modules.alarmpyoalarm

internal enum class AlarmPyoWidgetHeightMode {
  MINIMUM,
  MEDIUM
}

internal object AlarmPyoWidgetSizePolicy {
  const val DEFAULT_MIN_HEIGHT_DP = 56
  internal const val MEDIUM_HEIGHT_MIN_DP = 96

  fun heightMode(minHeightDp: Int): AlarmPyoWidgetHeightMode =
    if (minHeightDp >= MEDIUM_HEIGHT_MIN_DP) {
      AlarmPyoWidgetHeightMode.MEDIUM
    } else {
      // 기존 4x1 위젯과 2행 미만으로 줄인 위젯은 계속 압축형을 사용합니다.
      AlarmPyoWidgetHeightMode.MINIMUM
    }
}
