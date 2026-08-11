package expo.modules.alarmpyoalarm

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class AlarmPyoAlarmPreviewResultTest {
  @Test
  fun `preview result resolves exactly once`() {
    val values = mutableListOf<Boolean>()
    val result = AlarmPyoAlarmPreviewResult(values::add)

    assertTrue(result.resolve(true))
    assertFalse(result.resolve(false))
    assertEquals(listOf(true), values)
  }

  @Test
  fun `cancelled pending preview resolves false`() {
    val values = mutableListOf<Boolean>()
    val result = AlarmPyoAlarmPreviewResult(values::add)

    assertTrue(result.resolve(false))
    assertFalse(result.resolve(true))
    assertEquals(listOf(false), values)
  }
}
