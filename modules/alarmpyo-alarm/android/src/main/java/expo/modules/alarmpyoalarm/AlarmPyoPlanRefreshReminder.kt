package expo.modules.alarmpyoalarm

import android.app.AlarmManager
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Build
import java.util.concurrent.TimeUnit

internal const val ACTION_REMIND_ALARM_PLAN_REFRESH =
  "expo.modules.alarmpyoalarm.action.REMIND_ALARM_PLAN_REFRESH"

internal data class AlarmPyoAlarmPlanCoverage(
  val plannedThroughAt: Long,
  val refreshRecommendedAt: Long,
  val refreshReminderPending: Boolean,
  val generatedAt: Long = 0L
)

internal enum class AlarmPyoNotificationPostResult {
  POSTED,
  BLOCKED,
  FAILED
}

/**
 * 366일 안전 계획은 그대로 보관하고 90일 뒤 갱신을 한 번 권장해요.
 * 메타데이터가 없는 이전 APK 호출은 계획 만료 14일 전 안내를 유지해 호환해요.
 */
internal object AlarmPyoPlanRefreshReminder {
  internal val REFRESH_LEAD_MILLIS: Long = TimeUnit.DAYS.toMillis(14)
  internal val MINIMUM_PLAN_SPAN_MILLIS: Long = TimeUnit.DAYS.toMillis(30)
  private val MINIMUM_TRIGGER_DELAY_MILLIS: Long = TimeUnit.MINUTES.toMillis(15)
  internal val BLOCKED_RECHECK_DELAY_MILLIS: Long = TimeUnit.DAYS.toMillis(1)
  private const val REQUEST_CODE = 0x485250
  private const val NOTIFICATION_ID = 0x485252
  private const val CHANNEL_ID = "alarmpyo-plan-refresh-v1"
  private const val PREFERENCES_NAME = "alarmpyo-plan-refresh-v1"
  private const val KEY_PLANNED_THROUGH_AT = "planned-through-at"
  private const val KEY_REFRESH_RECOMMENDED_AT = "refresh-recommended-at"
  private const val KEY_GENERATED_AT = "generated-at"
  private const val KEY_NOTIFIED_EXPIRY_AT = "notified-expiry-at"
  private const val KEY_LAST_BLOCKED_ATTEMPT_AT = "last-blocked-at"

  internal fun calculateCoverage(
    plans: List<AlarmPyoAlarmPlan>,
    nowMillis: Long = System.currentTimeMillis(),
    metadata: AlarmPyoAlarmSyncMetadata? = null
  ): AlarmPyoAlarmPlanCoverage? {
    val futureTimes = plans.map { plan ->
      plan.originalAlarmAt.takeIf { it > 0L } ?: plan.alarmAt
    }.filter { it > nowMillis }.sorted()
    val first = futureTimes.firstOrNull() ?: return null
    val last = futureTimes.last()
    if (last - first < MINIMUM_PLAN_SPAN_MILLIS) return null
    val metadataIsUsable = metadata != null &&
      metadata.generatedAt <= nowMillis + TimeUnit.MINUTES.toMillis(5) &&
      metadata.refreshRecommendedAt > nowMillis &&
      metadata.safetyThroughAt > metadata.refreshRecommendedAt &&
      metadata.safetyThroughAt >= last
    val plannedThroughAt = if (metadataIsUsable) {
      requireNotNull(metadata).safetyThroughAt
    } else {
      last
    }
    val fallbackRefreshAt = plannedThroughAt - REFRESH_LEAD_MILLIS
    val refreshRecommendedAt = metadata
      ?.takeIf { metadataIsUsable }
      ?.refreshRecommendedAt
      ?.let { minOf(it, fallbackRefreshAt) }
      ?: fallbackRefreshAt
    return AlarmPyoAlarmPlanCoverage(
      plannedThroughAt = plannedThroughAt,
      refreshRecommendedAt = refreshRecommendedAt,
      refreshReminderPending = true,
      generatedAt = metadata?.takeIf { metadataIsUsable }?.generatedAt ?: nowMillis
    )
  }

  @Synchronized
  fun update(
    context: Context,
    plans: List<AlarmPyoAlarmPlan>,
    metadata: AlarmPyoAlarmSyncMetadata? = null
  ) {
    val appContext = context.applicationContext
    val coverage = calculateCoverage(plans, metadata = metadata)
    if (coverage == null) {
      clear(appContext)
      return
    }
    val preferences = preferences(appContext)
    val previousExpiry = preferences.getLong(KEY_PLANNED_THROUGH_AT, 0L)
    val previousRefresh = preferences.getLong(KEY_REFRESH_RECOMMENDED_AT, 0L)
    val editor = preferences.edit()
      .putLong(KEY_PLANNED_THROUGH_AT, coverage.plannedThroughAt)
      .putLong(KEY_REFRESH_RECOMMENDED_AT, coverage.refreshRecommendedAt)
      .putLong(KEY_GENERATED_AT, coverage.generatedAt)
    if (
      previousExpiry != coverage.plannedThroughAt ||
      previousRefresh != coverage.refreshRecommendedAt
    ) {
      editor.remove(KEY_NOTIFIED_EXPIRY_AT)
        .remove(KEY_LAST_BLOCKED_ATTEMPT_AT)
    }
    check(editor.commit()) { "알람 계획 갱신 안내를 저장하지 못했습니다." }
    restore(appContext)
  }

  @Synchronized
  fun restore(context: Context) {
    val appContext = context.applicationContext
    val coverage = read(appContext)
    if (coverage == null) {
      cancelPendingIntent(appContext)
      return
    }
    if (coverage.plannedThroughAt <= System.currentTimeMillis()) {
      clear(appContext)
      return
    }
    if (!coverage.refreshReminderPending) {
      cancelPendingIntent(appContext)
      return
    }
    val now = System.currentTimeMillis()
    val triggerAt = nextTriggerAt(
      coverage = coverage,
      nowMillis = now,
      lastBlockedAttemptAt = preferences(appContext).getLong(KEY_LAST_BLOCKED_ATTEMPT_AT, 0L)
    )
    val alarmManager = appContext.getSystemService(Context.ALARM_SERVICE) as AlarmManager
    val operation = reminderPendingIntent(appContext)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
      alarmManager.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, triggerAt, operation)
    } else {
      alarmManager.set(AlarmManager.RTC_WAKEUP, triggerAt, operation)
    }
  }

  fun read(context: Context): AlarmPyoAlarmPlanCoverage? {
    val values = preferences(context)
    val plannedThroughAt = values.getLong(KEY_PLANNED_THROUGH_AT, 0L)
    val refreshRecommendedAt = values.getLong(KEY_REFRESH_RECOMMENDED_AT, 0L)
    if (plannedThroughAt <= 0L || refreshRecommendedAt <= 0L) return null
    val notifiedExpiryAt = values.getLong(KEY_NOTIFIED_EXPIRY_AT, 0L)
    return AlarmPyoAlarmPlanCoverage(
      plannedThroughAt = plannedThroughAt,
      refreshRecommendedAt = refreshRecommendedAt,
      refreshReminderPending = notifiedExpiryAt != plannedThroughAt,
      generatedAt = values.getLong(KEY_GENERATED_AT, 0L)
    )
  }

  @Synchronized
  fun markNotified(
    context: Context,
    expectedPlannedThroughAt: Long
  ): AlarmPyoAlarmPlanCoverage? {
    val appContext = context.applicationContext
    val coverage = read(appContext) ?: return null
    if (coverage.plannedThroughAt != expectedPlannedThroughAt) return null
    if (coverage.plannedThroughAt <= System.currentTimeMillis()) {
      clear(appContext)
      return null
    }
    check(
      preferences(appContext).edit()
        .putLong(KEY_NOTIFIED_EXPIRY_AT, coverage.plannedThroughAt)
        .commit()
    ) { "알람 계획 갱신 안내 상태를 저장하지 못했습니다." }
    cancelPendingIntent(appContext)
    return coverage.copy(refreshReminderPending = false)
  }

  @Synchronized
  fun clear(context: Context) {
    cancelPendingIntent(context)
    check(preferences(context).edit().clear().commit()) {
      "알람 계획 갱신 안내를 정리하지 못했습니다."
    }
  }

  fun showNotification(context: Context): AlarmPyoNotificationPostResult {
    if (!AlarmPyoAlarmPermissions.runtimeNotificationPermissionAllowed(context)) {
      return AlarmPyoNotificationPostResult.BLOCKED
    }
    val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    ensureChannel(manager)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N && !manager.areNotificationsEnabled()) {
      return AlarmPyoNotificationPostResult.BLOCKED
    }
    if (
      Build.VERSION.SDK_INT >= Build.VERSION_CODES.O &&
      manager.getNotificationChannel(CHANNEL_ID)?.importance == NotificationManager.IMPORTANCE_NONE
    ) {
      return AlarmPyoNotificationPostResult.BLOCKED
    }

    val launchIntent = context.packageManager.getLaunchIntentForPackage(context.packageName)
      ?.apply { addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP) }
    val contentIntent = launchIntent?.let {
      PendingIntent.getActivity(
        context,
        NOTIFICATION_ID,
        it,
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
      )
    }
    val builder = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      Notification.Builder(context, CHANNEL_ID)
    } else {
      @Suppress("DEPRECATION")
      Notification.Builder(context).setPriority(Notification.PRIORITY_DEFAULT)
    }
    builder
      .setSmallIcon(R.drawable.alarmpyo_ic_alarm)
      .setContentTitle("근무 알람 계획 갱신 필요")
      .setContentText("AlarmPyo를 열면 다음 근무 알람이 자동으로 이어집니다.")
      .setStyle(
        Notification.BigTextStyle()
          .bigText("AlarmPyo를 한 번 열면 저장된 근무표에 맞춰 다음 알람을 자동으로 이어서 예약합니다.")
      )
      .setCategory(Notification.CATEGORY_REMINDER)
      .setAutoCancel(true)
      .setOnlyAlertOnce(true)
      .setVisibility(Notification.VISIBILITY_PRIVATE)
    contentIntent?.let(builder::setContentIntent)
    return runCatching {
      manager.notify(NOTIFICATION_ID, builder.build())
      AlarmPyoNotificationPostResult.POSTED
    }.getOrDefault(AlarmPyoNotificationPostResult.FAILED)
  }

  internal fun shouldCompleteReminder(result: AlarmPyoNotificationPostResult): Boolean =
    result == AlarmPyoNotificationPostResult.POSTED

  internal fun nextTriggerAt(
    coverage: AlarmPyoAlarmPlanCoverage,
    nowMillis: Long,
    lastBlockedAttemptAt: Long
  ): Long = maxOf(
    coverage.refreshRecommendedAt,
    nowMillis + MINIMUM_TRIGGER_DELAY_MILLIS,
    lastBlockedAttemptAt.takeIf { it > 0L }
      ?.plus(BLOCKED_RECHECK_DELAY_MILLIS)
      ?: 0L
  )

  @Synchronized
  fun markBlockedAndRestore(context: Context, attemptedAt: Long = System.currentTimeMillis()) {
    val appContext = context.applicationContext
    check(
      preferences(appContext).edit()
        .putLong(KEY_LAST_BLOCKED_ATTEMPT_AT, attemptedAt)
        .commit()
    ) { "알람 계획 갱신 재점검 시각을 저장하지 못했습니다." }
    restore(appContext)
  }

  private fun ensureChannel(manager: NotificationManager) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    manager.createNotificationChannel(
      NotificationChannel(
        CHANNEL_ID,
        "알람 계획 갱신 안내",
        NotificationManager.IMPORTANCE_DEFAULT
      ).apply {
        description = "근무 알람 계획이 끝나기 전에 AlarmPyo 실행을 안내합니다."
        setShowBadge(false)
        lockscreenVisibility = Notification.VISIBILITY_PRIVATE
      }
    )
  }

  private fun preferences(context: Context) =
    (if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
      context.createDeviceProtectedStorageContext()
    } else {
      context
    }).getSharedPreferences(PREFERENCES_NAME, Context.MODE_PRIVATE)

  private fun reminderPendingIntent(context: Context): PendingIntent = PendingIntent.getBroadcast(
    context,
    REQUEST_CODE,
    Intent(context, AlarmPyoPlanRefreshReceiver::class.java).apply {
      action = ACTION_REMIND_ALARM_PLAN_REFRESH
    },
    PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
  )

  private fun cancelPendingIntent(context: Context) {
    val alarmManager = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
    alarmManager.cancel(reminderPendingIntent(context))
  }
}

class AlarmPyoPlanRefreshReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    if (intent.action != ACTION_REMIND_ALARM_PLAN_REFRESH) return
    val appContext = context.applicationContext
    val coverage = AlarmPyoPlanRefreshReminder.read(appContext) ?: return
    if (coverage.plannedThroughAt <= System.currentTimeMillis()) {
      AlarmPyoPlanRefreshReminder.clear(appContext)
      return
    }
    val result = AlarmPyoPlanRefreshReminder.showNotification(appContext)
    if (AlarmPyoPlanRefreshReminder.shouldCompleteReminder(result)) {
      AlarmPyoPlanRefreshReminder.markNotified(appContext, coverage.plannedThroughAt)
    } else if (result == AlarmPyoNotificationPostResult.BLOCKED) {
      // 알림 권한이 꺼져 있어도 배터리를 소모하는 잦은 재시도 없이 하루에 한 번만 확인해요.
      AlarmPyoPlanRefreshReminder.markBlockedAndRestore(appContext)
    } else if (result == AlarmPyoNotificationPostResult.FAILED) {
      // 일시적인 시스템 오류는 15분 뒤 다시 확인해요.
      AlarmPyoPlanRefreshReminder.restore(appContext)
    }
  }
}
