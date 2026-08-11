package expo.modules.alarmpyoalarm

import android.content.Intent
import expo.modules.kotlin.records.Field
import expo.modules.kotlin.records.Record
import expo.modules.kotlin.types.OptimizedRecord
import java.util.TimeZone
import org.json.JSONObject

internal const val ACTION_FIRE_SLEEP_REMINDER =
  "expo.modules.alarmpyoalarm.action.FIRE_SLEEP_REMINDER"
internal const val EXTRA_SLEEP_REMINDER_ID = "alarmpyo_sleep_reminder_id"
internal const val EXTRA_SLEEP_REMINDER_AT = "alarmpyo_sleep_reminder_at"
internal const val SLEEP_REMINDER_CHANNEL_ID = "alarmpyo-sleep-reminder-v1"
internal const val SLEEP_REMINDER_PLAN_HORIZON_DAYS = 14
internal const val MAX_STORED_SLEEP_REMINDERS = 64
internal const val MAX_SCHEDULED_SLEEP_REMINDERS = 3

@OptimizedRecord
data class AlarmPyoSleepReminderPlanRecord(
  @Field val id: String = "",
  @Field val reminderAt: Double = 0.0,
  @Field val shiftDate: String = "",
  @Field val shiftName: String = "",
  @Field val title: String = "",
  @Field val body: String = ""
) : Record {
  internal fun toPlan(timeZone: TimeZone = TimeZone.getDefault()): AlarmPyoSleepReminderPlan {
    val localTime = AlarmPyoSleepReminderPolicy.captureLocalTime(reminderAt.toLong(), timeZone)
    return AlarmPyoSleepReminderPlan(
      id = id.trim(),
      reminderAt = reminderAt.toLong(),
      shiftDate = shiftDate.trim(),
      shiftName = shiftName.trim(),
      title = title.trim(),
      body = body.trim(),
      localDateKey = localTime.dateKey,
      localMinutes = localTime.minutes
    )
  }
}

internal data class AlarmPyoSleepReminderPlan(
  val id: String,
  val reminderAt: Long,
  val shiftDate: String,
  val shiftName: String,
  val title: String,
  val body: String,
  val localDateKey: String,
  val localMinutes: Int
) {
  fun toJson(): JSONObject = JSONObject()
    .put("id", id)
    .put("reminderAt", reminderAt)
    .put("shiftDate", shiftDate)
    .put("shiftName", shiftName)
    .put("title", title)
    .put("body", body)
    .put("localDateKey", localDateKey)
    .put("localMinutes", localMinutes)

  fun addToIntent(intent: Intent): Intent = intent
    .putExtra(EXTRA_SLEEP_REMINDER_ID, id)
    .putExtra(EXTRA_SLEEP_REMINDER_AT, reminderAt)

  companion object {
    private val DATE_PATTERN = Regex("^\\d{4}-\\d{2}-\\d{2}$")

    fun fromJson(json: JSONObject): AlarmPyoSleepReminderPlan? = runCatching {
      AlarmPyoSleepReminderPlan(
        id = json.getString("id").trim(),
        reminderAt = json.getLong("reminderAt"),
        shiftDate = json.getString("shiftDate").trim(),
        shiftName = json.getString("shiftName").trim(),
        title = json.getString("title").trim(),
        body = json.getString("body").trim(),
        localDateKey = json.getString("localDateKey").trim(),
        localMinutes = json.getInt("localMinutes")
      ).takeIf(::isValid)
    }.getOrNull()

    fun isValid(plan: AlarmPyoSleepReminderPlan): Boolean =
      plan.id.isNotBlank() && plan.id.length <= 180 &&
        plan.reminderAt > 0L &&
        DATE_PATTERN.matches(plan.shiftDate) &&
        plan.shiftName.isNotBlank() && plan.shiftName.length <= 40 &&
        plan.title.isNotBlank() && plan.title.length <= 100 &&
        plan.body.isNotBlank() && plan.body.length <= 240 &&
        DATE_PATTERN.matches(plan.localDateKey) &&
        plan.localMinutes in 0..1439
  }
}

internal data class AlarmPyoSleepReminderStatus(
  val enabled: Boolean,
  val notificationsAllowed: Boolean,
  val scheduledCount: Int
) {
  fun toMap(): Map<String, Any> = mapOf(
    "supported" to true,
    "enabled" to enabled,
    "notificationsAllowed" to notificationsAllowed,
    "scheduledCount" to scheduledCount
  )
}
