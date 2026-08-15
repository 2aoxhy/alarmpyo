package expo.modules.alarmpyoalarm

import android.content.Context
import android.content.SharedPreferences
import android.os.Build
import android.os.UserManager
import java.security.MessageDigest
import org.json.JSONArray
import org.json.JSONObject

internal enum class AlarmPyoAlarmStorageHealth(val wireValue: String) {
  NORMAL("normal"),
  RECOVERED("recovered"),
  CORRUPT("corrupt")
}

internal data class AlarmPyoAlarmScheduleSnapshot(
  val plans: List<AlarmPyoAlarmPlan>,
  val scheduledIds: Set<String>,
  val singleRepeats: List<AlarmPyoAlarmPlan>,
  val generation: Long,
  val committedAt: Long
)

internal data class AlarmPyoAlarmSnapshotEnvelope(
  val schemaVersion: Int,
  val generation: Long,
  val committedAt: Long,
  val payload: String,
  val checksum: String
)

internal object AlarmPyoAlarmSnapshotCodec {
  const val SCHEMA_VERSION = 3
  private const val LEGACY_SCHEMA_VERSION = 2

  fun create(
    snapshot: AlarmPyoAlarmScheduleSnapshot,
    committedAt: Long = snapshot.committedAt
  ): AlarmPyoAlarmSnapshotEnvelope {
    val payload = encodePayload(snapshot)
    return AlarmPyoAlarmSnapshotEnvelope(
      schemaVersion = SCHEMA_VERSION,
      generation = snapshot.generation,
      committedAt = committedAt,
      payload = payload,
      checksum = checksum(SCHEMA_VERSION, snapshot.generation, committedAt, payload)
    )
  }

  internal fun createLegacy(
    snapshot: AlarmPyoAlarmScheduleSnapshot
  ): AlarmPyoAlarmSnapshotEnvelope {
    val payload = encodePayload(snapshot)
    return AlarmPyoAlarmSnapshotEnvelope(
      schemaVersion = LEGACY_SCHEMA_VERSION,
      generation = snapshot.generation,
      committedAt = snapshot.committedAt,
      payload = payload,
      checksum = legacyChecksum(payload)
    )
  }

  fun decode(envelope: AlarmPyoAlarmSnapshotEnvelope): AlarmPyoAlarmScheduleSnapshot? {
    if (
      envelope.schemaVersion !in setOf(LEGACY_SCHEMA_VERSION, SCHEMA_VERSION) ||
      envelope.generation <= 0L ||
      envelope.committedAt <= 0L ||
      envelope.payload.isBlank() ||
      !expectedChecksum(envelope).equals(envelope.checksum, ignoreCase = true)
    ) return null
    return decodePayload(
      envelope.payload,
      generation = envelope.generation,
      committedAt = envelope.committedAt
    )
  }

  internal fun selectBest(
    primary: AlarmPyoAlarmSnapshotEnvelope?,
    previous: AlarmPyoAlarmSnapshotEnvelope?
  ): Pair<AlarmPyoAlarmScheduleSnapshot?, Boolean> {
    val primarySnapshot = primary?.let(::decode)
    val previousSnapshot = previous?.let(::decode)
    // Primary is the committed current generation. In particular, schema v2 generation and
    // committedAt were not checksum-protected, so they must never outrank a valid primary.
    val selected = primarySnapshot ?: previousSnapshot
    val recovered = primarySnapshot == null && previousSnapshot != null
    return selected to recovered
  }

  internal fun isLegacy(envelope: AlarmPyoAlarmSnapshotEnvelope?): Boolean =
    envelope?.schemaVersion == LEGACY_SCHEMA_VERSION

  private fun encodePayload(snapshot: AlarmPyoAlarmScheduleSnapshot): String = JSONObject()
    .put("plans", JSONArray().apply {
      snapshot.plans.sortedBy(AlarmPyoAlarmPlan::alarmAt).forEach { put(it.toJson()) }
    })
    .put("scheduledIds", JSONArray().apply {
      snapshot.scheduledIds.sorted().forEach { put(it) }
    })
    .put("singleRepeats", JSONArray().apply {
      snapshot.singleRepeats.sortedBy(AlarmPyoAlarmPlan::alarmAt).forEach { put(it.toJson()) }
    })
    .toString()

  private fun decodePayload(
    raw: String,
    generation: Long,
    committedAt: Long
  ): AlarmPyoAlarmScheduleSnapshot? = runCatching {
    val json = JSONObject(raw)
    val plans = decodePlans(json.getJSONArray("plans"), singleRepeatsOnly = false)
      ?: return null
    val repeats = decodePlans(json.getJSONArray("singleRepeats"), singleRepeatsOnly = true)
      ?: return null
    val idsArray = json.getJSONArray("scheduledIds")
    val scheduledIds = linkedSetOf<String>()
    for (index in 0 until idsArray.length()) {
      val id = idsArray.getString(index).trim()
      if (id.isBlank()) return null
      scheduledIds.add(id)
    }
    AlarmPyoAlarmScheduleSnapshot(
      plans = plans.distinctBy(AlarmPyoAlarmPlan::id).sortedBy(AlarmPyoAlarmPlan::alarmAt),
      scheduledIds = scheduledIds,
      singleRepeats = repeats.distinctBy(AlarmPyoAlarmPlan::rootPlanId)
        .sortedBy(AlarmPyoAlarmPlan::alarmAt),
      generation = generation,
      committedAt = committedAt
    )
  }.getOrNull()

  private fun decodePlans(
    array: JSONArray,
    singleRepeatsOnly: Boolean
  ): List<AlarmPyoAlarmPlan>? {
    val result = mutableListOf<AlarmPyoAlarmPlan>()
    for (index in 0 until array.length()) {
      val plan = AlarmPyoAlarmPlan.fromJson(array.getJSONObject(index)) ?: return null
      if (plan.id.isBlank() || plan.alarmAt <= 0L) return null
      if (singleRepeatsOnly && !plan.isSingleRepeat()) return null
      if (!singleRepeatsOnly && plan.isSingleRepeat()) return null
      result.add(plan)
    }
    return result
  }

  private fun expectedChecksum(envelope: AlarmPyoAlarmSnapshotEnvelope): String =
    if (isLegacy(envelope)) {
      legacyChecksum(envelope.payload)
    } else {
      checksum(
        envelope.schemaVersion,
        envelope.generation,
        envelope.committedAt,
        envelope.payload
      )
    }

  private fun legacyChecksum(payload: String): String = sha256(payload)

  private fun checksum(
    schemaVersion: Int,
    generation: Long,
    committedAt: Long,
    payload: String
  ): String = sha256("$schemaVersion\n$generation\n$committedAt\n$payload")

  private fun sha256(value: String): String = MessageDigest.getInstance("SHA-256")
    .digest(value.toByteArray(Charsets.UTF_8))
    .joinToString("") { byte -> "%02x".format(byte.toInt() and 0xff) }
}

internal enum class AlarmPyoAlarmStoreFailureCode {
  CORRUPT_SNAPSHOT
}

/**
 * A typed failure for mutations that cannot safely infer the schedule from durable storage.
 * Callers must not translate this into an empty, successful schedule.
 */
internal class AlarmPyoAlarmStoreMutationException(
  val code: AlarmPyoAlarmStoreFailureCode
) : IllegalStateException("근무 알람 저장소가 손상되어 계획을 변경하지 않았습니다.")

internal interface AlarmPyoAlarmSnapshotPersistence {
  fun readPrimary(): AlarmPyoAlarmSnapshotEnvelope?
  fun readPrevious(): AlarmPyoAlarmSnapshotEnvelope?
  fun writePrimary(envelope: AlarmPyoAlarmSnapshotEnvelope)
  fun writePrevious(envelope: AlarmPyoAlarmSnapshotEnvelope)
  fun readHealth(): AlarmPyoAlarmStorageHealth
  fun writeHealth(health: AlarmPyoAlarmStorageHealth)
  fun readRollbackFloor(): Long = 0L
  fun writeRollbackFloor(generation: Long) = Unit
}

/**
 * Durable snapshot state machine kept independent from Android so corruption and interrupted
 * recovery can be exercised as complete JVM tests.
 */
internal class AlarmPyoAlarmStoreEngine(
  private val persistence: AlarmPyoAlarmSnapshotPersistence,
  private val nowMillis: () -> Long = System::currentTimeMillis
) {
  fun read(): AlarmPyoAlarmScheduleSnapshot? {
    val (primary, previous) = runCatching {
      persistence.readPrimary() to persistence.readPrevious()
    }.getOrElse {
      persistence.writeHealth(AlarmPyoAlarmStorageHealth.CORRUPT)
      return null
    }
    val rollbackFloor = persistence.readRollbackFloor().coerceAtLeast(0L)
    val eligiblePrimary = primary?.takeIf { envelope ->
      AlarmPyoAlarmSnapshotCodec.decode(envelope)?.generation?.let { it >= rollbackFloor } == true
    }
    val eligiblePrevious = previous?.takeIf { envelope ->
      AlarmPyoAlarmSnapshotCodec.decode(envelope)?.generation?.let { it >= rollbackFloor } == true
    }
    val (selected, recovered) = AlarmPyoAlarmSnapshotCodec.selectBest(
      eligiblePrimary,
      eligiblePrevious
    )
    if (selected == null) {
      persistence.writeHealth(AlarmPyoAlarmStorageHealth.CORRUPT)
      return null
    }
    val selectedEnvelope = if (
      eligiblePrimary?.let(AlarmPyoAlarmSnapshotCodec::decode) != null
    ) {
      eligiblePrimary
    } else {
      eligiblePrevious
    }
    val promoted = if (AlarmPyoAlarmSnapshotCodec.isLegacy(selectedEnvelope)) {
      // Schema v2 metadata was not protected. Preserve only the decoded payload and establish a
      // fresh local sequence instead of trusting a forged generation or timestamp.
      selected.copy(
        generation = 1L,
        committedAt = nowMillis().coerceAtLeast(1L)
      )
    } else {
      selected
    }
    if (recovered || promoted !== selected) {
      persistence.writePrimary(AlarmPyoAlarmSnapshotCodec.create(promoted))
    }
    if (recovered) {
      persistence.writeHealth(AlarmPyoAlarmStorageHealth.RECOVERED)
    }
    return promoted
  }

  fun write(
    allowCorruptRecovery: Boolean = false,
    transform: (AlarmPyoAlarmScheduleSnapshot) -> AlarmPyoAlarmScheduleSnapshot
  ): AlarmPyoAlarmScheduleSnapshot {
    val current = read() ?: throw corruptMutationFailure()
    val healthBeforeWrite = persistence.readHealth()
    if (healthBeforeWrite == AlarmPyoAlarmStorageHealth.CORRUPT && !allowCorruptRecovery) {
      throw corruptMutationFailure()
    }
    val committedAt = nextCommittedAt(current.committedAt)
    val desired = transform(current).copy(
      generation = nextGeneration(current.generation),
      committedAt = committedAt
    )
    val resetsRollbackEpoch = desired.generation == 1L &&
      persistence.readRollbackFloor() >= Long.MAX_VALUE - 1L

    // During authoritative recovery the previous corrupt envelope is evidence and a rollback
    // boundary. Keep it untouched until the scheduler has reconciled successfully.
    if (healthBeforeWrite != AlarmPyoAlarmStorageHealth.CORRUPT) {
      persistence.readPrimary()
        ?.takeIf { AlarmPyoAlarmSnapshotCodec.decode(it) != null }
        ?.let(persistence::writePrevious)
    }
    persistence.writePrimary(AlarmPyoAlarmSnapshotCodec.create(desired))
    if (resetsRollbackEpoch) persistence.writeRollbackFloor(0L)
    persistence.writeHealth(
      when (healthBeforeWrite) {
        AlarmPyoAlarmStorageHealth.CORRUPT -> AlarmPyoAlarmStorageHealth.CORRUPT
        AlarmPyoAlarmStorageHealth.RECOVERED -> AlarmPyoAlarmStorageHealth.RECOVERED
        AlarmPyoAlarmStorageHealth.NORMAL -> AlarmPyoAlarmStorageHealth.NORMAL
      }
    )
    return desired
  }

  /**
   * Replaces only current with an authoritative JS schedule. Health deliberately remains corrupt
   * until AlarmManager reconciliation and all follow-up work have succeeded.
   */
  fun reseedAfterCorruption(
    snapshot: AlarmPyoAlarmScheduleSnapshot
  ): AlarmPyoAlarmScheduleSnapshot {
    check(persistence.readHealth() == AlarmPyoAlarmStorageHealth.CORRUPT) {
      "정상 근무 알람 저장소를 손상 복구 경로로 다시 쓰지 않습니다."
    }
    val primary = persistence.readPrimary()
    val previous = persistence.readPrevious()
    val validSnapshots = listOfNotNull(primary, previous)
      .filterNot(AlarmPyoAlarmSnapshotCodec::isLegacy)
      .mapNotNull(AlarmPyoAlarmSnapshotCodec::decode)
    val latestGeneration = maxOf(
      validSnapshots.maxOfOrNull(AlarmPyoAlarmScheduleSnapshot::generation) ?: 0L,
      persistence.readRollbackFloor().coerceAtLeast(0L)
    )
    val resetsRollbackEpoch = latestGeneration >= Long.MAX_VALUE - 1L
    val generation = if (resetsRollbackEpoch) 1L else {
      latestGeneration + 1L
    }
    val latestCommittedAt = validSnapshots.maxOfOrNull(AlarmPyoAlarmScheduleSnapshot::committedAt)
      ?: 0L
    val desired = snapshot.copy(
      generation = generation,
      committedAt = nextCommittedAt(latestCommittedAt)
    )
    persistence.writePrimary(AlarmPyoAlarmSnapshotCodec.create(desired))
    if (resetsRollbackEpoch) persistence.writeRollbackFloor(0L)
    return desired
  }

  /**
   * An explicit cancellation is written to both replicas before its rollback floor is committed.
   * A later corrupt primary can therefore never resurrect a pre-cancellation active generation.
   */
  fun commitCancellationTombstone(): AlarmPyoAlarmScheduleSnapshot {
    val validSnapshots = listOfNotNull(
      persistence.readPrimary(),
      persistence.readPrevious()
    ).filterNot(AlarmPyoAlarmSnapshotCodec::isLegacy)
      .mapNotNull(AlarmPyoAlarmSnapshotCodec::decode)
    val latestGeneration = maxOf(
      validSnapshots.maxOfOrNull(AlarmPyoAlarmScheduleSnapshot::generation) ?: 0L,
      persistence.readRollbackFloor().coerceAtLeast(0L)
    )
    val latestCommittedAt = validSnapshots
      .maxOfOrNull(AlarmPyoAlarmScheduleSnapshot::committedAt) ?: 0L
    val tombstone = AlarmPyoAlarmScheduleSnapshot(
      plans = emptyList(),
      scheduledIds = emptySet(),
      singleRepeats = emptyList(),
      generation = if (latestGeneration >= Long.MAX_VALUE - 1L) 1L else latestGeneration + 1L,
      committedAt = nextCommittedAt(latestCommittedAt)
    )
    val envelope = AlarmPyoAlarmSnapshotCodec.create(tombstone)
    persistence.writePrevious(envelope)
    persistence.writePrimary(envelope)
    persistence.writeRollbackFloor(tombstone.generation)
    persistence.writeHealth(AlarmPyoAlarmStorageHealth.NORMAL)
    return tombstone
  }

  fun markHealthy() {
    if (read() == null) throw corruptMutationFailure()
    persistence.writeHealth(AlarmPyoAlarmStorageHealth.NORMAL)
  }

  fun storageHealth(): AlarmPyoAlarmStorageHealth {
    read()
    return persistence.readHealth()
  }

  fun requireWritableSnapshot(): AlarmPyoAlarmScheduleSnapshot {
    val snapshot = read() ?: throw corruptMutationFailure()
    if (persistence.readHealth() == AlarmPyoAlarmStorageHealth.CORRUPT) {
      throw corruptMutationFailure()
    }
    return snapshot
  }

  private fun corruptMutationFailure() = AlarmPyoAlarmStoreMutationException(
    AlarmPyoAlarmStoreFailureCode.CORRUPT_SNAPSHOT
  )

  private fun nextGeneration(current: Long): Long =
    if (current >= Long.MAX_VALUE - 1L) 1L else current + 1L

  private fun nextCommittedAt(current: Long): Long =
    if (current >= Long.MAX_VALUE - 1L) {
      nowMillis().coerceAtLeast(1L)
    } else {
      nowMillis().coerceAtLeast(current + 1L).coerceAtLeast(1L)
    }
}

internal object AlarmPyoAlarmStore {
  private const val LEGACY_PREFERENCES_NAME = "alarmpyo-alarm-v1"
  private const val PRIMARY_PREFERENCES_NAME = "alarmpyo-alarm-v2-primary"
  private const val PREVIOUS_PREFERENCES_NAME = "alarmpyo-alarm-v2-previous"
  private const val META_PREFERENCES_NAME = "alarmpyo-alarm-v2-meta"
  private const val KEY_PLANS = "plans"
  private const val KEY_SCHEDULED_IDS = "scheduled-ids"
  private const val KEY_TEST_ALARM_AT = "test-alarm-at"
  private const val KEY_SINGLE_REPEATS = "single-repeats-v1"
  private const val KEY_ACTIVE_PLAN_ID = "active-plan-id"
  private const val KEY_ACTIVE_UNTIL = "active-until"
  private const val KEY_ACTIVE_SOURCE = "active-source"
  private const val KEY_RECENT_EVENTS = "recent-events-v1"
  private const val KEY_DEVICE_STORAGE_READY = "device-storage-ready-v1"
  private const val KEY_SCHEMA_VERSION = "schema-version"
  private const val KEY_GENERATION = "generation"
  private const val KEY_COMMITTED_AT = "committed-at"
  private const val KEY_PAYLOAD = "payload"
  private const val KEY_CHECKSUM = "checksum"
  private const val KEY_LAST_STORAGE_HEALTH = "last-storage-health"
  private const val KEY_ROLLBACK_FLOOR = "explicit-cancel-generation-floor"
  internal const val MAX_RECENT_EVENTS = 12

  private fun storageContext(context: Context): Context =
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
      context.applicationContext.createDeviceProtectedStorageContext()
    } else {
      context.applicationContext
    }

  /** 기존 v1 보조 상태도 잠금 해제 전 접근할 수 있도록 한 번만 옮겨요. */
  private fun legacyPreferences(context: Context): SharedPreferences {
    val appContext = context.applicationContext
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.N) {
      return appContext.getSharedPreferences(LEGACY_PREFERENCES_NAME, Context.MODE_PRIVATE)
    }
    val deviceContext = storageContext(appContext)
    var values = deviceContext.getSharedPreferences(LEGACY_PREFERENCES_NAME, Context.MODE_PRIVATE)
    if (values.getBoolean(KEY_DEVICE_STORAGE_READY, false)) return values
    val userManager = appContext.getSystemService(Context.USER_SERVICE) as UserManager
    if (!userManager.isUserUnlocked) return values
    synchronized(this) {
      values = deviceContext.getSharedPreferences(LEGACY_PREFERENCES_NAME, Context.MODE_PRIVATE)
      if (!values.getBoolean(KEY_DEVICE_STORAGE_READY, false)) {
        val credentialValues = appContext.getSharedPreferences(
          LEGACY_PREFERENCES_NAME,
          Context.MODE_PRIVATE
        )
        val hasLegacyValues = credentialValues.all.isNotEmpty()
        val moved = if (hasLegacyValues) {
          deviceContext.moveSharedPreferencesFrom(appContext, LEGACY_PREFERENCES_NAME)
        } else {
          false
        }
        check(isStorageMigrationReady(hasLegacyValues, moved)) {
          "기존 알람 데이터를 기기 보호 저장소로 옮기지 못했습니다."
        }
        values = deviceContext.getSharedPreferences(LEGACY_PREFERENCES_NAME, Context.MODE_PRIVATE)
        requireCommitted(
          values.edit().putBoolean(KEY_DEVICE_STORAGE_READY, true).commit(),
          "알람 저장소 준비 상태"
        )
      }
    }
    return values
  }

  private fun snapshotPreferences(context: Context, name: String): SharedPreferences =
    storageContext(context).getSharedPreferences(name, Context.MODE_PRIVATE)

  private fun metaPreferences(context: Context): SharedPreferences =
    snapshotPreferences(context, META_PREFERENCES_NAME)

  private fun snapshotEngine(context: Context): AlarmPyoAlarmStoreEngine =
    AlarmPyoAlarmStoreEngine(SharedPreferencesSnapshotPersistence(context))

  @Synchronized
  private fun readSnapshot(context: Context): AlarmPyoAlarmScheduleSnapshot? {
    val primaryValues = snapshotPreferences(context, PRIMARY_PREFERENCES_NAME)
    val previousValues = snapshotPreferences(context, PREVIOUS_PREFERENCES_NAME)
    val hasV2Values = primaryValues.all.isNotEmpty() || previousValues.all.isNotEmpty()

    if (!hasV2Values) return migrateLegacyOrInitialize(context)
    return snapshotEngine(context).read()
  }

  @Synchronized
  private fun writeSnapshot(
    context: Context,
    allowCorruptRecovery: Boolean = false,
    transform: (AlarmPyoAlarmScheduleSnapshot) -> AlarmPyoAlarmScheduleSnapshot
  ) {
    // Initialize or migrate only when there is genuinely no v2 snapshot yet. A corrupt pair is
    // never converted to an empty schedule by this ordinary mutation path.
    readSnapshot(context) ?: throw AlarmPyoAlarmStoreMutationException(
      AlarmPyoAlarmStoreFailureCode.CORRUPT_SNAPSHOT
    )
    snapshotEngine(context).write(allowCorruptRecovery, transform)
  }

  private fun migrateLegacyOrInitialize(context: Context): AlarmPyoAlarmScheduleSnapshot? {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
      val appContext = context.applicationContext
      val userManager = appContext.getSystemService(Context.USER_SERVICE) as UserManager
      val deviceLegacy = storageContext(appContext).getSharedPreferences(
        LEGACY_PREFERENCES_NAME,
        Context.MODE_PRIVATE
      )
      if (!userManager.isUserUnlocked && !deviceLegacy.getBoolean(KEY_DEVICE_STORAGE_READY, false)) {
        // 업데이트 직후 첫 잠금 부팅에서는 credential 저장소의 v1 값을 빈 계획으로
        // 덮지 않아요. 잠금 해제 뒤 BOOT_COMPLETED에서 정상 이관해요.
        markStorageHealth(context, AlarmPyoAlarmStorageHealth.CORRUPT)
        return null
      }
    }
    val legacy = legacyPreferences(context)
    val hasScheduleValues = legacy.contains(KEY_PLANS) ||
      legacy.contains(KEY_SCHEDULED_IDS) || legacy.contains(KEY_SINGLE_REPEATS)
    val migrated = if (hasScheduleValues) decodeLegacySnapshot(legacy) else {
      AlarmPyoAlarmScheduleSnapshot(
        plans = emptyList(),
        scheduledIds = emptySet(),
        singleRepeats = emptyList(),
        generation = 1L,
        committedAt = System.currentTimeMillis().coerceAtLeast(1L)
      )
    }
    if (migrated == null) {
      markStorageHealth(context, AlarmPyoAlarmStorageHealth.CORRUPT)
      return null
    }
    requireCommitted(
      writeEnvelope(
        snapshotPreferences(context, PRIMARY_PREFERENCES_NAME),
        AlarmPyoAlarmSnapshotCodec.create(migrated)
      ),
      "알람 저장소 v2 전환"
    )
    if (hasScheduleValues) {
      requireCommitted(
        legacy.edit()
          .remove(KEY_PLANS)
          .remove(KEY_SCHEDULED_IDS)
          .remove(KEY_SINGLE_REPEATS)
          .commit(),
        "기존 알람 예약 정보 정리"
      )
    }
    markStorageHealth(context, AlarmPyoAlarmStorageHealth.NORMAL)
    return migrated
  }

  private fun decodeLegacySnapshot(values: SharedPreferences): AlarmPyoAlarmScheduleSnapshot? =
    runCatching {
      val plans = decodeLegacyPlans(values.getString(KEY_PLANS, null), false) ?: return null
      val repeats = decodeLegacyPlans(values.getString(KEY_SINGLE_REPEATS, null), true)
        ?: return null
      val ids = decodeLegacyIds(values.getString(KEY_SCHEDULED_IDS, null)) ?: return null
      AlarmPyoAlarmScheduleSnapshot(
        plans = plans.distinctBy(AlarmPyoAlarmPlan::id).sortedBy(AlarmPyoAlarmPlan::alarmAt),
        scheduledIds = ids,
        singleRepeats = repeats.distinctBy(AlarmPyoAlarmPlan::rootPlanId)
          .sortedBy(AlarmPyoAlarmPlan::alarmAt),
        generation = 1L,
        committedAt = System.currentTimeMillis().coerceAtLeast(1L)
      )
    }.getOrNull()

  private fun decodeLegacyPlans(raw: String?, repeatsOnly: Boolean): List<AlarmPyoAlarmPlan>? {
    if (raw == null) return emptyList()
    return runCatching {
      val array = JSONArray(raw)
      buildList {
        for (index in 0 until array.length()) {
          val plan = AlarmPyoAlarmPlan.fromJson(array.getJSONObject(index)) ?: return null
          if (repeatsOnly && !plan.isSingleRepeat()) return null
          add(plan)
        }
      }
    }.getOrNull()
  }

  private fun decodeLegacyIds(raw: String?): Set<String>? {
    if (raw == null) return emptySet()
    return runCatching {
      val array = JSONArray(raw)
      buildSet {
        for (index in 0 until array.length()) {
          val id = array.getString(index).trim()
          if (id.isBlank()) return null
          add(id)
        }
      }
    }.getOrNull()
  }

  private fun readEnvelope(values: SharedPreferences): AlarmPyoAlarmSnapshotEnvelope? {
    if (!values.contains(KEY_SCHEMA_VERSION)) return null
    return AlarmPyoAlarmSnapshotEnvelope(
      schemaVersion = values.getInt(KEY_SCHEMA_VERSION, -1),
      generation = values.getLong(KEY_GENERATION, -1L),
      committedAt = values.getLong(KEY_COMMITTED_AT, 0L),
      payload = values.getString(KEY_PAYLOAD, null).orEmpty(),
      checksum = values.getString(KEY_CHECKSUM, null).orEmpty()
    )
  }

  private fun writeEnvelope(
    values: SharedPreferences,
    envelope: AlarmPyoAlarmSnapshotEnvelope
  ): Boolean = values.edit()
    .clear()
    .putInt(KEY_SCHEMA_VERSION, envelope.schemaVersion)
    .putLong(KEY_GENERATION, envelope.generation)
    .putLong(KEY_COMMITTED_AT, envelope.committedAt)
    .putString(KEY_PAYLOAD, envelope.payload)
    .putString(KEY_CHECKSUM, envelope.checksum)
    .commit()

  private class SharedPreferencesSnapshotPersistence(
    private val context: Context
  ) : AlarmPyoAlarmSnapshotPersistence {
    private val primary = snapshotPreferences(context, PRIMARY_PREFERENCES_NAME)
    private val previous = snapshotPreferences(context, PREVIOUS_PREFERENCES_NAME)

    override fun readPrimary(): AlarmPyoAlarmSnapshotEnvelope? = readEnvelope(primary)

    override fun readPrevious(): AlarmPyoAlarmSnapshotEnvelope? = readEnvelope(previous)

    override fun writePrimary(envelope: AlarmPyoAlarmSnapshotEnvelope) {
      requireCommitted(writeEnvelope(primary, envelope), "근무 알람 예약 정보")
    }

    override fun writePrevious(envelope: AlarmPyoAlarmSnapshotEnvelope) {
      requireCommitted(writeEnvelope(previous, envelope), "직전 근무 알람 예약 정보")
    }

    override fun readHealth(): AlarmPyoAlarmStorageHealth = rawStorageHealth(context)

    override fun writeHealth(health: AlarmPyoAlarmStorageHealth) {
      markStorageHealth(context, health)
    }

    override fun readRollbackFloor(): Long = metaPreferences(context)
      .getLong(KEY_ROLLBACK_FLOOR, 0L)
      .coerceAtLeast(0L)

    override fun writeRollbackFloor(generation: Long) {
      requireCommitted(
        metaPreferences(context).edit()
          .putLong(KEY_ROLLBACK_FLOOR, generation.coerceAtLeast(0L))
          .commit(),
        "명시적 알람 취소 표식"
      )
    }
  }

  private fun markStorageHealth(context: Context, health: AlarmPyoAlarmStorageHealth) {
    requireCommitted(
      metaPreferences(context).edit()
        .putString(KEY_LAST_STORAGE_HEALTH, health.wireValue)
        .commit(),
      "알람 저장소 상태"
    )
  }

  private fun rawStorageHealth(context: Context): AlarmPyoAlarmStorageHealth {
    val raw = metaPreferences(context).getString(KEY_LAST_STORAGE_HEALTH, null)
    return AlarmPyoAlarmStorageHealth.entries.firstOrNull { it.wireValue == raw }
      ?: AlarmPyoAlarmStorageHealth.NORMAL
  }

  fun markHealthy(context: Context) {
    readSnapshot(context) ?: throw AlarmPyoAlarmStoreMutationException(
      AlarmPyoAlarmStoreFailureCode.CORRUPT_SNAPSHOT
    )
    snapshotEngine(context).markHealthy()
  }

  fun storageHealth(context: Context): AlarmPyoAlarmStorageHealth {
    readSnapshot(context)
    return rawStorageHealth(context)
  }

  fun requireWritableSnapshot(context: Context): AlarmPyoAlarmScheduleSnapshot {
    readSnapshot(context) ?: throw AlarmPyoAlarmStoreMutationException(
      AlarmPyoAlarmStoreFailureCode.CORRUPT_SNAPSHOT
    )
    return snapshotEngine(context).requireWritableSnapshot()
  }

  /** Only a complete foreground JS plan or explicit full cancellation may call this path. */
  fun reseedAfterCorruption(
    context: Context,
    plans: List<AlarmPyoAlarmPlan>
  ): AlarmPyoAlarmScheduleSnapshot = snapshotEngine(context).reseedAfterCorruption(
    AlarmPyoAlarmScheduleSnapshot(
      plans = plans,
      scheduledIds = emptySet(),
      singleRepeats = emptyList(),
      generation = 0L,
      committedAt = 0L
    )
  )

  fun readPlans(context: Context): List<AlarmPyoAlarmPlan> =
    readSnapshot(context)?.plans.orEmpty()

  fun writePlans(context: Context, plans: List<AlarmPyoAlarmPlan>) {
    writeSnapshot(context) { it.copy(plans = plans) }
  }

  fun writeScheduleSnapshot(
    context: Context,
    plans: List<AlarmPyoAlarmPlan>,
    scheduledIds: Collection<String>
  ) {
    writeSnapshot(context) {
      it.copy(plans = plans, scheduledIds = scheduledIds.toSet())
    }
  }

  /** Scheduler-only continuation after [reseedAfterCorruption]. */
  fun writeScheduleSnapshotForCorruptionRecovery(
    context: Context,
    plans: List<AlarmPyoAlarmPlan>,
    scheduledIds: Collection<String>
  ) {
    writeSnapshot(context, allowCorruptRecovery = true) {
      it.copy(plans = plans, scheduledIds = scheduledIds.toSet())
    }
  }

  fun readSingleRepeats(context: Context): List<AlarmPyoAlarmPlan> =
    readSnapshot(context)?.singleRepeats.orEmpty()

  fun writeSingleRepeats(context: Context, plans: List<AlarmPyoAlarmPlan>) {
    val normalized = plans.filter(AlarmPyoAlarmPlan::isSingleRepeat)
      .distinctBy(AlarmPyoAlarmPlan::rootPlanId)
      .sortedBy(AlarmPyoAlarmPlan::alarmAt)
    writeSnapshot(context) { it.copy(singleRepeats = normalized) }
  }

  fun readScheduledIds(context: Context): Set<String> =
    readSnapshot(context)?.scheduledIds.orEmpty()

  fun writeScheduledIds(context: Context, ids: Collection<String>) {
    writeSnapshot(context) { it.copy(scheduledIds = ids.toSet()) }
  }

  fun readTestAlarmAt(context: Context): Long =
    legacyPreferences(context).getLong(KEY_TEST_ALARM_AT, 0L)

  fun writeTestAlarmAt(context: Context, alarmAt: Long) {
    requireCommitted(
      legacyPreferences(context).edit().putLong(KEY_TEST_ALARM_AT, alarmAt).commit(),
      "시험 알람"
    )
  }

  fun markActive(
    context: Context,
    planId: String,
    activeUntil: Long,
    source: AlarmPyoAlarmSource = AlarmPyoAlarmSource.WORK
  ) {
    legacyPreferences(context).edit()
      .putString(KEY_ACTIVE_PLAN_ID, planId)
      .putLong(KEY_ACTIVE_UNTIL, activeUntil)
      .putString(KEY_ACTIVE_SOURCE, source.wireValue)
      .apply()
  }

  fun isActive(context: Context, planId: String): Boolean {
    val values = legacyPreferences(context)
    val activePlanId = values.getString(KEY_ACTIVE_PLAN_ID, null)
    val activeUntil = values.getLong(KEY_ACTIVE_UNTIL, 0L)
    val now = System.currentTimeMillis()
    val active = activePlanId == planId && activeUntil > now
    if (!active && activeUntil <= now) clearActive(context)
    return active
  }

  fun activeSource(context: Context): AlarmPyoAlarmSource? {
    val values = legacyPreferences(context)
    val planId = values.getString(KEY_ACTIVE_PLAN_ID, null) ?: return null
    if (!isActive(context, planId)) return null
    val wireValue = values.getString(KEY_ACTIVE_SOURCE, null)
    return AlarmPyoAlarmSource.entries.firstOrNull { it.wireValue == wireValue }
      ?: AlarmPyoAlarmSource.WORK
  }

  fun isActiveSource(
    context: Context,
    planId: String,
    source: AlarmPyoAlarmSource
  ): Boolean = isActive(context, planId) && activeSource(context) == source

  fun clearActive(
    context: Context,
    expectedPlanId: String? = null,
    expectedSource: AlarmPyoAlarmSource? = null
  ) {
    val values = legacyPreferences(context)
    if (
      expectedPlanId != null &&
      values.getString(KEY_ACTIVE_PLAN_ID, null) != expectedPlanId
    ) return
    if (expectedSource != null && activeSource(context) != expectedSource) return
    legacyPreferences(context).edit()
      .remove(KEY_ACTIVE_PLAN_ID)
      .remove(KEY_ACTIVE_UNTIL)
      .remove(KEY_ACTIVE_SOURCE)
      .commit()
  }

  @Synchronized
  fun readRecentEvents(context: Context): List<AlarmPyoAlarmHistoryEvent> {
    val raw = legacyPreferences(context).getString(KEY_RECENT_EVENTS, null) ?: return emptyList()
    return decodeRecentEvents(raw)
  }

  @Synchronized
  fun appendRecentEvent(context: Context, event: AlarmPyoAlarmHistoryEvent) {
    val recent = buildList {
      add(event)
      addAll(readRecentEvents(context).filterNot { it.id == event.id })
    }.sortedByDescending { it.occurredAt }
      .take(MAX_RECENT_EVENTS)
    val array = JSONArray()
    recent.forEach { array.put(it.toJson()) }
    legacyPreferences(context).edit().putString(KEY_RECENT_EVENTS, array.toString()).apply()
  }

  fun clearRecentEvents(context: Context) {
    requireCommitted(
      legacyPreferences(context).edit().remove(KEY_RECENT_EVENTS).commit(),
      "알람 기록"
    )
  }

  internal fun decodeRecentEvents(raw: String): List<AlarmPyoAlarmHistoryEvent> = runCatching {
    val array = JSONArray(raw)
    buildList {
      for (index in 0 until array.length()) {
        AlarmPyoAlarmHistoryEvent.fromJson(array.optJSONObject(index) ?: continue)?.let(::add)
      }
    }.sortedByDescending { it.occurredAt }
      .distinctBy { it.id }
      .take(MAX_RECENT_EVENTS)
  }.getOrElse { emptyList() }

  fun clearForExplicitCancellation(context: Context, preserveActive: Boolean = false) {
    snapshotEngine(context).commitCancellationTombstone()
    val editor = legacyPreferences(context).edit().remove(KEY_TEST_ALARM_AT)
    if (!preserveActive) {
      editor
        .remove(KEY_ACTIVE_PLAN_ID)
        .remove(KEY_ACTIVE_UNTIL)
        .remove(KEY_ACTIVE_SOURCE)
    }
    requireCommitted(
      editor.commit(),
      "알람 데이터"
    )
  }

  internal fun requireCommitted(committed: Boolean, label: String) {
    check(committed) { "$label 저장에 실패했습니다." }
  }

  internal fun isStorageMigrationReady(
    hasLegacyValues: Boolean,
    moveSucceeded: Boolean
  ): Boolean = !hasLegacyValues || moveSucceeded
}
