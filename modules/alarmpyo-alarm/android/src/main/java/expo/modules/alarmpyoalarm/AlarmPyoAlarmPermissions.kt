package expo.modules.alarmpyoalarm

import android.Manifest
import android.app.AlarmManager
import android.app.NotificationManager
import android.content.Context
import android.content.pm.PackageManager
import android.media.AudioManager
import android.os.Build
import android.os.PowerManager

internal data class AlarmPyoDoNotDisturbAlarmStatus(
  val active: Boolean,
  val maySilenceAlarm: Boolean
)

internal object AlarmPyoAlarmPermissions {
  fun exactAlarmAllowed(context: Context): Boolean {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) return true
    val manager = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
    return manager.canScheduleExactAlarms()
  }

  fun notificationsAllowed(context: Context): Boolean {
    if (!runtimeNotificationPermissionAllowed(context)) return false
    val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N && !manager.areNotificationsEnabled()) return false
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      val channel = manager.getNotificationChannel(ALARM_CHANNEL_ID)
      if (channel != null && channel.importance < NotificationManager.IMPORTANCE_HIGH) return false
    }
    return true
  }

  fun runtimeNotificationPermissionAllowed(context: Context): Boolean =
    Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU ||
      context.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED

  fun fullScreenAllowed(context: Context): Boolean {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.UPSIDE_DOWN_CAKE) return true
    val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    return manager.canUseFullScreenIntent()
  }

  fun alarmVolume(context: Context): Int {
    val audioManager = context.getSystemService(Context.AUDIO_SERVICE) as AudioManager
    return audioManager.getStreamVolume(AudioManager.STREAM_ALARM)
  }

  fun doNotDisturbAlarmStatus(context: Context): AlarmPyoDoNotDisturbAlarmStatus {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) {
      return AlarmPyoDoNotDisturbAlarmStatus(active = false, maySilenceAlarm = false)
    }
    val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    val interruptionFilter = runCatching { manager.currentInterruptionFilter }
      .getOrDefault(NotificationManager.INTERRUPTION_FILTER_UNKNOWN)
    val priorityCategories = if (
      interruptionFilter == NotificationManager.INTERRUPTION_FILTER_PRIORITY &&
      manager.isNotificationPolicyAccessGranted
    ) {
      runCatching { manager.notificationPolicy.priorityCategories }.getOrNull()
    } else {
      null
    }
    return evaluateDoNotDisturbAlarmStatus(interruptionFilter, priorityCategories)
  }

  internal fun evaluateDoNotDisturbAlarmStatus(
    interruptionFilter: Int,
    priorityCategories: Int?
  ): AlarmPyoDoNotDisturbAlarmStatus {
    val active = interruptionFilter != NotificationManager.INTERRUPTION_FILTER_ALL &&
      interruptionFilter != NotificationManager.INTERRUPTION_FILTER_UNKNOWN
    val maySilenceAlarm = when (interruptionFilter) {
      NotificationManager.INTERRUPTION_FILTER_NONE -> true
      NotificationManager.INTERRUPTION_FILTER_PRIORITY -> priorityCategories?.let { categories ->
        categories and NotificationManager.Policy.PRIORITY_CATEGORY_ALARMS == 0
      } ?: true
      NotificationManager.INTERRUPTION_FILTER_ALARMS,
      NotificationManager.INTERRUPTION_FILTER_ALL,
      NotificationManager.INTERRUPTION_FILTER_UNKNOWN -> false
      else -> active
    }
    return AlarmPyoDoNotDisturbAlarmStatus(active, maySilenceAlarm)
  }

  fun batteryOptimizationIgnored(context: Context): Boolean {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) return true
    val manager = context.getSystemService(Context.POWER_SERVICE) as PowerManager
    return manager.isIgnoringBatteryOptimizations(context.packageName)
  }

  /** 알림 전달 권한과 무관하게 미래 AlarmManager 예약은 유지해요. */
  fun canSchedule(context: Context): Boolean =
    canKeepFutureTriggers(exactAlarmAllowed(context))

  /** 시험 알람처럼 즉시 전체 화면 가청 전달이 필요한 동작에만 세 권한을 함께 확인해요. */
  fun canDeliver(context: Context): Boolean =
    canDeliverNow(
      exactAlarmAllowed(context),
      notificationsAllowed(context),
      fullScreenAllowed(context)
    )

  internal fun canKeepFutureTriggers(exactAlarmAllowed: Boolean): Boolean =
    exactAlarmAllowed

  internal fun canDeliverNow(
    exactAlarmAllowed: Boolean,
    notificationsAllowed: Boolean,
    fullScreenAllowed: Boolean = true
  ): Boolean = exactAlarmAllowed && notificationsAllowed && fullScreenAllowed

  internal enum class RequiredSettings {
    EXACT_ALARM,
    NOTIFICATIONS,
    FULL_SCREEN,
    NONE
  }

  internal fun nextRequiredSettings(
    exactAlarmAllowed: Boolean,
    notificationsAllowed: Boolean,
    fullScreenAllowed: Boolean
  ): RequiredSettings = when {
    !exactAlarmAllowed -> RequiredSettings.EXACT_ALARM
    !notificationsAllowed -> RequiredSettings.NOTIFICATIONS
    !fullScreenAllowed -> RequiredSettings.FULL_SCREEN
    else -> RequiredSettings.NONE
  }

  fun openNextRequiredSettings(context: Context): AlarmPyoPermissionSettingsLaunchResult =
    when (
      nextRequiredSettings(
        exactAlarmAllowed(context),
        notificationsAllowed(context),
        fullScreenAllowed(context)
      )
    ) {
      RequiredSettings.EXACT_ALARM -> openExactAlarmSettings(context)
      RequiredSettings.NOTIFICATIONS -> openNotificationSettings(context)
      RequiredSettings.FULL_SCREEN -> openFullScreenSettings(context)
      RequiredSettings.NONE -> openNotificationSettings(context)
    }

  fun openExactAlarmSettings(context: Context): AlarmPyoPermissionSettingsLaunchResult =
    AlarmPyoPermissionSettings.open(
      context,
      AlarmPyoPermissionSettingsTarget.EXACT_ALARM
    )

  fun openFullScreenSettings(context: Context): AlarmPyoPermissionSettingsLaunchResult =
    AlarmPyoPermissionSettings.open(
      context,
      AlarmPyoPermissionSettingsTarget.FULL_SCREEN
    )

  fun openNotificationSettings(context: Context): AlarmPyoPermissionSettingsLaunchResult =
    AlarmPyoPermissionSettings.open(
      context,
      AlarmPyoPermissionSettingsTarget.ALARM_NOTIFICATIONS
    )

  fun openDoNotDisturbSettings(context: Context): AlarmPyoPermissionSettingsLaunchResult =
    AlarmPyoPermissionSettings.open(
      context,
      AlarmPyoPermissionSettingsTarget.DO_NOT_DISTURB
    )

  fun openBatterySettings(context: Context): AlarmPyoPermissionSettingsLaunchResult =
    AlarmPyoPermissionSettings.open(
      context,
      AlarmPyoPermissionSettingsTarget.BATTERY_OPTIMIZATION
    )

  internal fun alarmNotificationSettingsScope(context: Context): AlarmPyoNotificationSettingsScope {
    AlarmPyoAlarmChannels.ensure(context)
    return notificationSettingsScope(
      context = context,
      channelId = ALARM_CHANNEL_ID,
      minimumImportance = NotificationManager.IMPORTANCE_HIGH
    )
  }

  internal fun sleepNotificationSettingsScope(context: Context): AlarmPyoNotificationSettingsScope {
    AlarmPyoSleepReminderChannels.ensure(context)
    return notificationSettingsScope(
      context = context,
      channelId = SLEEP_REMINDER_CHANNEL_ID,
      minimumImportance = NotificationManager.IMPORTANCE_MIN
    )
  }

  private fun notificationSettingsScope(
    context: Context,
    channelId: String,
    minimumImportance: Int
  ): AlarmPyoNotificationSettingsScope {
    if (!runtimeNotificationPermissionAllowed(context)) {
      return AlarmPyoNotificationSettingsScope.APP
    }
    val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N && !manager.areNotificationsEnabled()) {
      return AlarmPyoNotificationSettingsScope.APP
    }
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      val channel = manager.getNotificationChannel(channelId)
      if (channel != null && channel.importance < minimumImportance) {
        return AlarmPyoNotificationSettingsScope.CHANNEL
      }
    }
    return AlarmPyoNotificationSettingsScope.APP
  }
}
