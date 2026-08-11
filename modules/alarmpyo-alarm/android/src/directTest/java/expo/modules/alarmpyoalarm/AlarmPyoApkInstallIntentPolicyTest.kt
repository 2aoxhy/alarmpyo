package expo.modules.alarmpyoalarm

import org.junit.Assert.assertEquals
import org.junit.Test

class AlarmPyoApkInstallIntentPolicyTest {
  @Test
  fun `package installer action falls back to view action for OEM compatibility`() {
    assertEquals(
      listOf(
        "android.intent.action.INSTALL_PACKAGE",
        "android.intent.action.VIEW"
      ),
      AlarmPyoApkInstallIntentPolicy.actionOrder
    )
  }
}
