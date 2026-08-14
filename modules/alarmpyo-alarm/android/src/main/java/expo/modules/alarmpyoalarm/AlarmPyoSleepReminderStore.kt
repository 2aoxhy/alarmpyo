package expo.modules.alarmpyoalarm

import android.content.Context
import android.content.SharedPreferences
import android.os.Build
import java.security.MessageDigest
import org.json.JSONArray
import org.json.JSONObject

internal enum class AlarmPyoSleepReminderStorageHealth(val wireValue: String) {
  NORMAL("normal"),
  RECOVERED("recovered"),
  CORRUPT("corrupt")
}

internal data class AlarmPyoSleepReminderSnapshot(
  val plans: List<AlarmPyoSleepReminderPlan>,
  val scheduledIds: Set<String>,
  val generation: Long = 0L
)

internal data class AlarmPyoSleepReminderSnapshotEnvelope(
  val schemaVersion: Int,
  val generation: Long,
  val payload: String,
  val checksum: String
)

internal object AlarmPyoSleepReminderSnapshotCodec {
  const val SCHEMA_VERSION = 2
  private const val LEGACY_SCHEMA_VERSION = 1

  fun create(snapshot: AlarmPyoSleepReminderSnapshot): AlarmPyoSleepReminderSnapshotEnvelope {
    val payload = encodePayload(snapshot)
    return AlarmPyoSleepReminderSnapshotEnvelope(
      schemaVersion = SCHEMA_VERSION,
      generation = snapshot.generation,
      payload = payload,
      checksum = checksum(SCHEMA_VERSION, snapshot.generation, payload)
    )
  }

  fun decode(
    envelope: AlarmPyoSleepReminderSnapshotEnvelope
  ): AlarmPyoSleepReminderSnapshot? {
    if (
      envelope.schemaVersion != SCHEMA_VERSION ||
      envelope.generation <= 0L ||
      envelope.payload.isBlank() ||
      !checksum(
        envelope.schemaVersion,
        envelope.generation,
        envelope.payload
      ).equals(envelope.checksum, ignoreCase = true)
    ) return null
    return decodePayload(envelope.payload, envelope.generation)
  }

  /** Reads the single-string v1 format. It is only written by older APKs. */
  fun decodeLegacy(raw: String): AlarmPyoSleepReminderSnapshot? = runCatching {
    val json = JSONObject(raw)
    if (json.getInt("schemaVersion") != LEGACY_SCHEMA_VERSION) return null
    decodePayload(json.toString(), generation = 0L, legacyEnvelope = true)
  }.getOrNull()

  internal fun selectBest(
    current: AlarmPyoSleepReminderSnapshotEnvelope?,
    previous: AlarmPyoSleepReminderSnapshotEnvelope?
  ): Pair<AlarmPyoSleepReminderSnapshot?, Boolean> {
    val currentSnapshot = current?.let(::decode)
    val previousSnapshot = previous?.let(::decode)
    // Generation rolls from MAX-1 to 1 only on an authoritative reseed/cancellation. In that
    // single protected boundary, current starts a new epoch and must outrank the previous epoch.
    val selected = if (
      currentSnapshot?.generation == 1L &&
      (previousSnapshot?.generation ?: 0L) >= Long.MAX_VALUE - 1L
    ) {
      currentSnapshot
    } else {
      listOfNotNull(currentSnapshot, previousSnapshot)
        .maxByOrNull(AlarmPyoSleepReminderSnapshot::generation)
    }
    val recovered = selected != null && (
      currentSnapshot == null || selected.generation != currentSnapshot.generation
      )
    return selected to recovered
  }

  internal fun nextGenerationForReseed(
    current: AlarmPyoSleepReminderSnapshotEnvelope?,
    previous: AlarmPyoSleepReminderSnapshotEnvelope?
  ): Long {
    // checksum 검증에 실패한 봉투의 세대 값은 손상된 메타데이터일 수 있으므로
    // authoritative JS 계획을 재시드할 때 절대 신뢰하지 않아요.
    val latestValidGeneration = listOfNotNull(
      current?.let(::decode)?.generation,
      previous?.let(::decode)?.generation
    ).maxOrNull() ?: 0L
    if (latestValidGeneration >= Long.MAX_VALUE - 1L) return 1L
    return latestValidGeneration + 1L
  }

  /** Kept for codec-level compatibility tests of the legacy v1 representation. */
  fun encode(snapshot: AlarmPyoSleepReminderSnapshot): String = JSONObject()
    .put("schemaVersion", LEGACY_SCHEMA_VERSION)
    .put("plans", JSONArray().apply {
      AlarmPyoSleepReminderPolicy.normalize(snapshot.plans).forEach { put(it.toJson()) }
    })
    .put("scheduledIds", JSONArray().apply {
      snapshot.scheduledIds.sorted().forEach { put(it) }
    })
    .toString()

  /** Kept for callers that explicitly exercise the legacy codec. */
  fun decode(raw: String): AlarmPyoSleepReminderSnapshot? = decodeLegacy(raw)

  private fun encodePayload(snapshot: AlarmPyoSleepReminderSnapshot): String = JSONObject()
    .put("plans", JSONArray().apply {
      AlarmPyoSleepReminderPolicy.normalize(snapshot.plans).forEach { put(it.toJson()) }
    })
    .put("scheduledIds", JSONArray().apply {
      snapshot.scheduledIds.sorted().forEach { put(it) }
    })
    .toString()

  private fun decodePayload(
    raw: String,
    generation: Long,
    legacyEnvelope: Boolean = false
  ): AlarmPyoSleepReminderSnapshot? = runCatching {
    val json = JSONObject(raw)
    val plansJson = json.getJSONArray("plans")
    if (plansJson.length() > MAX_STORED_SLEEP_REMINDERS) return null
    val plans = buildList {
      for (index in 0 until plansJson.length()) {
        val plan = AlarmPyoSleepReminderPlan.fromJson(plansJson.getJSONObject(index)) ?: return null
        add(plan)
      }
    }
    val normalized = AlarmPyoSleepReminderPolicy.normalize(plans)
    if (normalized.size != plans.size) return null
    val planIds = normalized.mapTo(hashSetOf(), AlarmPyoSleepReminderPlan::id)
    val scheduledJson = json.getJSONArray("scheduledIds")
    val scheduledIds = buildSet {
      for (index in 0 until scheduledJson.length()) {
        val id = scheduledJson.getString(index).trim()
        if (id.isBlank() || id !in planIds) return null
        add(id)
      }
    }
    if (scheduledIds.size > MAX_SCHEDULED_SLEEP_REMINDERS) return null
    AlarmPyoSleepReminderSnapshot(
      plans = normalized,
      scheduledIds = scheduledIds,
      generation = if (legacyEnvelope) 0L else generation
    )
  }.getOrNull()

  private fun checksum(schemaVersion: Int, generation: Long, payload: String): String =
    MessageDigest.getInstance("SHA-256")
    .digest("$schemaVersion\n$generation\n$payload".toByteArray(Charsets.UTF_8))
    .joinToString("") { byte -> "%02x".format(byte.toInt() and 0xff) }
}

internal interface AlarmPyoSleepReminderPersistence {
  fun hasV2Values(): Boolean
  fun readLegacy(): Result<String?>
  fun readCurrent(): AlarmPyoSleepReminderSnapshotEnvelope?
  fun readPrevious(): AlarmPyoSleepReminderSnapshotEnvelope?
  fun writeCurrent(envelope: AlarmPyoSleepReminderSnapshotEnvelope)
  fun writePrevious(envelope: AlarmPyoSleepReminderSnapshotEnvelope)
  fun clearLegacy()
  fun readHealth(): AlarmPyoSleepReminderStorageHealth
  fun writeHealth(health: AlarmPyoSleepReminderStorageHealth)
  fun readRollbackFloor(): Long = 0L
  fun writeRollbackFloor(generation: Long) = Unit
}

/**
 * Pure storage state machine. Android SharedPreferences is kept behind a small adapter so JVM
 * tests can exercise recovery, legacy promotion and corrupt retry behavior as complete flows.
 */
internal class AlarmPyoSleepReminderStoreEngine(
  private val persistence: AlarmPyoSleepReminderPersistence
) {
  fun read(): AlarmPyoSleepReminderSnapshot? {
    val hasV2Values = runCatching { persistence.hasV2Values() }
      .getOrElse {
        persistence.writeHealth(AlarmPyoSleepReminderStorageHealth.CORRUPT)
        return null
      }
    if (!hasV2Values) return readLegacyOrEmpty()

    val (current, previous) = runCatching {
      persistence.readCurrent() to persistence.readPrevious()
    }.getOrElse {
      persistence.writeHealth(AlarmPyoSleepReminderStorageHealth.CORRUPT)
      return null
    }
    val rollbackFloor = persistence.readRollbackFloor().coerceAtLeast(0L)
    val eligibleCurrent = current?.takeIf { envelope ->
      AlarmPyoSleepReminderSnapshotCodec.decode(envelope)
        ?.generation?.let { it >= rollbackFloor } == true
    }
    val eligiblePrevious = previous?.takeIf { envelope ->
      AlarmPyoSleepReminderSnapshotCodec.decode(envelope)
        ?.generation?.let { it >= rollbackFloor } == true
    }
    val (selected, recovered) = AlarmPyoSleepReminderSnapshotCodec.selectBest(
      eligibleCurrent,
      eligiblePrevious
    )
    if (selected == null) {
      persistence.writeHealth(AlarmPyoSleepReminderStorageHealth.CORRUPT)
      return null
    }
    if (recovered) {
      persistence.writeCurrent(AlarmPyoSleepReminderSnapshotCodec.create(selected))
      persistence.writeHealth(AlarmPyoSleepReminderStorageHealth.RECOVERED)
    }
    return selected
  }

  fun write(snapshot: AlarmPyoSleepReminderSnapshot): AlarmPyoSleepReminderSnapshot {
    val current = requireNotNull(read()) {
      "수면 시작 알림 저장소가 손상되어 계획을 덮어쓰지 않았어요."
    }
    val resetsRollbackEpoch = current.generation >= Long.MAX_VALUE - 1L
    val desired = normalizedSnapshot(
      snapshot,
      if (resetsRollbackEpoch) 1L else current.generation + 1L
    )
    val healthBeforeWrite = persistence.readHealth()
    persistence.readCurrent()
      ?.takeIf { AlarmPyoSleepReminderSnapshotCodec.decode(it) != null }
      ?.let(persistence::writePrevious)
    persistence.writeCurrent(AlarmPyoSleepReminderSnapshotCodec.create(desired))
    if (resetsRollbackEpoch) persistence.writeRollbackFloor(0L)
    if (current.generation == 0L) persistence.clearLegacy()
    persistence.writeHealth(
      if (healthBeforeWrite == AlarmPyoSleepReminderStorageHealth.RECOVERED) {
        AlarmPyoSleepReminderStorageHealth.RECOVERED
      } else {
        AlarmPyoSleepReminderStorageHealth.NORMAL
      }
    )
    return desired
  }

  fun reseedAfterCorruption(
    snapshot: AlarmPyoSleepReminderSnapshot
  ): AlarmPyoSleepReminderSnapshot {
    check(persistence.readHealth() == AlarmPyoSleepReminderStorageHealth.CORRUPT) {
      "손상되지 않은 수면 시작 알림 저장소는 재시드하지 않아요."
    }
    val current = persistence.readCurrent()
    val previous = persistence.readPrevious()
    val codecGeneration = AlarmPyoSleepReminderSnapshotCodec.nextGenerationForReseed(
      current,
      previous
    )
    val rollbackFloor = persistence.readRollbackFloor().coerceAtLeast(0L)
    val resetsRollbackEpoch = rollbackFloor >= Long.MAX_VALUE - 1L
    val generation = if (resetsRollbackEpoch) 1L else {
      maxOf(codecGeneration, rollbackFloor + 1L)
    }
    val desired = normalizedSnapshot(
      snapshot,
      generation
    )
    // Corrupt generations are deliberately not rotated into previous.
    persistence.writeCurrent(AlarmPyoSleepReminderSnapshotCodec.create(desired))
    if (resetsRollbackEpoch) persistence.writeRollbackFloor(0L)
    persistence.clearLegacy()
    persistence.writeHealth(AlarmPyoSleepReminderStorageHealth.RECOVERED)
    return desired
  }

  fun clear(): AlarmPyoSleepReminderSnapshot = commitCancellationTombstone()

  fun commitCancellationTombstone(): AlarmPyoSleepReminderSnapshot {
    val current = persistence.readCurrent()
    val previous = persistence.readPrevious()
    val latestValidGeneration = listOfNotNull(current, previous)
      .mapNotNull(AlarmPyoSleepReminderSnapshotCodec::decode)
      .maxOfOrNull(AlarmPyoSleepReminderSnapshot::generation) ?: 0L
    val latestGeneration = maxOf(
      latestValidGeneration,
      persistence.readRollbackFloor().coerceAtLeast(0L)
    )
    val generation = if (latestGeneration >= Long.MAX_VALUE - 1L) {
      1L
    } else {
      latestGeneration + 1L
    }
    val tombstone = AlarmPyoSleepReminderSnapshot(emptyList(), emptySet(), generation)
    val envelope = AlarmPyoSleepReminderSnapshotCodec.create(tombstone)
    persistence.writePrevious(envelope)
    persistence.writeCurrent(envelope)
    persistence.writeRollbackFloor(generation)
    persistence.clearLegacy()
    persistence.writeHealth(AlarmPyoSleepReminderStorageHealth.NORMAL)
    return tombstone
  }

  fun markHealthy() {
    persistence.writeHealth(AlarmPyoSleepReminderStorageHealth.NORMAL)
  }

  fun storageHealth(): AlarmPyoSleepReminderStorageHealth {
    read()
    return persistence.readHealth()
  }

  private fun readLegacyOrEmpty(): AlarmPyoSleepReminderSnapshot? {
    val raw = persistence.readLegacy().getOrElse {
      persistence.writeHealth(AlarmPyoSleepReminderStorageHealth.CORRUPT)
      return null
    } ?: return AlarmPyoSleepReminderSnapshot(emptyList(), emptySet())
    val decoded = AlarmPyoSleepReminderSnapshotCodec.decodeLegacy(raw)
    if (decoded == null) {
      persistence.writeHealth(AlarmPyoSleepReminderStorageHealth.CORRUPT)
      return null
    }
    return decoded
  }

  private fun normalizedSnapshot(
    snapshot: AlarmPyoSleepReminderSnapshot,
    generation: Long
  ): AlarmPyoSleepReminderSnapshot {
    val normalized = AlarmPyoSleepReminderPolicy.normalize(snapshot.plans)
    require(normalized.size <= MAX_STORED_SLEEP_REMINDERS) {
      "수면 시작 알림 계획이 너무 많아요."
    }
    require(normalized.size == snapshot.plans.size) {
      "중복된 수면 시작 알림이 있어요."
    }
    val planIds = normalized.mapTo(hashSetOf(), AlarmPyoSleepReminderPlan::id)
    val scheduledIds = snapshot.scheduledIds.filterTo(linkedSetOf()) { it in planIds }
      .take(MAX_SCHEDULED_SLEEP_REMINDERS)
      .toSet()
    return AlarmPyoSleepReminderSnapshot(normalized, scheduledIds, generation)
  }
}

internal object AlarmPyoSleepReminderStore {
  private const val LEGACY_PREFERENCES_NAME = "alarmpyo-sleep-reminders-v1"
  private const val CURRENT_PREFERENCES_NAME = "alarmpyo-sleep-reminders-v2-current"
  private const val PREVIOUS_PREFERENCES_NAME = "alarmpyo-sleep-reminders-v2-previous"
  private const val META_PREFERENCES_NAME = "alarmpyo-sleep-reminders-v2-meta"
  private const val KEY_LEGACY_SNAPSHOT = "snapshot"
  private const val KEY_SCHEMA_VERSION = "schema-version"
  private const val KEY_GENERATION = "generation"
  private const val KEY_PAYLOAD = "payload"
  private const val KEY_CHECKSUM = "checksum"
  private const val KEY_LAST_STORAGE_HEALTH = "last-storage-health"
  private const val KEY_ROLLBACK_FLOOR = "explicit-cancel-generation-floor"

  @Synchronized
  fun read(context: Context): AlarmPyoSleepReminderSnapshot? = engine(context).read()

  @Synchronized
  fun write(
    context: Context,
    snapshot: AlarmPyoSleepReminderSnapshot
  ): AlarmPyoSleepReminderSnapshot = engine(context).write(snapshot)

  /**
   * A foreground JS sync is authoritative and may reseed two corrupt generations. Corrupt
   * envelopes are deliberately neither rotated nor interpreted as known scheduled IDs.
   */
  @Synchronized
  fun reseedAfterCorruption(
    context: Context,
    snapshot: AlarmPyoSleepReminderSnapshot
  ): AlarmPyoSleepReminderSnapshot = engine(context).reseedAfterCorruption(snapshot)

  fun clear(context: Context): AlarmPyoSleepReminderSnapshot =
    engine(context).clear()

  fun markHealthy(context: Context) {
    engine(context).markHealthy()
  }

  fun storageHealth(context: Context): AlarmPyoSleepReminderStorageHealth =
    engine(context).storageHealth()

  private fun engine(context: Context): AlarmPyoSleepReminderStoreEngine =
    AlarmPyoSleepReminderStoreEngine(SharedPreferencesPersistence(storageContext(context)))

  private fun storageContext(context: Context): Context {
    val applicationContext = context.applicationContext
    return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
      applicationContext.createDeviceProtectedStorageContext()
    } else {
      applicationContext
    }
  }

  private class SharedPreferencesPersistence(context: Context) :
    AlarmPyoSleepReminderPersistence {
    private val legacy = context.getSharedPreferences(LEGACY_PREFERENCES_NAME, Context.MODE_PRIVATE)
    private val current = context.getSharedPreferences(CURRENT_PREFERENCES_NAME, Context.MODE_PRIVATE)
    private val previous = context.getSharedPreferences(PREVIOUS_PREFERENCES_NAME, Context.MODE_PRIVATE)
    private val meta = context.getSharedPreferences(META_PREFERENCES_NAME, Context.MODE_PRIVATE)

    override fun hasV2Values(): Boolean = current.all.isNotEmpty() || previous.all.isNotEmpty()

    override fun readLegacy(): Result<String?> = runCatching {
      legacy.getString(KEY_LEGACY_SNAPSHOT, null)
    }

    override fun readCurrent(): AlarmPyoSleepReminderSnapshotEnvelope? = readEnvelope(current)

    override fun readPrevious(): AlarmPyoSleepReminderSnapshotEnvelope? = readEnvelope(previous)

    override fun writeCurrent(envelope: AlarmPyoSleepReminderSnapshotEnvelope) {
      requireCommitted(writeEnvelope(current, envelope), "수면 시작 알림 계획")
    }

    override fun writePrevious(envelope: AlarmPyoSleepReminderSnapshotEnvelope) {
      requireCommitted(writeEnvelope(previous, envelope), "직전 수면 시작 알림 계획")
    }

    override fun clearLegacy() {
      requireCommitted(
        legacy.edit().remove(KEY_LEGACY_SNAPSHOT).commit(),
        "기존 수면 시작 알림 계획 정리"
      )
    }

    override fun readHealth(): AlarmPyoSleepReminderStorageHealth {
      val raw = meta.getString(KEY_LAST_STORAGE_HEALTH, null)
      return AlarmPyoSleepReminderStorageHealth.entries.firstOrNull { it.wireValue == raw }
        ?: AlarmPyoSleepReminderStorageHealth.NORMAL
    }

    override fun writeHealth(health: AlarmPyoSleepReminderStorageHealth) {
      requireCommitted(
        meta.edit().putString(KEY_LAST_STORAGE_HEALTH, health.wireValue).commit(),
        "수면 시작 알림 저장소 상태"
      )
    }

    override fun readRollbackFloor(): Long = meta
      .getLong(KEY_ROLLBACK_FLOOR, 0L)
      .coerceAtLeast(0L)

    override fun writeRollbackFloor(generation: Long) {
      requireCommitted(
        meta.edit().putLong(
          KEY_ROLLBACK_FLOOR,
          generation.coerceAtLeast(0L)
        ).commit(),
        "명시적 수면 알림 취소 표식"
      )
    }

    private fun readEnvelope(values: SharedPreferences): AlarmPyoSleepReminderSnapshotEnvelope? {
      if (values.all.isEmpty()) return null
      return runCatching {
        AlarmPyoSleepReminderSnapshotEnvelope(
          schemaVersion = values.getInt(KEY_SCHEMA_VERSION, -1),
          generation = values.getLong(KEY_GENERATION, -1L),
          payload = values.getString(KEY_PAYLOAD, null).orEmpty(),
          checksum = values.getString(KEY_CHECKSUM, null).orEmpty()
        )
      }.getOrNull()
    }

    private fun writeEnvelope(
      values: SharedPreferences,
      envelope: AlarmPyoSleepReminderSnapshotEnvelope
    ): Boolean = values.edit()
      .clear()
      .putInt(KEY_SCHEMA_VERSION, envelope.schemaVersion)
      .putLong(KEY_GENERATION, envelope.generation)
      .putString(KEY_PAYLOAD, envelope.payload)
      .putString(KEY_CHECKSUM, envelope.checksum)
      .commit()
  }

  private fun requireCommitted(committed: Boolean, label: String) {
    check(committed) { "$label 저장에 실패했어요." }
  }
}
