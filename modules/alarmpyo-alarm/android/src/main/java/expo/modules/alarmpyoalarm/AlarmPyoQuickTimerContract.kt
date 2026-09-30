package expo.modules.alarmpyoalarm

import java.security.MessageDigest
import java.util.concurrent.TimeUnit
import org.json.JSONObject

internal object AlarmPyoQuickTimerPolicy {
  const val MIN_DURATION_MINUTES = 1
  const val MAX_DURATION_MINUTES = 60
  val OVERDUE_GRACE_MILLIS: Long = TimeUnit.MINUTES.toMillis(10)
  val EARLY_DELIVERY_TOLERANCE_MILLIS: Long = TimeUnit.MINUTES.toMillis(1)
  private val RETRY_DELAYS_MILLIS = longArrayOf(
    TimeUnit.MINUTES.toMillis(1),
    TimeUnit.MINUTES.toMillis(3),
    TimeUnit.MINUTES.toMillis(5)
  )

  fun isSupportedDuration(minutes: Int): Boolean =
    minutes in MIN_DURATION_MINUTES..MAX_DURATION_MINUTES

  fun remainingMillis(
    snapshot: AlarmPyoQuickTimerSnapshot,
    currentBootCount: Int,
    nowWallClock: Long,
    nowElapsed: Long
  ): Long {
    val sameBoot = snapshot.bootCount >= 0 &&
      currentBootCount >= 0 &&
      snapshot.bootCount == currentBootCount &&
      snapshot.fireAtElapsed > 0L
    return if (sameBoot) {
      snapshot.fireAtElapsed - nowElapsed
    } else {
      (snapshot.plan?.alarmAt ?: 0L) - nowWallClock
    }
  }

  fun restoredDelayMillis(remainingMillis: Long): Long? = when {
    remainingMillis > 0L -> remainingMillis
    remainingMillis >= -OVERDUE_GRACE_MILLIS -> 1_000L
    else -> null
  }

  fun retryDelayMillis(deliveryAttempt: Int): Long? =
    RETRY_DELAYS_MILLIS.getOrNull(deliveryAttempt.coerceAtLeast(0))

  fun rollbackSnapshot(
    previous: AlarmPyoQuickTimerSnapshot?
  ): AlarmPyoQuickTimerSnapshot = previous ?: AlarmPyoQuickTimerSnapshot.idle()

  fun pausedSnapshot(
    snapshot: AlarmPyoQuickTimerSnapshot,
    remainingMillis: Long
  ): AlarmPyoQuickTimerSnapshot {
    require(snapshot.isActive()) { "실행 중인 타이머만 일시정지할 수 있습니다." }
    require(remainingMillis > 0L) { "남은 시간이 있는 타이머만 일시정지할 수 있습니다." }
    return snapshot.copy(
      state = AlarmPyoQuickTimerSnapshotState.PAUSED,
      fireAtElapsed = 0L,
      bootCount = -1,
      pausedRemainingMillis = remainingMillis
    )
  }

  fun resumedSnapshot(
    snapshot: AlarmPyoQuickTimerSnapshot,
    resumedPlan: AlarmPyoAlarmPlan,
    nowWallClock: Long,
    nowElapsed: Long,
    currentBootCount: Int
  ): AlarmPyoQuickTimerSnapshot {
    require(snapshot.isPaused()) { "일시정지된 타이머만 다시 시작할 수 있습니다." }
    val remainingMillis = snapshot.pausedRemainingMillis
    require(remainingMillis > 0L) { "다시 시작할 남은 시간이 없습니다." }
    return snapshot.copy(
      plan = resumedPlan,
      startedAt = nowWallClock,
      startedAtElapsed = nowElapsed,
      fireAtElapsed = Math.addExact(nowElapsed, remainingMillis),
      bootCount = currentBootCount,
      state = AlarmPyoQuickTimerSnapshotState.ACTIVE,
      pausedRemainingMillis = 0L
    )
  }

  fun restoredSnapshot(
    snapshot: AlarmPyoQuickTimerSnapshot,
    restoredPlan: AlarmPyoAlarmPlan,
    nowElapsed: Long,
    delayMillis: Long,
    currentBootCount: Int
  ): AlarmPyoQuickTimerSnapshot {
    val previousPlan = requireNotNull(snapshot.plan)
    val wallClockDelta = Math.subtractExact(restoredPlan.alarmAt, previousPlan.alarmAt)
    return snapshot.copy(
      plan = restoredPlan,
      // Keep the wall duration valid even when TIME_SET moves the clock behind
      // the original start. JS can then retain its defensive fireAt > startedAt
      // validation without rejecting an otherwise healthy native timer.
      startedAt = Math.addExact(snapshot.startedAt, wallClockDelta),
      // elapsedRealtime resets on reboot. Keeping the previous boot's start
      // value can make fireAtElapsed <= startedAtElapsed and invalidate both
      // persisted replicas on their next read.
      startedAtElapsed = nowElapsed,
      fireAtElapsed = Math.addExact(nowElapsed, delayMillis),
      bootCount = currentBootCount
    )
  }

  fun automaticRepeatSnapshot(
    snapshot: AlarmPyoQuickTimerSnapshot,
    repeatPlan: AlarmPyoAlarmPlan,
    nowWallClock: Long,
    nowElapsed: Long,
    delayMillis: Long,
    currentBootCount: Int
  ): AlarmPyoQuickTimerSnapshot = snapshot.copy(
    plan = repeatPlan,
    // A 5-minute repeat is a new countdown stage, not an extension of the
    // original 15/30/45/60-minute timer's start point.
    startedAt = nowWallClock,
    startedAtElapsed = nowElapsed,
    fireAtElapsed = Math.addExact(nowElapsed, delayMillis),
    bootCount = currentBootCount
  )

  fun rebasePlanForRestore(
    plan: AlarmPyoAlarmPlan,
    nowWallClock: Long,
    delayMillis: Long
  ): AlarmPyoAlarmPlan {
    val restoredAlarmAt = Math.addExact(nowWallClock, delayMillis)
    val wallClockDelta = Math.subtractExact(restoredAlarmAt, plan.alarmAt)
    return plan.copy(
      alarmAt = restoredAlarmAt,
      // Apply the same delta so an in-flight retry keeps its existing delivery
      // window instead of receiving a fresh ten-minute grace period.
      originalAlarmAt = Math.addExact(plan.originalAlarmAt, wallClockDelta)
    )
  }
}

internal object AlarmPyoQuickTimerPresentation {
  fun notificationTitle(isRepeat: Boolean): String =
    if (isRepeat) "AlarmPyo 타이머 5분 재알림" else "AlarmPyo 타이머"

  fun badge(isRepeat: Boolean): String =
    if (isRepeat) "타이머 5분 재알림" else "타이머"

  fun message(plan: AlarmPyoAlarmPlan): String =
    if (plan.isSingleRepeat()) {
      "타이머가 5분 뒤 한 번 더 울렸습니다."
    } else {
      "${plan.shiftName.ifBlank { "타이머" }}가 끝났습니다."
    }

  fun notificationContent(plan: AlarmPyoAlarmPlan): String = message(plan)
}

internal data class AlarmPyoQuickTimerStatus(
  val state: String,
  val active: Boolean,
  val durationMinutes: Int?,
  val startedAt: Long,
  val fireAt: Long,
  val remainingMillis: Long,
  val isRepeat: Boolean,
  val storageHealth: AlarmPyoQuickTimerStorageHealth,
  val requiredAction: String
) {
  fun toMap(): Map<String, Any?> = mapOf(
    "supported" to true,
    "state" to state,
    "active" to active,
    "durationMinutes" to durationMinutes,
    "startedAt" to startedAt.toDouble(),
    "fireAt" to fireAt.toDouble(),
    "remainingMillis" to remainingMillis.toDouble(),
    "isRepeat" to isRepeat,
    "storageHealth" to storageHealth.wireValue,
    "requiredAction" to requiredAction
  )
}

internal object AlarmPyoQuickTimerCodec {
  const val SCHEMA_VERSION = 2
  private const val LEGACY_SCHEMA_VERSION = 1
  private const val MAX_PAYLOAD_BYTES = 32 * 1024

  fun encode(snapshot: AlarmPyoQuickTimerSnapshot): String {
    val payload = JSONObject()
      .put("state", snapshot.state.wireValue)
      .put("durationMinutes", snapshot.durationMinutes ?: JSONObject.NULL)
      .put("startedAt", snapshot.startedAt)
      .put("startedAtElapsed", snapshot.startedAtElapsed)
      .put("fireAtElapsed", snapshot.fireAtElapsed)
      .put("bootCount", snapshot.bootCount)
      .put("pausedRemainingMillis", snapshot.pausedRemainingMillis)
      .put("plan", snapshot.plan?.toJson() ?: JSONObject.NULL)
      .toString()
    return JSONObject()
      .put("schemaVersion", SCHEMA_VERSION)
      .put("generation", snapshot.generation)
      .put("payload", payload)
      .put("checksum", checksum(SCHEMA_VERSION, snapshot.generation, payload))
      .toString()
  }

  fun decode(raw: String?): AlarmPyoQuickTimerSnapshot? = runCatching {
    if (raw.isNullOrBlank() || raw.toByteArray(Charsets.UTF_8).size > MAX_PAYLOAD_BYTES) {
      return null
    }
    val envelope = JSONObject(raw)
    val schemaVersion = envelope.getInt("schemaVersion")
    if (schemaVersion != SCHEMA_VERSION && schemaVersion != LEGACY_SCHEMA_VERSION) return null
    val generation = envelope.getLong("generation")
    if (generation <= 0L) return null
    val payload = envelope.getString("payload")
    if (
      payload.toByteArray(Charsets.UTF_8).size > MAX_PAYLOAD_BYTES ||
      !checksum(schemaVersion, generation, payload)
        .equals(envelope.getString("checksum"), ignoreCase = true)
    ) return null

    val json = JSONObject(payload)
    val state = AlarmPyoQuickTimerSnapshotState.fromWireValue(json.getString("state"))
      ?: return null
    val plan = if (json.isNull("plan")) null else {
      AlarmPyoAlarmPlan.fromJson(json.getJSONObject("plan")) ?: return null
    }
    val durationMinutes = if (json.isNull("durationMinutes")) null else {
      json.getInt("durationMinutes").takeIf { duration ->
        when (schemaVersion) {
          LEGACY_SCHEMA_VERSION -> duration == 30 || duration == 60
          else -> AlarmPyoQuickTimerPolicy.isSupportedDuration(duration)
        }
      } ?: return null
    }
    val snapshot = AlarmPyoQuickTimerSnapshot(
      plan = plan,
      durationMinutes = durationMinutes,
      startedAt = json.getLong("startedAt"),
      startedAtElapsed = json.getLong("startedAtElapsed"),
      fireAtElapsed = json.getLong("fireAtElapsed"),
      bootCount = json.optInt("bootCount", -1),
      state = state,
      pausedRemainingMillis = json.optLong("pausedRemainingMillis", 0L),
      generation = generation
    )
    if (snapshot.isActive()) {
      if (
        snapshot.durationMinutes == null ||
        snapshot.startedAt <= 0L ||
        snapshot.startedAtElapsed < 0L ||
        snapshot.fireAtElapsed <= snapshot.startedAtElapsed ||
        snapshot.pausedRemainingMillis != 0L ||
        snapshot.plan?.shiftTypeId != "timer"
      ) return null
    } else if (snapshot.isPaused()) {
      if (
        snapshot.durationMinutes == null ||
        snapshot.startedAt <= 0L ||
        snapshot.fireAtElapsed != 0L ||
        snapshot.pausedRemainingMillis <= 0L ||
        snapshot.plan?.shiftTypeId != "timer"
      ) return null
    } else if (snapshot.plan != null) {
      return null
    } else if (snapshot.pausedRemainingMillis != 0L) {
      return null
    }
    snapshot
  }.getOrNull()

  private fun checksum(schemaVersion: Int, generation: Long, payload: String): String =
    MessageDigest.getInstance("SHA-256")
      .digest("$schemaVersion\n$generation\n$payload".toByteArray(Charsets.UTF_8))
      .joinToString("") { byte -> "%02x".format(byte) }
}
