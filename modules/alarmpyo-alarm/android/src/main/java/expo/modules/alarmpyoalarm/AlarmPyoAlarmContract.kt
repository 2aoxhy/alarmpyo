package expo.modules.alarmpyoalarm

import android.content.Intent
import expo.modules.kotlin.records.Field
import expo.modules.kotlin.records.Record
import expo.modules.kotlin.types.OptimizedRecord
import org.json.JSONObject

internal const val ACTION_FIRE_ALARM = "expo.modules.alarmpyoalarm.action.FIRE_ALARM"
internal const val ACTION_START_RINGING = "expo.modules.alarmpyoalarm.action.START_RINGING"
internal const val ACTION_DISMISS_ALARM = "expo.modules.alarmpyoalarm.action.DISMISS_ALARM"
internal const val ACTION_SNOOZE_ALARM = "expo.modules.alarmpyoalarm.action.SNOOZE_ALARM"

internal const val EXTRA_PLAN_ID = "alarmpyo_plan_id"
internal const val EXTRA_DATE_KEY = "alarmpyo_date_key"
internal const val EXTRA_SHIFT_TYPE_ID = "alarmpyo_shift_type_id"
internal const val EXTRA_SHIFT_NAME = "alarmpyo_shift_name"
internal const val EXTRA_ALARM_AT = "alarmpyo_alarm_at"
internal const val EXTRA_ORIGINAL_ALARM_AT = "alarmpyo_original_alarm_at"
internal const val EXTRA_START_MINUTES = "alarmpyo_start_minutes"
internal const val EXTRA_ALARM_MINUTES_BEFORE = "alarmpyo_alarm_minutes_before"
internal const val EXTRA_DELIVERY_ATTEMPT = "alarmpyo_delivery_attempt"
internal const val EXTRA_ROOT_PLAN_ID = "alarmpyo_root_plan_id"
internal const val EXTRA_REPEAT_STAGE = "alarmpyo_repeat_stage"
internal const val EXTRA_IS_TEST = "alarmpyo_is_test"
internal const val EXTRA_RETRY_ARMED = "alarmpyo_retry_armed"
internal const val EXTRA_AUTOMATIC_REPEAT_ELIGIBLE = "alarmpyo_automatic_repeat_eligible"
internal const val EXTRA_ALARM_SOURCE = "alarmpyo_alarm_source"
internal const val EXTRA_COUNTDOWN_STARTED_AT_ELAPSED =
  "alarmpyo_countdown_started_at_elapsed"
internal const val EXTRA_FIRE_AT_ELAPSED = "alarmpyo_fire_at_elapsed"
internal const val EXTRA_BOOT_COUNT = "alarmpyo_boot_count"

internal const val ALARM_CHANNEL_ID = "alarmpyo-alarm-runtime-v1"
internal const val LEGACY_ALARM_CHANNEL_ID = "shift-alarms-v2"
internal const val ALARM_NOTIFICATION_ID = 0x485453
internal const val MAX_SCHEDULED_ALARMS = 3
internal const val MAX_ALARM_MINUTES_BEFORE = 24 * 60 - 1

internal enum class AlarmPyoAlarmSource(
  val wireValue: String,
  val priority: Int
) {
  TEST("test", 1),
  TIMER("timer", 2),
  WORK("work", 3);

  companion object {
    fun fromIntent(intent: Intent, plan: AlarmPyoAlarmPlan? = null): AlarmPyoAlarmSource {
      return entries.firstOrNull {
        it.wireValue == intent.getStringExtra(EXTRA_ALARM_SOURCE)
      } ?: if (
        intent.getBooleanExtra(EXTRA_IS_TEST, false) || plan?.shiftTypeId == "test"
      ) {
        TEST
      } else {
        WORK
      }
    }
  }
}

internal fun Intent.putAlarmPyoSource(source: AlarmPyoAlarmSource): Intent =
  putExtra(EXTRA_ALARM_SOURCE, source.wireValue)

@OptimizedRecord
data class AlarmPyoAlarmPlanRecord(
  @Field val id: String = "",
  @Field val dateKey: String = "",
  @Field val shiftTypeId: String = "",
  @Field val shiftName: String = "",
  @Field val alarmAt: Double = 0.0,
  @Field val startMinutes: Int = -1,
  @Field val alarmMinutesBefore: Int = -1
) : Record {
  internal fun toPlan(): AlarmPyoAlarmPlan = AlarmPyoAlarmPlan(
    id = id.trim(),
    dateKey = dateKey.trim(),
    shiftTypeId = shiftTypeId.trim(),
    shiftName = shiftName.trim(),
    alarmAt = alarmAt.toLong(),
    startMinutes = startMinutes,
    alarmMinutesBefore = alarmMinutesBefore
  )
}

@OptimizedRecord
data class AlarmPyoAlarmSyncMetadataRecord(
  @Field val generatedAt: Double = 0.0,
  @Field val refreshRecommendedAt: Double = 0.0,
  @Field val safetyThroughAt: Double = 0.0
) : Record {
  internal fun toValidatedMetadata(): AlarmPyoAlarmSyncMetadata? {
    if (
      !generatedAt.isFinite() || generatedAt <= 0.0 || generatedAt % 1.0 != 0.0 ||
      !refreshRecommendedAt.isFinite() || refreshRecommendedAt % 1.0 != 0.0 ||
      !safetyThroughAt.isFinite() || safetyThroughAt % 1.0 != 0.0
    ) return null
    val generated = generatedAt.toLong()
    val refresh = refreshRecommendedAt.toLong()
    val safety = safetyThroughAt.toLong()
    if (refresh <= generated || safety <= refresh) return null
    return AlarmPyoAlarmSyncMetadata(generated, refresh, safety)
  }
}

internal data class AlarmPyoAlarmSyncMetadata(
  val generatedAt: Long,
  val refreshRecommendedAt: Long,
  val safetyThroughAt: Long
)

internal data class AlarmPyoAlarmPlan(
  val id: String,
  val dateKey: String,
  val shiftTypeId: String,
  val shiftName: String,
  val alarmAt: Long,
  val startMinutes: Int = -1,
  val alarmMinutesBefore: Int = -1,
  val originalAlarmAt: Long = alarmAt,
  val deliveryAttempt: Int = 0,
  val rootPlanId: String = id,
  val repeatStage: Int = 0,
  val countdownStartedAtElapsed: Long = -1L,
  val fireAtElapsed: Long = -1L,
  val bootCount: Int = -1
) {
  fun hasSameDeliveryGeneration(other: AlarmPyoAlarmPlan): Boolean =
    id == other.id &&
      alarmAt == other.alarmAt &&
      originalAlarmAt == other.originalAlarmAt &&
      deliveryAttempt == other.deliveryAttempt &&
      rootPlanId == other.rootPlanId &&
      repeatStage == other.repeatStage &&
      countdownStartedAtElapsed == other.countdownStartedAtElapsed &&
      fireAtElapsed == other.fireAtElapsed &&
      bootCount == other.bootCount

  fun isSingleRepeat(): Boolean = repeatStage == SINGLE_REPEAT_STAGE

  fun toJson(): JSONObject = JSONObject()
    .put("id", id)
    .put("dateKey", dateKey)
    .put("shiftTypeId", shiftTypeId)
    .put("shiftName", shiftName)
    .put("alarmAt", alarmAt)
    .put("startMinutes", startMinutes)
    .put("alarmMinutesBefore", alarmMinutesBefore)
    .put("originalAlarmAt", originalAlarmAt)
    .put("deliveryAttempt", deliveryAttempt)
    .put("rootPlanId", rootPlanId)
    .put("repeatStage", repeatStage)
    .put("countdownStartedAtElapsed", countdownStartedAtElapsed)
    .put("fireAtElapsed", fireAtElapsed)
    .put("bootCount", bootCount)

  fun toMap(): Map<String, Any> = mapOf(
    "id" to id,
    "dateKey" to dateKey,
    "shiftTypeId" to shiftTypeId,
    "shiftName" to shiftName,
    "alarmAt" to alarmAt.toDouble(),
    "startMinutes" to startMinutes,
    "alarmMinutesBefore" to alarmMinutesBefore
  )

  fun addToIntent(intent: Intent): Intent = intent
    .putExtra(EXTRA_PLAN_ID, id)
    .putExtra(EXTRA_DATE_KEY, dateKey)
    .putExtra(EXTRA_SHIFT_TYPE_ID, shiftTypeId)
    .putExtra(EXTRA_SHIFT_NAME, shiftName)
    .putExtra(EXTRA_ALARM_AT, alarmAt)
    .putExtra(EXTRA_ORIGINAL_ALARM_AT, originalAlarmAt)
    .putExtra(EXTRA_START_MINUTES, startMinutes)
    .putExtra(EXTRA_ALARM_MINUTES_BEFORE, alarmMinutesBefore)
    .putExtra(EXTRA_DELIVERY_ATTEMPT, deliveryAttempt)
    .putExtra(EXTRA_ROOT_PLAN_ID, rootPlanId)
    .putExtra(EXTRA_REPEAT_STAGE, repeatStage)
    .putExtra(EXTRA_COUNTDOWN_STARTED_AT_ELAPSED, countdownStartedAtElapsed)
    .putExtra(EXTRA_FIRE_AT_ELAPSED, fireAtElapsed)
    .putExtra(EXTRA_BOOT_COUNT, bootCount)

  companion object {
    fun fromJson(json: JSONObject): AlarmPyoAlarmPlan? = runCatching {
      val id = json.getString("id")
      val repeatStage = json.optInt("repeatStage", inferLegacyRepeatStage(id))
        .coerceIn(0, SINGLE_REPEAT_STAGE)
      AlarmPyoAlarmPlan(
        id = id,
        dateKey = json.optString("dateKey"),
        shiftTypeId = json.optString("shiftTypeId"),
        shiftName = json.optString("shiftName"),
        alarmAt = json.getLong("alarmAt"),
        startMinutes = json.optInt("startMinutes", -1),
        alarmMinutesBefore = json.optInt("alarmMinutesBefore", -1),
        originalAlarmAt = json.optLong("originalAlarmAt", json.getLong("alarmAt")),
        deliveryAttempt = json.optInt("deliveryAttempt", 0).coerceAtLeast(0),
        rootPlanId = json.optString("rootPlanId")
          .trim()
          .ifBlank { inferRootPlanId(id) },
        repeatStage = repeatStage,
        countdownStartedAtElapsed = json.optLong("countdownStartedAtElapsed", -1L),
        fireAtElapsed = json.optLong("fireAtElapsed", -1L),
        bootCount = json.optInt("bootCount", -1)
      )
    }.getOrNull()

    fun fromIntent(intent: Intent): AlarmPyoAlarmPlan? {
      val id = intent.getStringExtra(EXTRA_PLAN_ID)?.takeIf { it.isNotBlank() } ?: return null
      val repeatStage = intent.getIntExtra(
        EXTRA_REPEAT_STAGE,
        inferLegacyRepeatStage(id)
      ).coerceIn(0, SINGLE_REPEAT_STAGE)
      return AlarmPyoAlarmPlan(
        id = id,
        dateKey = intent.getStringExtra(EXTRA_DATE_KEY).orEmpty(),
        shiftTypeId = intent.getStringExtra(EXTRA_SHIFT_TYPE_ID).orEmpty(),
        shiftName = intent.getStringExtra(EXTRA_SHIFT_NAME).orEmpty(),
        alarmAt = intent.getLongExtra(EXTRA_ALARM_AT, 0L),
        startMinutes = intent.getIntExtra(EXTRA_START_MINUTES, -1),
        alarmMinutesBefore = intent.getIntExtra(EXTRA_ALARM_MINUTES_BEFORE, -1),
        originalAlarmAt = intent.getLongExtra(
          EXTRA_ORIGINAL_ALARM_AT,
          intent.getLongExtra(EXTRA_ALARM_AT, 0L)
        ),
        deliveryAttempt = intent.getIntExtra(EXTRA_DELIVERY_ATTEMPT, 0).coerceAtLeast(0),
        rootPlanId = intent.getStringExtra(EXTRA_ROOT_PLAN_ID)
          ?.trim()
          ?.takeIf { it.isNotBlank() }
          ?: inferRootPlanId(id),
        repeatStage = repeatStage,
        countdownStartedAtElapsed = intent.getLongExtra(
          EXTRA_COUNTDOWN_STARTED_AT_ELAPSED,
          -1L
        ),
        fireAtElapsed = intent.getLongExtra(EXTRA_FIRE_AT_ELAPSED, -1L),
        bootCount = intent.getIntExtra(EXTRA_BOOT_COUNT, -1)
      )
    }

    private fun inferLegacyRepeatStage(id: String): Int =
      if (id.contains(":snooze") || id.contains(SINGLE_REPEAT_ID_SUFFIX)) {
        SINGLE_REPEAT_STAGE
      } else {
        0
      }

    private fun inferRootPlanId(id: String): String = id
      .substringBefore(SINGLE_REPEAT_ID_SUFFIX)
      .substringBefore(":snooze")
  }
}

internal const val SINGLE_REPEAT_STAGE = 1
internal const val SINGLE_REPEAT_ID_SUFFIX = ":repeat-once"
