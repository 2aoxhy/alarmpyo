package expo.modules.alarmpyoalarm

import android.app.AlarmManager
import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.util.TypedValue
import android.view.View
import android.widget.RemoteViews
import androidx.core.content.ContextCompat

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
    val nowMillis = System.currentTimeMillis()
    val storedSnapshot = runCatching { AlarmPyoWidgetStore.read(context) }.getOrNull()
    updateGeneratedPreview(context, storedSnapshot, nowMillis)
    if (ids.isEmpty()) {
      cancelRefresh(context)
      return
    }

    val snapshot = storedSnapshot ?: AlarmPyoWidgetSnapshot(
      generatedAt = 0L,
      setupCompleted = false,
      entries = emptyList()
    )
    val state = AlarmPyoWidgetFormatter.format(snapshot, nowMillis)
    val fontScale = context.resources.configuration.fontScale
    ids.forEach { widgetId ->
      val options = manager.getAppWidgetOptions(widgetId)
      val geometry = AlarmPyoWidgetOptions.geometry(options)
      val presentation = AlarmPyoWidgetPresentationPolicy.resolve(
        state, geometry, fontScale
      )
      val views = createRemoteViews(context, state, presentation)
      views.setOnClickPendingIntent(R.id.alarmpyo_widget_root, openAppIntent(context))
      manager.updateAppWidget(widgetId, views)
    }

    val refreshAt = state.nextRefreshAt
    if (refreshAt == null) cancelRefresh(context) else scheduleRefresh(context, refreshAt)
  }

  /**
   * Pushes a personalized picker preview on Android 15+. This is deliberately
   * fail-soft: a launcher/API problem must never turn a successful schedule save
   * or an installed widget refresh into a failure.
   */
  fun updateGeneratedPreview(
    context: Context,
    snapshot: AlarmPyoWidgetSnapshot?,
    nowMillis: Long = System.currentTimeMillis()
  ): AlarmPyoWidgetPreviewUpdateResult = try {
    updateGeneratedPreviewSafely(context, snapshot, nowMillis)
  } catch (_: Exception) {
    AlarmPyoWidgetPreviewUpdateResult.FAILED
  } catch (_: LinkageError) {
    AlarmPyoWidgetPreviewUpdateResult.FAILED
  }

  private fun updateGeneratedPreviewSafely(
    context: Context,
    snapshot: AlarmPyoWidgetSnapshot?,
    nowMillis: Long
  ): AlarmPyoWidgetPreviewUpdateResult {
    val applicationContext = context.applicationContext
    val fontScale = applicationContext.resources.configuration.fontScale
    val state = snapshot?.let { AlarmPyoWidgetFormatter.format(it, nowMillis) }
    val signature = state?.let { AlarmPyoWidgetPreviewPolicy.signature(it, fontScale) }
    val decision = AlarmPyoWidgetPreviewPolicy.decide(
      sdkInt = Build.VERSION.SDK_INT,
      hasSnapshot = snapshot != null,
      signature = signature,
      storedSignature = AlarmPyoWidgetPreviewStateStore.signature(applicationContext),
      lastAttemptAt = AlarmPyoWidgetPreviewStateStore.lastAttemptAt(applicationContext),
      nowMillis = nowMillis
    )
    when (decision) {
      AlarmPyoWidgetPreviewDecision.UNSUPPORTED ->
        return AlarmPyoWidgetPreviewUpdateResult.UNSUPPORTED
      AlarmPyoWidgetPreviewDecision.NO_DATA ->
        return AlarmPyoWidgetPreviewUpdateResult.NO_DATA
      AlarmPyoWidgetPreviewDecision.UNCHANGED ->
        return AlarmPyoWidgetPreviewUpdateResult.UNCHANGED
      AlarmPyoWidgetPreviewDecision.DEFERRED ->
        return AlarmPyoWidgetPreviewUpdateResult.DEFERRED
      AlarmPyoWidgetPreviewDecision.UPDATE -> Unit
    }

    val previewState = state ?: return AlarmPyoWidgetPreviewUpdateResult.NO_DATA
    val previewSignature = signature ?: return AlarmPyoWidgetPreviewUpdateResult.NO_DATA
    AlarmPyoWidgetPreviewStateStore.recordAttempt(applicationContext, nowMillis)
    val preview = createRemoteViews(
      applicationContext,
      previewState,
      AlarmPyoWidgetPresentationPolicy.resolve(
        previewState,
        AlarmPyoWidgetSizePolicy.DEFAULT_MIN_HEIGHT_DP,
        AlarmPyoWidgetSizePolicy.DEFAULT_MIN_WIDTH_DP,
        fontScale
      )
    )
    val updated = setGeneratedPreview(applicationContext, preview)
    if (!updated) return AlarmPyoWidgetPreviewUpdateResult.RATE_LIMITED

    AlarmPyoWidgetPreviewStateStore.recordSuccess(
      applicationContext,
      previewSignature,
      nowMillis
    )
    return AlarmPyoWidgetPreviewUpdateResult.UPDATED
  }

  @android.annotation.TargetApi(AlarmPyoWidgetPreviewPolicy.MIN_SUPPORTED_API)
  private fun setGeneratedPreview(context: Context, preview: RemoteViews): Boolean =
    AppWidgetManager.getInstance(context).setWidgetPreview(
      ComponentName(context, AlarmPyoShiftWidgetProvider::class.java),
      android.appwidget.AppWidgetProviderInfo.WIDGET_CATEGORY_HOME_SCREEN,
      preview
    )

  private fun createRemoteViews(
    context: Context,
    state: AlarmPyoWidgetViewState,
    presentation: AlarmPyoWidgetPresentation
  ): RemoteViews {
    val layout = when (presentation.heightMode) {
      AlarmPyoWidgetHeightMode.MINIMUM -> R.layout.alarmpyo_shift_widget_compact
      AlarmPyoWidgetHeightMode.MEDIUM -> R.layout.alarmpyo_shift_widget_medium
    }
    return RemoteViews(context.packageName, layout).also { views ->
      bindState(context, views, state, presentation)
    }
  }

  private fun bindState(
    context: Context,
    views: RemoteViews,
    state: AlarmPyoWidgetViewState,
    presentation: AlarmPyoWidgetPresentation
  ) {
    val mediumHeight = presentation.heightMode == AlarmPyoWidgetHeightMode.MEDIUM
    val next = presentation.nextSection
    val alarm = presentation.alarmSection
    val showSectionLabels = presentation.showSectionLabels
    views.setTextViewText(
      R.id.alarmpyo_widget_date,
      compactDateText(state.dateText)
    )
    views.setTextViewText(R.id.alarmpyo_widget_title, state.titleText)
    views.setTextViewText(R.id.alarmpyo_widget_schedule, state.scheduleText)
    if (mediumHeight) {
      views.setTextViewText(R.id.alarmpyo_widget_status, state.statusText)
      views.setTextViewTextSize(
        R.id.alarmpyo_widget_status,
        TypedValue.COMPLEX_UNIT_SP,
        12f
      )
      views.setViewVisibility(
        R.id.alarmpyo_widget_status,
        if (presentation.showStatus) View.VISIBLE else View.GONE
      )
    }
    views.setTextViewText(R.id.alarmpyo_widget_bottom_label, next?.label.orEmpty())
    views.setTextViewText(
      R.id.alarmpyo_widget_bottom_value,
      if (next != null && !showSectionLabels) {
        compactWidgetLine(next.kind, next.label, next.text)
      } else {
        next?.text.orEmpty()
      }
    )
    views.setViewVisibility(
      R.id.alarmpyo_widget_date,
      if (presentation.showDate) View.VISIBLE else View.GONE
    )
    views.setViewVisibility(
      R.id.alarmpyo_widget_schedule,
      if (presentation.showSchedule) View.VISIBLE else View.GONE
    )
    views.setViewVisibility(
      R.id.alarmpyo_widget_secondary_panel,
      if (next != null) View.VISIBLE else View.GONE
    )
    views.setViewVisibility(
      R.id.alarmpyo_widget_primary_divider,
      if (next != null) View.VISIBLE else View.GONE
    )
    views.setViewVisibility(
      R.id.alarmpyo_widget_secondary_divider,
      View.GONE
    )
    views.setViewVisibility(
      R.id.alarmpyo_widget_secondary_second,
      if (alarm != null) View.VISIBLE else View.GONE
    )
    views.setViewVisibility(
      R.id.alarmpyo_widget_bottom_label,
      if (next != null && showSectionLabels) View.VISIBLE else View.GONE
    )
    views.setViewVisibility(
      R.id.alarmpyo_widget_secondary_label,
      if (alarm != null && showSectionLabels) View.VISIBLE else View.GONE
    )
    views.setTextViewText(R.id.alarmpyo_widget_secondary_label, alarm?.label.orEmpty())
    views.setTextViewText(
      R.id.alarmpyo_widget_secondary_value,
      if (alarm != null && !showSectionLabels) {
        compactWidgetLine(alarm.kind, alarm.label, alarm.text)
      } else {
        alarm?.text.orEmpty()
      }
    )
    views.setTextViewTextSize(
      R.id.alarmpyo_widget_title,
      TypedValue.COMPLEX_UNIT_SP,
      presentation.titleSizeSp
    )
    views.setTextViewTextSize(
      R.id.alarmpyo_widget_date,
      TypedValue.COMPLEX_UNIT_SP,
      12f
    )
    views.setTextViewTextSize(
      R.id.alarmpyo_widget_schedule,
      TypedValue.COMPLEX_UNIT_SP,
      12f
    )
    views.setTextViewTextSize(
      R.id.alarmpyo_widget_bottom_label,
      TypedValue.COMPLEX_UNIT_SP,
      12f
    )
    views.setTextViewTextSize(
      R.id.alarmpyo_widget_bottom_value,
      TypedValue.COMPLEX_UNIT_SP,
      12f
    )
    views.setTextViewTextSize(
      R.id.alarmpyo_widget_secondary_value,
      TypedValue.COMPLEX_UNIT_SP,
      12f
    )
    views.setInt(R.id.alarmpyo_widget_bottom_value, "setMaxLines", presentation.nextMaxLines)
    views.setContentDescription(R.id.alarmpyo_widget_root, state.contentDescription)

    val assets = visualAssets(state.visual)
    val meaningAccent = meaningAccent(context, state, assets)
    views.setInt(
      R.id.alarmpyo_widget_card,
      "setBackgroundResource",
      R.drawable.alarmpyo_widget_background
    )
    views.setInt(R.id.alarmpyo_widget_meaning_line, "setBackgroundColor", meaningAccent)
    if (mediumHeight) {
      val statusTextColor = if (state.visual == AlarmPyoWidgetVisual.CUSTOM) {
        ContextCompat.getColor(context, R.color.alarmpyo_text_primary)
      } else {
        meaningAccent
      }
      views.setTextColor(R.id.alarmpyo_widget_status, statusTextColor)
    }
  }

  private fun compactDateText(dateText: String): String =
    dateText.substringAfter("년 ", dateText)

  private fun compactWidgetLine(
    sectionKind: AlarmPyoWidgetSectionKind,
    label: String,
    text: String
  ): String {
    val compactLabel = when (sectionKind) {
      AlarmPyoWidgetSectionKind.NEXT_WORK -> "다음"
      AlarmPyoWidgetSectionKind.NEXT_ALARM -> "알람"
      else -> label
    }
    return if (compactLabel.isBlank()) text else "$compactLabel · $text"
  }

  private fun visualAssets(visual: AlarmPyoWidgetVisual): WidgetVisualAssets = when (visual) {
    AlarmPyoWidgetVisual.DAY -> WidgetVisualAssets(R.color.alarmpyo_widget_icon_day)
    AlarmPyoWidgetVisual.EVENING -> WidgetVisualAssets(R.color.alarmpyo_widget_icon_evening)
    AlarmPyoWidgetVisual.NIGHT -> WidgetVisualAssets(R.color.alarmpyo_widget_icon_night)
    AlarmPyoWidgetVisual.SUBSTITUTE_DAY -> WidgetVisualAssets(R.color.alarmpyo_substitute_accent)
    AlarmPyoWidgetVisual.SUBSTITUTE_NIGHT -> WidgetVisualAssets(R.color.alarmpyo_substitute_accent)
    AlarmPyoWidgetVisual.CUSTOM -> WidgetVisualAssets(R.color.alarmpyo_widget_icon_custom)
    AlarmPyoWidgetVisual.TRAINING -> WidgetVisualAssets(R.color.alarmpyo_widget_icon_training)
    AlarmPyoWidgetVisual.RESERVE -> WidgetVisualAssets(R.color.alarmpyo_widget_icon_reserve)
    AlarmPyoWidgetVisual.OFF -> WidgetVisualAssets(R.color.alarmpyo_widget_icon_off)
    AlarmPyoWidgetVisual.UNKNOWN -> WidgetVisualAssets(R.color.alarmpyo_widget_icon_unknown)
  }

  private fun meaningAccent(
    context: Context,
    state: AlarmPyoWidgetViewState,
    assets: WidgetVisualAssets
  ): Int {
    if (state.visual != AlarmPyoWidgetVisual.CUSTOM) return context.getColor(assets.accent)
    val candidate = state.accentColor
      ?.takeIf { CUSTOM_ACCENT_REGEX.matches(it) }
      ?.let { runCatching { Color.parseColor(it) }.getOrNull() }
    if (candidate != null) {
      val background = context.getColor(R.color.alarmpyo_widget_card_background)
      if (contrastRatio(candidate, background) >= 3.0) return candidate
    }
    return context.getColor(R.color.alarmpyo_widget_icon_custom)
  }

  private fun contrastRatio(first: Int, second: Int): Double {
    val brighter = maxOf(relativeLuminance(first), relativeLuminance(second))
    val darker = minOf(relativeLuminance(first), relativeLuminance(second))
    return (brighter + 0.05) / (darker + 0.05)
  }

  private fun relativeLuminance(color: Int): Double {
    fun channel(value: Int): Double {
      val normalized = value / 255.0
      return if (normalized <= 0.04045) {
        normalized / 12.92
      } else {
        Math.pow((normalized + 0.055) / 1.055, 2.4)
      }
    }
    return channel(Color.red(color)) * 0.2126 +
      channel(Color.green(color)) * 0.7152 +
      channel(Color.blue(color)) * 0.0722
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

  private data class WidgetVisualAssets(val accent: Int)

  private val CUSTOM_ACCENT_REGEX = Regex("^#[0-9A-Fa-f]{6}$")
}
