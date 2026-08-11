package expo.modules.alarmpyoalarm

import android.app.AlarmManager
import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.util.TypedValue
import android.view.View
import android.widget.RemoteViews

class AlarmPyoShiftWidgetProvider : AppWidgetProvider() {
  override fun onEnabled(context: Context) {
    super.onEnabled(context)
    AlarmPyoShiftWidgetUpdater.updateAll(context)
  }

  override fun onUpdate(
    context: Context,
    appWidgetManager: AppWidgetManager,
    appWidgetIds: IntArray
  ) {
    AlarmPyoShiftWidgetUpdater.update(context, appWidgetManager, appWidgetIds)
  }

  override fun onAppWidgetOptionsChanged(
    context: Context,
    appWidgetManager: AppWidgetManager,
    appWidgetId: Int,
    newOptions: Bundle
  ) {
    super.onAppWidgetOptionsChanged(context, appWidgetManager, appWidgetId, newOptions)
    AlarmPyoShiftWidgetUpdater.update(context, appWidgetManager, intArrayOf(appWidgetId))
  }

  override fun onReceive(context: Context, intent: Intent) {
    super.onReceive(context, intent)
    if (intent.action == ACTION_REFRESH_ALARMPYO_WIDGET) {
      AlarmPyoShiftWidgetUpdater.updateAll(context)
    }
  }

  override fun onDisabled(context: Context) {
    AlarmPyoShiftWidgetUpdater.cancelRefresh(context)
    super.onDisabled(context)
  }
}

internal const val ACTION_REFRESH_ALARMPYO_WIDGET =
  "expo.modules.alarmpyoalarm.action.REFRESH_WIDGET"

internal object AlarmPyoShiftWidgetUpdater {
  private const val REFRESH_REQUEST_CODE = 0x485457
  private const val OPEN_REQUEST_CODE = 0x485458
  private const val REFRESH_WINDOW_MILLIS = 60L * 1_000L

  fun isInstalled(context: Context): Boolean {
    val applicationContext = context.applicationContext
    return AppWidgetManager.getInstance(applicationContext).getAppWidgetIds(
      ComponentName(applicationContext, AlarmPyoShiftWidgetProvider::class.java)
    ).isNotEmpty()
  }

  fun requestPin(context: Context): Map<String, Any> {
    if (isInstalled(context)) {
      return pinResult("installed", supported = true, installed = true)
    }
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
      return pinResult("unsupported", supported = false, installed = false)
    }

    val applicationContext = context.applicationContext
    val manager = AppWidgetManager.getInstance(applicationContext)
    val provider = ComponentName(applicationContext, AlarmPyoShiftWidgetProvider::class.java)
    val providerRegistered = manager.installedProviders.any { info ->
      info.provider == provider
    }
    if (!providerRegistered) {
      return pinResult("missing", supported = false, installed = false)
    }
    if (!manager.isRequestPinAppWidgetSupported) {
      return pinResult("unsupported", supported = false, installed = false)
    }

    return try {
      val requested = manager.requestPinAppWidget(provider, null, null)
      pinResult(
        if (requested) "requested" else "failed",
        supported = true,
        installed = false
      )
    } catch (_: IllegalStateException) {
      pinResult("failed", supported = true, installed = false)
    } catch (_: SecurityException) {
      pinResult("failed", supported = true, installed = false)
    }
  }

  private fun pinResult(
    status: String,
    supported: Boolean,
    installed: Boolean
  ): Map<String, Any> = mapOf(
    "status" to status,
    "supported" to supported,
    "installed" to installed
  )

  fun updateAll(context: Context) {
    val applicationContext = context.applicationContext
    val manager = AppWidgetManager.getInstance(applicationContext)
    val ids = manager.getAppWidgetIds(
      ComponentName(applicationContext, AlarmPyoShiftWidgetProvider::class.java)
    )
    update(applicationContext, manager, ids)
  }

  fun update(
    context: Context,
    manager: AppWidgetManager,
    ids: IntArray
  ) {
    if (ids.isEmpty()) {
      cancelRefresh(context)
      return
    }

    val nowMillis = System.currentTimeMillis()
    val snapshot = AlarmPyoWidgetStore.read(context) ?: AlarmPyoWidgetSnapshot(
      generatedAt = 0L,
      setupCompleted = false,
      entries = emptyList()
    )
    val state = AlarmPyoWidgetFormatter.format(snapshot, nowMillis)
    val fontScale = context.resources.configuration.fontScale
    ids.forEach { widgetId ->
      val minHeightDp = manager.getAppWidgetOptions(widgetId).getInt(
        AppWidgetManager.OPTION_APPWIDGET_MIN_HEIGHT,
        AlarmPyoWidgetSizePolicy.DEFAULT_MIN_HEIGHT_DP
      )
      val heightMode = AlarmPyoWidgetSizePolicy.heightMode(minHeightDp)
      val views = RemoteViews(context.packageName, R.layout.alarmpyo_shift_widget_compact)
      bindState(views, state, fontScale, heightMode)
      views.setOnClickPendingIntent(R.id.alarmpyo_widget_root, openAppIntent(context))
      manager.updateAppWidget(widgetId, views)
    }

    val refreshAt = state.nextRefreshAt
    if (refreshAt == null) cancelRefresh(context) else scheduleRefresh(context, refreshAt)
  }

  private fun bindState(
    views: RemoteViews,
    state: AlarmPyoWidgetViewState,
    fontScale: Float,
    heightMode: AlarmPyoWidgetHeightMode
  ) {
    val minimumHeight = heightMode == AlarmPyoWidgetHeightMode.MINIMUM
    val largeText = fontScale >= 1.3f
    val veryLargeText = fontScale >= 1.8f
    views.setTextViewText(R.id.alarmpyo_widget_date, compactDateText(state.dateText))
    views.setTextViewText(R.id.alarmpyo_widget_title, state.titleText)
    views.setTextViewText(R.id.alarmpyo_widget_schedule, state.scheduleText)
    val hasSecondary = state.bottomLabel.isNotBlank()
    val hasTertiary =
      !state.secondaryLabel.isNullOrBlank() && !state.secondaryText.isNullOrBlank()
    views.setTextViewText(R.id.alarmpyo_widget_bottom_label, state.bottomLabel)
    views.setTextViewText(
      R.id.alarmpyo_widget_bottom_value,
      if (minimumHeight || (hasTertiary && !largeText)) {
        compactWidgetLine(state.bottomLabel, state.bottomText)
      } else {
        state.bottomText
      }
    )
    views.setViewVisibility(
      R.id.alarmpyo_widget_date,
      if (minimumHeight || largeText) View.GONE else View.VISIBLE
    )
    views.setViewVisibility(
      R.id.alarmpyo_widget_schedule,
      if (minimumHeight || veryLargeText) View.GONE else View.VISIBLE
    )
    views.setViewVisibility(
      R.id.alarmpyo_widget_secondary_panel,
      if (hasSecondary) View.VISIBLE else View.GONE
    )
    views.setViewVisibility(
      R.id.alarmpyo_widget_secondary_divider,
      if (!minimumHeight && hasTertiary && !largeText) View.VISIBLE else View.GONE
    )
    views.setViewVisibility(
      R.id.alarmpyo_widget_secondary_second,
      if (!minimumHeight && hasTertiary && !largeText) View.VISIBLE else View.GONE
    )
    views.setViewVisibility(
      R.id.alarmpyo_widget_bottom_label,
      if (minimumHeight || hasTertiary || largeText) View.GONE else View.VISIBLE
    )
    views.setViewVisibility(
      R.id.alarmpyo_widget_secondary_label,
      View.GONE
    )
    views.setTextViewText(R.id.alarmpyo_widget_secondary_label, state.secondaryLabel.orEmpty())
    views.setTextViewText(
      R.id.alarmpyo_widget_secondary_value,
      if (hasTertiary) {
        compactWidgetLine(state.secondaryLabel.orEmpty(), state.secondaryText.orEmpty())
      } else {
        state.secondaryText.orEmpty()
      }
    )
    views.setTextViewTextSize(
      R.id.alarmpyo_widget_title,
      TypedValue.COMPLEX_UNIT_SP,
      if (largeText) 14f else 16f
    )
    views.setTextViewTextSize(
      R.id.alarmpyo_widget_bottom_label,
      TypedValue.COMPLEX_UNIT_SP,
      12f
    )
    views.setTextViewTextSize(
      R.id.alarmpyo_widget_bottom_value,
      TypedValue.COMPLEX_UNIT_SP,
      if (hasTertiary) 12f else 14f
    )
    views.setTextViewTextSize(
      R.id.alarmpyo_widget_secondary_value,
      TypedValue.COMPLEX_UNIT_SP,
      12f
    )
    views.setContentDescription(R.id.alarmpyo_widget_root, state.contentDescription)

    val assets = visualAssets(state.visual)
    views.setInt(R.id.alarmpyo_widget_card, "setBackgroundResource", assets.background)
    views.setImageViewResource(R.id.alarmpyo_widget_shift_icon, assets.icon)
  }

  private fun compactDateText(dateText: String): String =
    dateText.substringAfter("년 ", dateText)

  private fun compactWidgetLine(label: String, text: String): String {
    val compactLabel = when (label) {
      "다음 근무" -> "다음"
      "다음 알람" -> "알람"
      else -> label
    }
    return if (compactLabel.isBlank()) text else "$compactLabel · $text"
  }

  private fun visualAssets(visual: AlarmPyoWidgetVisual): WidgetVisualAssets = when (visual) {
    AlarmPyoWidgetVisual.DAY -> WidgetVisualAssets(
      R.drawable.alarmpyo_widget_day_background,
      R.drawable.alarmpyo_widget_ic_sun
    )
    AlarmPyoWidgetVisual.NIGHT -> WidgetVisualAssets(
      R.drawable.alarmpyo_widget_night_background,
      R.drawable.alarmpyo_widget_ic_moon
    )
    AlarmPyoWidgetVisual.TRAINING -> WidgetVisualAssets(
      R.drawable.alarmpyo_widget_training_background,
      R.drawable.alarmpyo_widget_ic_training
    )
    AlarmPyoWidgetVisual.RESERVE -> WidgetVisualAssets(
      R.drawable.alarmpyo_widget_reserve_background,
      R.drawable.alarmpyo_widget_ic_reserve
    )
    AlarmPyoWidgetVisual.OFF -> WidgetVisualAssets(
      R.drawable.alarmpyo_widget_off_background,
      R.drawable.alarmpyo_widget_ic_off
    )
    AlarmPyoWidgetVisual.UNKNOWN -> WidgetVisualAssets(
      R.drawable.alarmpyo_widget_unknown_background,
      R.drawable.alarmpyo_widget_ic_unknown
    )
  }

  private fun openAppIntent(context: Context): PendingIntent {
    val launchIntent = context.packageManager.getLaunchIntentForPackage(context.packageName)
      ?: Intent(Intent.ACTION_VIEW, Uri.parse("alarmpyo:///"))
    launchIntent.apply {
      action = Intent.ACTION_VIEW
      data = Uri.parse("alarmpyo:///")
      setPackage(context.packageName)
      addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
    }
    return PendingIntent.getActivity(
      context,
      OPEN_REQUEST_CODE,
      launchIntent,
      PendingIntent.FLAG_UPDATE_CURRENT or immutableFlag()
    )
  }

  private fun scheduleRefresh(context: Context, refreshAt: Long) {
    val now = System.currentTimeMillis()
    if (refreshAt <= now) {
      cancelRefresh(context)
      return
    }
    val alarmManager = context.getSystemService(AlarmManager::class.java)
    val pendingIntent = refreshPendingIntent(context)
    if (AlarmPyoAlarmPermissions.exactAlarmAllowed(context)) {
      try {
        alarmManager.setExact(AlarmManager.RTC, refreshAt, pendingIntent)
        return
      } catch (_: SecurityException) {
        // 권한이 확인 직후 변경되면 아래의 짧은 비정확 창으로 안전하게 대체합니다.
      }
    }
    alarmManager.setWindow(
      AlarmManager.RTC,
      refreshAt,
      REFRESH_WINDOW_MILLIS,
      pendingIntent
    )
  }

  fun cancelRefresh(context: Context) {
    val alarmManager = context.getSystemService(AlarmManager::class.java)
    alarmManager.cancel(refreshPendingIntent(context))
  }

  private fun refreshPendingIntent(context: Context): PendingIntent = PendingIntent.getBroadcast(
    context,
    REFRESH_REQUEST_CODE,
    Intent(context, AlarmPyoShiftWidgetProvider::class.java).apply {
      action = ACTION_REFRESH_ALARMPYO_WIDGET
    },
    PendingIntent.FLAG_UPDATE_CURRENT or immutableFlag()
  )

  private fun immutableFlag(): Int =
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) PendingIntent.FLAG_IMMUTABLE else 0

  private data class WidgetVisualAssets(
    val background: Int,
    val icon: Int
  )
}
