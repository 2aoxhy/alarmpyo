package expo.modules.alarmpyoalarm

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings

internal enum class AlarmPyoPermissionSettingsTarget(val wireValue: String) {
  EXACT_ALARM("exact-alarm"),
  ALARM_NOTIFICATIONS("alarm-notifications"),
  SLEEP_NOTIFICATIONS("sleep-notifications"),
  FULL_SCREEN("full-screen"),
  DO_NOT_DISTURB("do-not-disturb"),
  BATTERY_OPTIMIZATION("battery-optimization"),
  APP_DETAILS("app-details");

  companion object {
    fun fromWireValue(value: String): AlarmPyoPermissionSettingsTarget? =
      entries.firstOrNull { it.wireValue == value }
  }
}

internal enum class AlarmPyoPermissionSettingsDestination(val wireValue: String) {
  EXACT_ALARM("exact-alarm"),
  APP_NOTIFICATIONS("app-notifications"),
  ALARM_CHANNEL("alarm-channel"),
  SLEEP_CHANNEL("sleep-channel"),
  FULL_SCREEN("full-screen"),
  DO_NOT_DISTURB("do-not-disturb"),
  SOUND("sound"),
  BATTERY_OPTIMIZATION("battery-optimization"),
  APP_DETAILS("app-details"),
  APPLICATION_SETTINGS("application-settings"),
  SYSTEM_SETTINGS("system-settings")
}

internal enum class AlarmPyoNotificationSettingsScope {
  APP,
  CHANNEL
}

internal data class AlarmPyoPermissionSettingsIntentSpec(
  val destination: AlarmPyoPermissionSettingsDestination,
  val action: String,
  val packageData: Boolean = false,
  val appPackageExtra: Boolean = false,
  val channelId: String? = null
)

internal data class AlarmPyoPermissionSettingsLaunchResult(
  val opened: Boolean,
  val requestedTarget: AlarmPyoPermissionSettingsTarget,
  val openedTarget: AlarmPyoPermissionSettingsDestination?,
  val fallbackUsed: Boolean
) {
  fun toMap(): Map<String, Any?> = mapOf(
    "opened" to opened,
    "requestedTarget" to requestedTarget.wireValue,
    "openedTarget" to openedTarget?.wireValue,
    "fallbackUsed" to fallbackUsed
  )
}

internal object AlarmPyoPermissionSettings {
  fun open(
    context: Context,
    target: AlarmPyoPermissionSettingsTarget
  ): AlarmPyoPermissionSettingsLaunchResult {
    val notificationScope = when (target) {
      AlarmPyoPermissionSettingsTarget.ALARM_NOTIFICATIONS ->
        AlarmPyoAlarmPermissions.alarmNotificationSettingsScope(context)
      AlarmPyoPermissionSettingsTarget.SLEEP_NOTIFICATIONS ->
        AlarmPyoAlarmPermissions.sleepNotificationSettingsScope(context)
      else -> AlarmPyoNotificationSettingsScope.APP
    }
    val specs = intentSpecs(
      apiLevel = Build.VERSION.SDK_INT,
      target = target,
      notificationScope = notificationScope
    )
    return launchFirstAvailable(target, specs) { spec ->
      runCatching {
        context.startActivity(spec.toIntent(context).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
        true
      }.getOrDefault(false)
    }
  }

  internal fun intentSpecs(
    apiLevel: Int,
    target: AlarmPyoPermissionSettingsTarget,
    notificationScope: AlarmPyoNotificationSettingsScope = AlarmPyoNotificationSettingsScope.APP
  ): List<AlarmPyoPermissionSettingsIntentSpec> = when (target) {
    AlarmPyoPermissionSettingsTarget.EXACT_ALARM -> buildList {
      // Android 13+의 USE_EXACT_ALARM은 자동 부여되고 사용자가 취소할 수 없어요.
      // 사용자 설정으로 복구할 수 있는 Android 12/12L에서만 전용 화면을 열어요.
      if (apiLevel in Build.VERSION_CODES.S..Build.VERSION_CODES.S_V2) {
        add(
          AlarmPyoPermissionSettingsIntentSpec(
            destination = AlarmPyoPermissionSettingsDestination.EXACT_ALARM,
            action = Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM,
            packageData = true
          )
        )
      }
      addAll(appDetailsSpecs())
    }
    AlarmPyoPermissionSettingsTarget.ALARM_NOTIFICATIONS ->
      notificationSpecs(notificationScope, ALARM_CHANNEL_ID, isSleepReminder = false)
    AlarmPyoPermissionSettingsTarget.SLEEP_NOTIFICATIONS ->
      notificationSpecs(notificationScope, SLEEP_REMINDER_CHANNEL_ID, isSleepReminder = true)
    AlarmPyoPermissionSettingsTarget.FULL_SCREEN -> buildList {
      if (apiLevel >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
        add(
          AlarmPyoPermissionSettingsIntentSpec(
            destination = AlarmPyoPermissionSettingsDestination.FULL_SCREEN,
            action = Settings.ACTION_MANAGE_APP_USE_FULL_SCREEN_INTENT,
            packageData = true
          )
        )
      }
      add(appNotificationSpec())
      addAll(appDetailsSpecs())
    }
    AlarmPyoPermissionSettingsTarget.DO_NOT_DISTURB -> listOf(
      AlarmPyoPermissionSettingsIntentSpec(
        destination = AlarmPyoPermissionSettingsDestination.DO_NOT_DISTURB,
        action = Settings.ACTION_ZEN_MODE_PRIORITY_SETTINGS
      ),
      AlarmPyoPermissionSettingsIntentSpec(
        destination = AlarmPyoPermissionSettingsDestination.SOUND,
        action = Settings.ACTION_SOUND_SETTINGS
      ),
      *appDetailsSpecs().toTypedArray()
    )
    AlarmPyoPermissionSettingsTarget.BATTERY_OPTIMIZATION -> listOf(
      AlarmPyoPermissionSettingsIntentSpec(
        destination = AlarmPyoPermissionSettingsDestination.BATTERY_OPTIMIZATION,
        action = Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS
      ),
      *appDetailsSpecs().toTypedArray()
    )
    AlarmPyoPermissionSettingsTarget.APP_DETAILS -> appDetailsSpecs()
  }

  internal fun launchFirstAvailable(
    requestedTarget: AlarmPyoPermissionSettingsTarget,
    specs: List<AlarmPyoPermissionSettingsIntentSpec>,
    starter: (AlarmPyoPermissionSettingsIntentSpec) -> Boolean
  ): AlarmPyoPermissionSettingsLaunchResult {
    specs.forEachIndexed { index, spec ->
      if (starter(spec)) {
        return AlarmPyoPermissionSettingsLaunchResult(
          opened = true,
          requestedTarget = requestedTarget,
          openedTarget = spec.destination,
          fallbackUsed = index > 0
        )
      }
    }
    return AlarmPyoPermissionSettingsLaunchResult(
      opened = false,
      requestedTarget = requestedTarget,
      openedTarget = null,
      fallbackUsed = false
    )
  }

  private fun notificationSpecs(
    scope: AlarmPyoNotificationSettingsScope,
    channelId: String,
    isSleepReminder: Boolean
  ): List<AlarmPyoPermissionSettingsIntentSpec> = buildList {
    if (scope == AlarmPyoNotificationSettingsScope.CHANNEL) {
      add(
        AlarmPyoPermissionSettingsIntentSpec(
          destination = if (isSleepReminder) {
            AlarmPyoPermissionSettingsDestination.SLEEP_CHANNEL
          } else {
            AlarmPyoPermissionSettingsDestination.ALARM_CHANNEL
          },
          action = Settings.ACTION_CHANNEL_NOTIFICATION_SETTINGS,
          appPackageExtra = true,
          channelId = channelId
        )
      )
    }
    add(appNotificationSpec())
    addAll(appDetailsSpecs())
  }

  private fun appNotificationSpec() = AlarmPyoPermissionSettingsIntentSpec(
    destination = AlarmPyoPermissionSettingsDestination.APP_NOTIFICATIONS,
    action = Settings.ACTION_APP_NOTIFICATION_SETTINGS,
    appPackageExtra = true
  )

  private fun appDetailsSpecs() = listOf(
    AlarmPyoPermissionSettingsIntentSpec(
      destination = AlarmPyoPermissionSettingsDestination.APP_DETAILS,
      action = Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
      packageData = true
    ),
    AlarmPyoPermissionSettingsIntentSpec(
      destination = AlarmPyoPermissionSettingsDestination.APPLICATION_SETTINGS,
      action = Settings.ACTION_APPLICATION_SETTINGS
    ),
    AlarmPyoPermissionSettingsIntentSpec(
      destination = AlarmPyoPermissionSettingsDestination.SYSTEM_SETTINGS,
      action = Settings.ACTION_SETTINGS
    )
  )
}

private fun AlarmPyoPermissionSettingsIntentSpec.toIntent(context: Context): Intent =
  Intent(action).apply {
    if (packageData) data = Uri.parse("package:${context.packageName}")
    if (appPackageExtra) putExtra(Settings.EXTRA_APP_PACKAGE, context.packageName)
    channelId?.let { putExtra(Settings.EXTRA_CHANNEL_ID, it) }
  }
