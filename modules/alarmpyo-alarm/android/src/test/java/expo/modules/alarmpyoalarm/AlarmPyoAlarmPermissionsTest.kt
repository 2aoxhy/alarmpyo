package expo.modules.alarmpyoalarm

import android.app.NotificationManager
import org.junit.Assert.assertFalse
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class AlarmPyoAlarmPermissionsTest {
  @Test
  fun `notification blocking keeps future exact triggers but blocks immediate delivery`() {
    assertTrue(AlarmPyoAlarmPermissions.canKeepFutureTriggers(exactAlarmAllowed = true))
    assertFalse(
      AlarmPyoAlarmPermissions.canDeliverNow(
        exactAlarmAllowed = true,
        notificationsAllowed = false
      )
    )
    assertFalse(AlarmPyoAlarmPermissions.canKeepFutureTriggers(exactAlarmAllowed = false))
  }

  @Test
  fun `full screen access is required for ready delivery but not future triggers`() {
    assertFalse(
      AlarmPyoAlarmPermissions.canDeliverNow(
        exactAlarmAllowed = true,
        notificationsAllowed = true,
        fullScreenAllowed = false
      )
    )
    assertTrue(
      AlarmPyoAlarmPermissions.canDeliverNow(
        exactAlarmAllowed = true,
        notificationsAllowed = true,
        fullScreenAllowed = true
      )
    )
    assertTrue(AlarmPyoAlarmPermissions.canKeepFutureTriggers(exactAlarmAllowed = true))
  }

  @Test
  fun `permission settings follow exact notification and full screen order`() {
    assertEquals(
      AlarmPyoAlarmPermissions.RequiredSettings.EXACT_ALARM,
      AlarmPyoAlarmPermissions.nextRequiredSettings(false, false, false)
    )
    assertEquals(
      AlarmPyoAlarmPermissions.RequiredSettings.NOTIFICATIONS,
      AlarmPyoAlarmPermissions.nextRequiredSettings(true, false, false)
    )
    assertEquals(
      AlarmPyoAlarmPermissions.RequiredSettings.FULL_SCREEN,
      AlarmPyoAlarmPermissions.nextRequiredSettings(true, true, false)
    )
  }

  @Test
  fun `total silence can block alarm sound`() {
    val status = AlarmPyoAlarmPermissions.evaluateDoNotDisturbAlarmStatus(
      NotificationManager.INTERRUPTION_FILTER_NONE,
      null
    )

    assertTrue(status.active)
    assertTrue(status.maySilenceAlarm)
  }

  @Test
  fun `alarms only mode keeps alarm sound available`() {
    val status = AlarmPyoAlarmPermissions.evaluateDoNotDisturbAlarmStatus(
      NotificationManager.INTERRUPTION_FILTER_ALARMS,
      null
    )

    assertTrue(status.active)
    assertFalse(status.maySilenceAlarm)
  }

  @Test
  fun `priority mode checks whether alarms are allowed`() {
    val allowed = AlarmPyoAlarmPermissions.evaluateDoNotDisturbAlarmStatus(
      NotificationManager.INTERRUPTION_FILTER_PRIORITY,
      NotificationManager.Policy.PRIORITY_CATEGORY_ALARMS
    )
    val blocked = AlarmPyoAlarmPermissions.evaluateDoNotDisturbAlarmStatus(
      NotificationManager.INTERRUPTION_FILTER_PRIORITY,
      0
    )

    assertFalse(allowed.maySilenceAlarm)
    assertTrue(blocked.maySilenceAlarm)
  }

  @Test
  fun `normal sound mode is not reported as do not disturb`() {
    val status = AlarmPyoAlarmPermissions.evaluateDoNotDisturbAlarmStatus(
      NotificationManager.INTERRUPTION_FILTER_ALL,
      null
    )

    assertFalse(status.active)
    assertFalse(status.maySilenceAlarm)
  }
}
