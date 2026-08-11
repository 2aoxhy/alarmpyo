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
  const val SCHEMA_VERSION = 2

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
      checksum = checksum(payload)
    )
  }

  fun decode(envelope: AlarmPyoAlarmSnapshotEnvelope): AlarmPyoAlarmScheduleSnapshot? {
    if (
      envelope.schemaVersion != SCHEMA_VERSION ||
      envelope.generation < 0L ||
      envelope.committedAt <= 0L ||
      envelope.payload.isBlank() ||
      !checksum(envelope.payload).equals(envelope.checksum, ignoreCase = true)
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
    val selected = listOfNotNull(primarySnapshot, previousSnapshot)
      .maxWithOrNull(compareBy(AlarmPyoAlarmScheduleSnapshot::generation)
        .thenBy(AlarmPyoAlarmScheduleSnapshot::committedAt))
    val recovered = selected != null && (
      primarySnapshot == null ||
        selected.generation != primarySnapshot.generation ||
        selected.committedAt != primarySnapshot.committedAt
      )
    return selected to recovered
  }

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

  private fun checksum(value: String): String = MessageDigest.getInstance("SHA-256")
    .digest(value.toByteArray(Charsets.UTF_8))
    .joinToString("") { byte -> "%02x".format(byte.toInt() and 0xff) }
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
  private const val KEY_RECENT_EVENTS = "recent-events-v1"
  private const val KEY_DEVICE_STORAGE_READY = "device-storage-ready-v1"
  private const val KEY_SCHEMA_VERSION = "schema-version"
  private const val KEY_GENERATION = "generation"
  private const val KEY_COMMITTED_AT = "committed-at"
  private const val KEY_PAYLOAD = "payload"
  private const val KEY_CHECKSUM = "checksum"
  private const val KEY_LAST_STORAGE_HEALTH = "last-storage-health"
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
          "기존 알람 데이터를 기기 보호 저장소로 옮기지 못했어요."
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

  @Synchronized
  private fun readSnapshot(context: Context): AlarmPyoAlarmScheduleSnapshot? {
    val primaryValues = snapshotPreferences(context, PRIMARY_PREFERENCES_NAME)
    val previousValues = snapshotPreferences(context, PREVIOUS_PREFERENCES_NAME)
    val primaryEnvelope = readEnvelope(primaryValues)
    val previousEnvelope = readEnvelope(previousValues)
    val hasV2Values = primaryValues.all.isNotEmpty() || previousValues.all.isNotEmpty()

    if (!hasV2Values) return migrateLegacyOrInitialize(context)

    val (selected, recovered) = AlarmPyoAlarmSnapshotCodec.selectBest(
      primaryEnvelope,
      previousEnvelope
    )
    if (selected == null) {
      markStorageHealth(context, AlarmPyoAlarmStorageHealth.CORRUPT)
      return null
    }
    if (recovered) {
      val envelope = AlarmPyoAlarmSnapshotCodec.create(selected)
      requireCommitted(
        writeEnvelope(primaryValues, envelope),
        "복구한 알람 예약 정보"
      )
      markStorageHealth(context, AlarmPyoAlarmStorageHealth.RECOVERED)
    }
    return selected
  }

  @Synchronized
  private fun writeSnapshot(
    context: Context,
    transform: (AlarmPyoAlarmScheduleSnapshot) -> AlarmPyoAlarmScheduleSnapshot
  ) {
    val current = readSnapshot(context) ?: AlarmPyoAlarmScheduleSnapshot(
      plans = emptyList(),
      scheduledIds = emptySet(),
      singleRepeats = emptyList(),
      generation = 0L,
      committedAt = System.currentTimeMillis()
    )
    val healthBeforeWrite = rawStorageHealth(context)
    val now = System.currentTimeMillis().coerceAtLeast(current.committedAt + 1L)
    val desired = transform(current).copy(
      generation = current.generation + 1L,
      committedAt = now
    )
    val primaryValues = snapshotPreferences(context, PRIMARY_PREFERENCES_NAME)
    val previousValues = snapshotPreferences(context, PREVIOUS_PREFERENCES_NAME)
    readEnvelope(primaryValues)?.takeIf { AlarmPyoAlarmSnapshotCodec.decode(it) != null }?.let {
      requireCommitted(writeEnvelope(previousValues, it), "직전 알람 예약 정보")
    }
    requireCommitted(
      writeEnvelope(primaryValues, AlarmPyoAlarmSnapshotCodec.create(desired)),
      "알람 예약 정보"
    )
    markStorageHealth(
      context,
      if (healthBeforeWrite == AlarmPyoAlarmStorageHealth.RECOVERED) {
        AlarmPyoAlarmStorageHealth.RECOVERED
      } else {
        AlarmPyoAlarmStorageHealth.NORMAL
      }
    )
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
    markStorageHealth(context, AlarmPyoAlarmStorageHealth.NORMAL)
  }

  fun storageHealth(context: Context): AlarmPyoAlarmStorageHealth {
    readSnapshot(context)
    return rawStorageHealth(context)
  }

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

  fun markActive(context: Context, planId: String, activeUntil: Long) {
    legacyPreferences(context).edit()
      .putString(KEY_ACTIVE_PLAN_ID, planId)
      .putLong(KEY_ACTIVE_UNTIL, activeUntil)
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

  fun clearActive(context: Context) {
    legacyPreferences(context).edit()
      .remove(KEY_ACTIVE_PLAN_ID)
      .remove(KEY_ACTIVE_UNTIL)
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

  fun clear(context: Context) {
    writeSnapshot(context) {
      it.copy(plans = emptyList(), scheduledIds = emptySet(), singleRepeats = emptyList())
    }
    requireCommitted(
      legacyPreferences(context).edit()
        .remove(KEY_TEST_ALARM_AT)
        .remove(KEY_ACTIVE_PLAN_ID)
        .remove(KEY_ACTIVE_UNTIL)
        .commit(),
      "알람 데이터"
    )
    markHealthy(context)
  }

  internal fun requireCommitted(committed: Boolean, label: String) {
    check(committed) { "$label 저장에 실패했어요." }
  }

  internal fun isStorageMigrationReady(
    hasLegacyValues: Boolean,
    moveSucceeded: Boolean
  ): Boolean = !hasLegacyValues || moveSucceeded
}
