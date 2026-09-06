package expo.modules.alarmpyoalarm

import android.appwidget.AppWidgetManager
import android.os.Build
import android.os.Bundle
import android.util.SizeF

/** Optional launcher data never changes the persisted widget preferences. */
internal object AlarmPyoWidgetOptions {
  private const val ONE_UI_ROW_SPAN = "semAppWidgetRowSpan"
  private const val ONE_UI_COLUMN_SPAN = "semAppWidgetColumnSpan"

  fun geometry(options: Bundle): AlarmPyoWidgetGeometry = AlarmPyoWidgetSizePolicy.geometry(
    minHeightDp = readInt(options, AppWidgetManager.OPTION_APPWIDGET_MIN_HEIGHT),
    minWidthDp = readInt(options, AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH),
    maxHeightDp = readInt(options, AppWidgetManager.OPTION_APPWIDGET_MAX_HEIGHT),
    maxWidthDp = readInt(options, AppWidgetManager.OPTION_APPWIDGET_MAX_WIDTH),
    sizes = reportedSizes(options),
    rowSpan = readInt(options, ONE_UI_ROW_SPAN),
    columnSpan = readInt(options, ONE_UI_COLUMN_SPAN)
  )

  private fun readInt(options: Bundle, key: String): Int? =
    runCatching { if (options.containsKey(key)) options.getInt(key) else null }.getOrNull()

  @Suppress("DEPRECATION") // Android 12 supports this overload; validate every list element below.
  private fun reportedSizes(options: Bundle): List<AlarmPyoWidgetReportedSize> {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) return emptyList()
    return runCatching {
      val sizes: List<*> = options.getParcelableArrayList<SizeF>(
        AppWidgetManager.OPTION_APPWIDGET_SIZES
      ).orEmpty()
      sizes.filterIsInstance<SizeF>().map { AlarmPyoWidgetReportedSize(it.width, it.height) }
    }.getOrDefault(emptyList())
  }
}
