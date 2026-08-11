package expo.modules.alarmpyoalarm

import org.json.JSONObject

internal object AlarmPyoAlarmEventType {
  const val PLAYBACK_CONFIRMED = "playback_confirmed"
  const val DISMISSED = "dismissed"
  const val SNOOZED = "snoozed"
  const val AUTO_REPEAT_SCHEDULED = "auto_repeat_scheduled"
  const val AUTO_REPEAT_STARTED = "auto_repeat_started"
  const val PLAYBACK_FAILED = "playback_failed"
  const val RETRY_STARTED = "retry_started"
  const val RETRY_SCHEDULED = "retry_scheduled"
  const val RETRY_EXHAUSTED = "retry_exhausted"

  val all = setOf(
    PLAYBACK_CONFIRMED,
    DISMISSED,
    SNOOZED,
    AUTO_REPEAT_SCHEDULED,
    AUTO_REPEAT_STARTED,
    PLAYBACK_FAILED,
    RETRY_STARTED,
    RETRY_SCHEDULED,
    RETRY_EXHAUSTED
  )
}

internal data class AlarmPyoAlarmHistoryEvent(
  val id: String,
  val type: String,
  val occurredAt: Long,
  val planId: String,
  val shiftName: String,
  val alarmAt: Long,
  val isTest: Boolean,
  val deliveryAttempt: Int,
  val nextAlarmAt: Long = 0L
) {
  fun toJson(): JSONObject = JSONObject()
    .put("id", id)
    .put("type", type)
    .put("occurredAt", occurredAt)
    .put("planId", planId)
    .put("shiftName", shiftName)
    .put("alarmAt", alarmAt)
    .put("isTest", isTest)
    .put("deliveryAttempt", deliveryAttempt)
    .put("nextAlarmAt", nextAlarmAt)

  fun toMap(): Map<String, Any> = mapOf(
    "id" to id,
    "type" to type,
    "occurredAt" to occurredAt.toDouble(),
    "planId" to planId,
    "shiftName" to shiftName,
    "alarmAt" to alarmAt.toDouble(),
    "isTest" to isTest,
    "deliveryAttempt" to deliveryAttempt,
    "nextAlarmAt" to nextAlarmAt.toDouble()
  )

  companion object {
    fun create(
      type: String,
      plan: AlarmPyoAlarmPlan,
      isTest: Boolean,
      nextAlarmAt: Long = 0L,
      occurredAt: Long = System.currentTimeMillis()
    ): AlarmPyoAlarmHistoryEvent {
      require(type in AlarmPyoAlarmEventType.all)
      val id = "$occurredAt:$type:${plan.id.hashCode()}:${plan.deliveryAttempt}"
      return AlarmPyoAlarmHistoryEvent(
        id = id,
        type = type,
        occurredAt = occurredAt,
        planId = plan.id,
        shiftName = plan.shiftName.ifBlank { if (isTest) "시험 알람" else "근무 알람" },
        alarmAt = plan.originalAlarmAt.takeIf { it > 0L } ?: plan.alarmAt,
        isTest = isTest,
        deliveryAttempt = plan.deliveryAttempt.coerceAtLeast(0),
        nextAlarmAt = nextAlarmAt.coerceAtLeast(0L)
      )
    }

    fun fromJson(json: JSONObject): AlarmPyoAlarmHistoryEvent? = runCatching {
      val type = json.getString("type")
      if (type !in AlarmPyoAlarmEventType.all) return null
      val occurredAt = json.getLong("occurredAt")
      if (occurredAt <= 0L) return null
      AlarmPyoAlarmHistoryEvent(
        id = json.optString("id").ifBlank {
          "$occurredAt:$type:${json.optString("planId").hashCode()}:${json.optInt("deliveryAttempt", 0)}"
        },
        type = type,
        occurredAt = occurredAt,
        planId = json.optString("planId"),
        shiftName = json.optString("shiftName"),
        alarmAt = json.optLong("alarmAt", 0L).coerceAtLeast(0L),
        isTest = json.optBoolean("isTest", false),
        deliveryAttempt = json.optInt("deliveryAttempt", 0).coerceAtLeast(0),
        nextAlarmAt = json.optLong("nextAlarmAt", 0L).coerceAtLeast(0L)
      )
    }.getOrNull()
  }
}
