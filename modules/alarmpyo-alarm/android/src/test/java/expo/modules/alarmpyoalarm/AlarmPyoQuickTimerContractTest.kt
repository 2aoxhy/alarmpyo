package expo.modules.alarmpyoalarm

import java.security.MessageDigest
import org.junit.Assert.assertEquals
import org.junit.Test
import org.json.JSONObject

class AlarmPyoQuickTimerContractTest {
  @Test
  fun `status wire map keeps its public field names values and order`() {
    val status = AlarmPyoQuickTimerStatus(
      state = "active",
      active = true,
      durationMinutes = 15,
      startedAt = 1_800_000_000_000L,
      fireAt = 1_800_000_900_000L,
      remainingMillis = 900_000L,
      isRepeat = false,
      storageHealth = AlarmPyoQuickTimerStorageHealth.RECOVERED,
      requiredAction = "none"
    )

    assertEquals(
      listOf(
        "supported",
        "state",
        "active",
        "durationMinutes",
        "startedAt",
        "fireAt",
        "remainingMillis",
        "isRepeat",
        "storageHealth",
        "requiredAction"
      ),
      status.toMap().keys.toList()
    )
    assertEquals(
      mapOf<String, Any?>(
        "supported" to true,
        "state" to "active",
        "active" to true,
        "durationMinutes" to 15,
        "startedAt" to 1_800_000_000_000.0,
        "fireAt" to 1_800_000_900_000.0,
        "remainingMillis" to 900_000.0,
        "isRepeat" to false,
        "storageHealth" to "recovered",
        "requiredAction" to "none"
      ),
      status.toMap()
    )
  }

  @Test
  fun `idle timer codec keeps the version two checksum envelope contract`() {
    val snapshot = AlarmPyoQuickTimerSnapshot.idle(generation = 7L)
    val envelope = JSONObject(AlarmPyoQuickTimerCodec.encode(snapshot))
    val payload = envelope.getString("payload")
    val payloadJson = JSONObject(payload)
    val expectedChecksum = MessageDigest.getInstance("SHA-256")
      .digest("2\n7\n$payload".toByteArray(Charsets.UTF_8))
      .joinToString("") { byte -> "%02x".format(byte) }

    assertEquals(2, envelope.getInt("schemaVersion"))
    assertEquals(7L, envelope.getLong("generation"))
    assertEquals("idle", payloadJson.getString("state"))
    assertEquals(true, payloadJson.isNull("durationMinutes"))
    assertEquals(0L, payloadJson.getLong("startedAt"))
    assertEquals(0L, payloadJson.getLong("startedAtElapsed"))
    assertEquals(0L, payloadJson.getLong("fireAtElapsed"))
    assertEquals(-1, payloadJson.getInt("bootCount"))
    assertEquals(0L, payloadJson.getLong("pausedRemainingMillis"))
    assertEquals(true, payloadJson.isNull("plan"))
    assertEquals(expectedChecksum, envelope.getString("checksum"))
    assertEquals(snapshot, AlarmPyoQuickTimerCodec.decode(envelope.toString()))
  }
}
