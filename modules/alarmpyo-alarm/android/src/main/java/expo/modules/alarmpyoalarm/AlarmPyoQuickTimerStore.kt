package expo.modules.alarmpyoalarm

import android.content.Context
import android.os.Build
import java.security.MessageDigest
import org.json.JSONObject

internal enum class AlarmPyoQuickTimerStorageHealth(val wireValue: String) {
  NORMAL("normal"),
  RECOVERED("recovered"),
  CORRUPT("corrupt")
}

internal enum class AlarmPyoQuickTimerSnapshotState(val wireValue: String) {
  IDLE("idle"),
  ACTIVE("active"),
  PAUSED("paused"),
  EXPIRED("expired");

  companion object {
    fun fromWireValue(value: String): AlarmPyoQuickTimerSnapshotState? =
      entries.firstOrNull { it.wireValue == value }
  }
}

internal data class AlarmPyoQuickTimerSnapshot(
  val plan: AlarmPyoAlarmPlan?,
  val durationMinutes: Int?,
  val startedAt: Long,
  val startedAtElapsed: Long,
  val fireAtElapsed: Long,
  val bootCount: Int,
  val state: AlarmPyoQuickTimerSnapshotState,
  val pausedRemainingMillis: Long = 0L,
  val generation: Long = 0L
) {
  fun isActive(): Boolean = state == AlarmPyoQuickTimerSnapshotState.ACTIVE && plan != null
  fun isPaused(): Boolean = state == AlarmPyoQuickTimerSnapshotState.PAUSED && plan != null

  companion object {
    fun idle(
      state: AlarmPyoQuickTimerSnapshotState = AlarmPyoQuickTimerSnapshotState.IDLE,
      generation: Long = 0L
    ) = AlarmPyoQuickTimerSnapshot(
      plan = null,
      durationMinutes = null,
      startedAt = 0L,
      startedAtElapsed = 0L,
      fireAtElapsed = 0L,
      bootCount = -1,
      state = state,
      pausedRemainingMillis = 0L,
      generation = generation
    )
  }
}

internal data class AlarmPyoQuickTimerReadResult(
  val snapshot: AlarmPyoQuickTimerSnapshot?,
  val storageHealth: AlarmPyoQuickTimerStorageHealth
)

internal object AlarmPyoQuickTimerReplicaPolicy {
  fun select(
    primary: AlarmPyoQuickTimerSnapshot?,
    redundant: AlarmPyoQuickTimerSnapshot?,
    committedGeneration: Long
  ): AlarmPyoQuickTimerSnapshot? {
    val eligiblePrimary = primary?.takeIf { it.generation >= committedGeneration }
    val eligibleRedundant = redundant?.takeIf { it.generation >= committedGeneration }
    if (
      eligiblePrimary != null &&
      eligibleRedundant != null &&
      eligiblePrimary.generation == eligibleRedundant.generation &&
      eligiblePrimary != eligibleRedundant
    ) return null
    return listOfNotNull(eligiblePrimary, eligibleRedundant)
      .maxByOrNull(AlarmPyoQuickTimerSnapshot::generation)
  }
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
      }
        ?: return null
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

internal object AlarmPyoQuickTimerStore {
  private const val PRIMARY_PREFERENCES_NAME = "alarmpyo-quick-timer-v1-primary"
  private const val REDUNDANT_PREFERENCES_NAME = "alarmpyo-quick-timer-v1-redundant"
  private const val META_PREFERENCES_NAME = "alarmpyo-quick-timer-v1-meta"
  private const val KEY_ENVELOPE = "envelope"
  private const val KEY_STORAGE_HEALTH = "storage-health"
  private const val KEY_COMMITTED_GENERATION = "committed-generation"

  @Synchronized
  fun read(context: Context): AlarmPyoQuickTimerReadResult {
    val primaryRaw = preferences(context, PRIMARY_PREFERENCES_NAME).getString(KEY_ENVELOPE, null)
    val redundantRaw = preferences(context, REDUNDANT_PREFERENCES_NAME).getString(KEY_ENVELOPE, null)
    val primary = AlarmPyoQuickTimerCodec.decode(primaryRaw)
    val redundant = AlarmPyoQuickTimerCodec.decode(redundantRaw)
    val committedGeneration = committedGeneration(context)

    if (primaryRaw == null && redundantRaw == null && committedGeneration == 0L) {
      return AlarmPyoQuickTimerReadResult(
        AlarmPyoQuickTimerSnapshot.idle(),
        AlarmPyoQuickTimerStorageHealth.NORMAL
      )
    }

    if (
      primary != null &&
      redundant != null &&
      primary == redundant &&
      primary.generation >= committedGeneration
    ) {
      if (primary.generation > committedGeneration) {
        setCommittedGeneration(context, primary.generation)
      }
      return AlarmPyoQuickTimerReadResult(primary, storedHealth(context))
    }

    val recovered = AlarmPyoQuickTimerReplicaPolicy.select(
      primary,
      redundant,
      committedGeneration
    )
    if (recovered == null) {
      setHealth(context, AlarmPyoQuickTimerStorageHealth.CORRUPT)
      return AlarmPyoQuickTimerReadResult(null, AlarmPyoQuickTimerStorageHealth.CORRUPT)
    }

    val encoded = AlarmPyoQuickTimerCodec.encode(recovered)
    val primaryCommitted = preferences(context, PRIMARY_PREFERENCES_NAME)
      .edit().putString(KEY_ENVELOPE, encoded).commit()
    val redundantCommitted = preferences(context, REDUNDANT_PREFERENCES_NAME)
      .edit().putString(KEY_ENVELOPE, encoded).commit()
    if (!primaryCommitted || !redundantCommitted) {
      setHealth(context, AlarmPyoQuickTimerStorageHealth.CORRUPT)
      return AlarmPyoQuickTimerReadResult(null, AlarmPyoQuickTimerStorageHealth.CORRUPT)
    }
    setCommittedGeneration(context, recovered.generation)
    setHealth(context, AlarmPyoQuickTimerStorageHealth.RECOVERED)
    return AlarmPyoQuickTimerReadResult(recovered, AlarmPyoQuickTimerStorageHealth.RECOVERED)
  }

  @Synchronized
  fun writeAuthoritative(
    context: Context,
    desired: AlarmPyoQuickTimerSnapshot
  ): AlarmPyoQuickTimerSnapshot {
    val nextGeneration = nextGeneration(context)
    val snapshot = desired.copy(generation = nextGeneration)
    val encoded = AlarmPyoQuickTimerCodec.encode(snapshot)
    check(
      preferences(context, REDUNDANT_PREFERENCES_NAME)
        .edit().putString(KEY_ENVELOPE, encoded).commit()
    ) { "타이머 보조 저장소를 저장하지 못했습니다." }
    check(
      preferences(context, PRIMARY_PREFERENCES_NAME)
        .edit().putString(KEY_ENVELOPE, encoded).commit()
    ) { "타이머 기본 저장소를 저장하지 못했습니다." }
    setCommittedGeneration(context, snapshot.generation)
    setHealth(context, AlarmPyoQuickTimerStorageHealth.NORMAL)
    return snapshot
  }

  @Synchronized
  fun update(
    context: Context,
    transform: (AlarmPyoQuickTimerSnapshot) -> AlarmPyoQuickTimerSnapshot
  ): AlarmPyoQuickTimerSnapshot {
    val current = read(context)
    check(current.storageHealth != AlarmPyoQuickTimerStorageHealth.CORRUPT) {
      "타이머 저장소가 손상되어 명시적인 재설정이 필요합니다."
    }
    return writeAuthoritative(context, transform(requireNotNull(current.snapshot)))
  }

  fun storageHealth(context: Context): AlarmPyoQuickTimerStorageHealth = read(context).storageHealth

  private fun nextGeneration(context: Context): Long {
    val candidates = listOf(PRIMARY_PREFERENCES_NAME, REDUNDANT_PREFERENCES_NAME)
      .mapNotNull { name ->
        AlarmPyoQuickTimerCodec.decode(
          preferences(context, name).getString(KEY_ENVELOPE, null)
        )?.generation
      }
    val latest = maxOf(candidates.maxOrNull() ?: 0L, committedGeneration(context))
    check(latest < Long.MAX_VALUE) { "타이머 저장 세대가 허용 범위를 초과했습니다." }
    return latest + 1L
  }

  private fun committedGeneration(context: Context): Long =
    preferences(context, META_PREFERENCES_NAME)
      .getLong(KEY_COMMITTED_GENERATION, 0L)
      .coerceAtLeast(0L)

  private fun setCommittedGeneration(context: Context, generation: Long) {
    val meta = preferences(context, META_PREFERENCES_NAME)
    val current = meta.getLong(KEY_COMMITTED_GENERATION, 0L)
    if (generation <= current) return
    check(meta.edit().putLong(KEY_COMMITTED_GENERATION, generation).commit()) {
      "타이머 저장 세대 표식을 저장하지 못했습니다."
    }
  }

  private fun storedHealth(context: Context): AlarmPyoQuickTimerStorageHealth {
    val value = preferences(context, META_PREFERENCES_NAME)
      .getString(KEY_STORAGE_HEALTH, null)
    return AlarmPyoQuickTimerStorageHealth.entries.firstOrNull { it.wireValue == value }
      ?: AlarmPyoQuickTimerStorageHealth.NORMAL
  }

  private fun setHealth(context: Context, health: AlarmPyoQuickTimerStorageHealth) {
    preferences(context, META_PREFERENCES_NAME).edit()
      .putString(KEY_STORAGE_HEALTH, health.wireValue)
      .commit()
  }

  private fun preferences(context: Context, name: String) = storageContext(context)
    .getSharedPreferences(name, Context.MODE_PRIVATE)

  private fun storageContext(context: Context): Context =
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
      context.createDeviceProtectedStorageContext()
    } else {
      context.applicationContext
    }
}
