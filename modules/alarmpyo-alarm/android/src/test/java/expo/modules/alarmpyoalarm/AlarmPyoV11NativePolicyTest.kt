package expo.modules.alarmpyoalarm

import android.view.KeyEvent
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class AlarmPyoV11NativePolicyTest {
  @Test
  fun `volume key first down dismisses while repeats and power remain excluded`() {
    assertTrue(
      AlarmPyoAlarmKeyPolicy.shouldDismiss(
        KeyEvent.KEYCODE_VOLUME_UP,
        KeyEvent.ACTION_DOWN,
        0
      )
    )
    assertTrue(
      AlarmPyoAlarmKeyPolicy.shouldDismiss(
        KeyEvent.KEYCODE_VOLUME_DOWN,
        KeyEvent.ACTION_DOWN,
        0
      )
    )
    assertFalse(
      AlarmPyoAlarmKeyPolicy.shouldDismiss(
        KeyEvent.KEYCODE_VOLUME_UP,
        KeyEvent.ACTION_DOWN,
        1
      )
    )
    assertFalse(
      AlarmPyoAlarmKeyPolicy.shouldDismiss(
        KeyEvent.KEYCODE_POWER,
        KeyEvent.ACTION_DOWN,
        0
      )
    )
  }

  @Test
  fun `alarm vibration is four short bursts followed by a quiet interval`() {
    val expected = longArrayOf(
      0L,
      240L, 160L,
      240L, 160L,
      240L, 160L,
      240L, 800L
    )

    assertArrayEquals(expected, AlarmPyoAlarmVibrationPolicy.patternMillis())
    assertEquals(4, expected.drop(1).chunked(2).count { it.first() == 240L })
  }

  @Test
  fun `play update state prioritizes transfer and terminal install states`() {
    assertEquals(
      "unsupported",
      AlarmPyoPlayUpdatePolicy.state(
        false,
        updateAvailable = true,
        installStatus = AlarmPyoPlayUpdateInstallStatus.DOWNLOADING
      )
    )
    assertEquals(
      "available",
      AlarmPyoPlayUpdatePolicy.state(
        true,
        updateAvailable = true,
        installStatus = AlarmPyoPlayUpdateInstallStatus.UNKNOWN
      )
    )
    assertEquals(
      "in-progress",
      AlarmPyoPlayUpdatePolicy.state(
        true,
        updateAvailable = false,
        installStatus = AlarmPyoPlayUpdateInstallStatus.DOWNLOADING
      )
    )
    assertEquals(
      "downloaded",
      AlarmPyoPlayUpdatePolicy.state(
        true,
        updateAvailable = false,
        installStatus = AlarmPyoPlayUpdateInstallStatus.DOWNLOADED
      )
    )
    assertEquals(
      "failed",
      AlarmPyoPlayUpdatePolicy.state(
        true,
        updateAvailable = false,
        installStatus = AlarmPyoPlayUpdateInstallStatus.FAILED
      )
    )
  }

  @Test
  fun `non Play builds return explicit unsupported update results`() {
    val status = AlarmPyoPlayUpdateStatus.unsupported()
    val start = AlarmPyoPlayUpdateStartResult.unsupported()
    val complete = AlarmPyoPlayUpdateCompleteResult.unsupported()

    assertFalse(status.supported)
    assertEquals("unsupported", status.state)
    assertFalse(start.started)
    assertEquals("unsupported", (start.toMap()["status"] as Map<*, *>)["state"])
    assertFalse(complete.completed)
    assertEquals("unsupported", (complete.toMap()["status"] as Map<*, *>)["state"])
  }
}
