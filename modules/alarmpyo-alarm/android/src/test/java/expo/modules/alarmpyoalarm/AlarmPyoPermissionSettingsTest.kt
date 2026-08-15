package expo.modules.alarmpyoalarm

import android.os.Build
import android.provider.Settings
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class AlarmPyoPermissionSettingsTest {
  @Test
  fun `Android 12 exact alarm opens the package special access page first`() {
    val specs = AlarmPyoPermissionSettings.intentSpecs(
      apiLevel = Build.VERSION_CODES.S,
      target = AlarmPyoPermissionSettingsTarget.EXACT_ALARM
    )

    assertEquals(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM, specs.first().action)
    assertEquals(AlarmPyoPermissionSettingsDestination.EXACT_ALARM, specs.first().destination)
    assertTrue(specs.first().packageData)
    assertEquals(AlarmPyoPermissionSettingsDestination.APP_DETAILS, specs[1].destination)
  }

  @Test
  fun `Android 13 and later exact alarm uses app details because USE exact alarm is automatic`() {
    for (apiLevel in Build.VERSION_CODES.TIRAMISU..36) {
      val specs = AlarmPyoPermissionSettings.intentSpecs(
        apiLevel = apiLevel,
        target = AlarmPyoPermissionSettingsTarget.EXACT_ALARM
      )

      assertEquals(AlarmPyoPermissionSettingsDestination.APP_DETAILS, specs.first().destination)
      assertFalse(specs.any { it.action == Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM })
    }
  }

  @Test
  fun `app notification blocking opens app settings before app details`() {
    val specs = AlarmPyoPermissionSettings.intentSpecs(
      apiLevel = 36,
      target = AlarmPyoPermissionSettingsTarget.ALARM_NOTIFICATIONS,
      notificationScope = AlarmPyoNotificationSettingsScope.APP
    )

    assertEquals(Settings.ACTION_APP_NOTIFICATION_SETTINGS, specs.first().action)
    assertTrue(specs.first().appPackageExtra)
    assertNull(specs.first().channelId)
    assertEquals(AlarmPyoPermissionSettingsDestination.APP_DETAILS, specs[1].destination)
  }

  @Test
  fun `blocked alarm and sleep channels open their own channel before app settings`() {
    val alarmSpecs = AlarmPyoPermissionSettings.intentSpecs(
      apiLevel = 36,
      target = AlarmPyoPermissionSettingsTarget.ALARM_NOTIFICATIONS,
      notificationScope = AlarmPyoNotificationSettingsScope.CHANNEL
    )
    val sleepSpecs = AlarmPyoPermissionSettings.intentSpecs(
      apiLevel = 36,
      target = AlarmPyoPermissionSettingsTarget.SLEEP_NOTIFICATIONS,
      notificationScope = AlarmPyoNotificationSettingsScope.CHANNEL
    )

    assertEquals(Settings.ACTION_CHANNEL_NOTIFICATION_SETTINGS, alarmSpecs.first().action)
    assertEquals(ALARM_CHANNEL_ID, alarmSpecs.first().channelId)
    assertEquals(AlarmPyoPermissionSettingsDestination.ALARM_CHANNEL, alarmSpecs.first().destination)
    assertEquals(Settings.ACTION_APP_NOTIFICATION_SETTINGS, alarmSpecs[1].action)
    assertEquals(SLEEP_REMINDER_CHANNEL_ID, sleepSpecs.first().channelId)
    assertEquals(AlarmPyoPermissionSettingsDestination.SLEEP_CHANNEL, sleepSpecs.first().destination)
  }

  @Test
  fun `full screen uses its dedicated page only from Android 14`() {
    val android13 = AlarmPyoPermissionSettings.intentSpecs(
      apiLevel = Build.VERSION_CODES.TIRAMISU,
      target = AlarmPyoPermissionSettingsTarget.FULL_SCREEN
    )
    val android14 = AlarmPyoPermissionSettings.intentSpecs(
      apiLevel = Build.VERSION_CODES.UPSIDE_DOWN_CAKE,
      target = AlarmPyoPermissionSettingsTarget.FULL_SCREEN
    )

    assertEquals(Settings.ACTION_APP_NOTIFICATION_SETTINGS, android13.first().action)
    assertEquals(Settings.ACTION_MANAGE_APP_USE_FULL_SCREEN_INTENT, android14.first().action)
    assertTrue(android14.first().packageData)
  }

  @Test
  fun `do not disturb and battery use public settings without privileged access requests`() {
    val dnd = AlarmPyoPermissionSettings.intentSpecs(
      apiLevel = 36,
      target = AlarmPyoPermissionSettingsTarget.DO_NOT_DISTURB
    )
    val battery = AlarmPyoPermissionSettings.intentSpecs(
      apiLevel = 36,
      target = AlarmPyoPermissionSettingsTarget.BATTERY_OPTIMIZATION
    )

    assertEquals(Settings.ACTION_ZEN_MODE_PRIORITY_SETTINGS, dnd[0].action)
    assertEquals(Settings.ACTION_SOUND_SETTINGS, dnd[1].action)
    assertFalse(dnd.any { it.action == Settings.ACTION_NOTIFICATION_POLICY_ACCESS_SETTINGS })
    assertEquals(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS, battery[0].action)
    assertFalse(battery.any { it.action == Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS })
  }

  @Test
  fun `launcher records the actual fallback destination`() {
    val specs = AlarmPyoPermissionSettings.intentSpecs(
      apiLevel = Build.VERSION_CODES.UPSIDE_DOWN_CAKE,
      target = AlarmPyoPermissionSettingsTarget.FULL_SCREEN
    )
    val attempts = mutableListOf<AlarmPyoPermissionSettingsDestination>()

    val result = AlarmPyoPermissionSettings.launchFirstAvailable(
      requestedTarget = AlarmPyoPermissionSettingsTarget.FULL_SCREEN,
      specs = specs
    ) { spec ->
      attempts += spec.destination
      spec.destination == AlarmPyoPermissionSettingsDestination.APP_NOTIFICATIONS
    }

    assertTrue(result.opened)
    assertTrue(result.fallbackUsed)
    assertEquals(AlarmPyoPermissionSettingsDestination.APP_NOTIFICATIONS, result.openedTarget)
    assertEquals(
      listOf(
        AlarmPyoPermissionSettingsDestination.FULL_SCREEN,
        AlarmPyoPermissionSettingsDestination.APP_NOTIFICATIONS
      ),
      attempts
    )
  }

  @Test
  fun `launcher reports a clean failure when no public settings activity opens`() {
    val result = AlarmPyoPermissionSettings.launchFirstAvailable(
      requestedTarget = AlarmPyoPermissionSettingsTarget.APP_DETAILS,
      specs = AlarmPyoPermissionSettings.intentSpecs(
        apiLevel = 36,
        target = AlarmPyoPermissionSettingsTarget.APP_DETAILS
      )
    ) { false }

    assertFalse(result.opened)
    assertFalse(result.fallbackUsed)
    assertNull(result.openedTarget)
  }
}
