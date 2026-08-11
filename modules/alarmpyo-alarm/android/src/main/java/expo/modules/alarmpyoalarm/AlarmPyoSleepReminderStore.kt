package expo.modules.alarmpyoalarm

import android.content.Context
import android.os.Build
import org.json.JSONArray
import org.json.JSONObject

internal data class AlarmPyoSleepReminderSnapshot(
  val plans: List<AlarmPyoSleepReminderPlan>,
  val scheduledIds: Set<String>
)

internal object AlarmPyoSleepReminderSnapshotCodec {
  private const val SCHEMA_VERSION = 1

  fun encode(snapshot: AlarmPyoSleepReminderSnapshot): String = JSONObject()
    .put("schemaVersion", SCHEMA_VERSION)
    .put("plans", JSONArray().apply {
      AlarmPyoSleepReminderPolicy.normalize(snapshot.plans).forEach { put(it.toJson()) }
    })
    .put("scheduledIds", JSONArray().apply {
      snapshot.scheduledIds.sorted().forEach { put(it) }
    })
    .toString()

  fun decode(raw: String): AlarmPyoSleepReminderSnapshot? = runCatching {
    val json = JSONObject(raw)
    if (json.getInt("schemaVersion") != SCHEMA_VERSION) return null
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
    AlarmPyoSleepReminderSnapshot(normalized, scheduledIds)
  }.getOrNull()
}

internal object AlarmPyoSleepReminderStore {
  private const val PREFERENCES_NAME = "alarmpyo-sleep-reminders-v1"
  private const val KEY_SNAPSHOT = "snapshot"

  @Synchronized
  fun read(context: Context): AlarmPyoSleepReminderSnapshot {
    val raw = preferences(context).getString(KEY_SNAPSHOT, null)
      ?: return AlarmPyoSleepReminderSnapshot(emptyList(), emptySet())
    return AlarmPyoSleepReminderSnapshotCodec.decode(raw)
      ?: AlarmPyoSleepReminderSnapshot(emptyList(), emptySet())
  }

  @Synchronized
  fun write(context: Context, snapshot: AlarmPyoSleepReminderSnapshot) {
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
    val encoded = AlarmPyoSleepReminderSnapshotCodec.encode(
      AlarmPyoSleepReminderSnapshot(normalized, scheduledIds)
    )
    check(preferences(context).edit().putString(KEY_SNAPSHOT, encoded).commit()) {
      "수면 시작 알림 계획을 저장하지 못했어요."
    }
  }

  fun clear(context: Context) {
    write(context, AlarmPyoSleepReminderSnapshot(emptyList(), emptySet()))
  }

  private fun preferences(context: Context) = storageContext(context)
    .getSharedPreferences(PREFERENCES_NAME, Context.MODE_PRIVATE)

  private fun storageContext(context: Context): Context {
    val applicationContext = context.applicationContext
    return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
      applicationContext.createDeviceProtectedStorageContext()
    } else {
      applicationContext
    }
  }
}
