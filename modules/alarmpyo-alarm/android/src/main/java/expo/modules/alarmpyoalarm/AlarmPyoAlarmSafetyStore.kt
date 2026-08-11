package expo.modules.alarmpyoalarm

import android.content.Context
import android.os.Build

internal data class AlarmPyoAlarmSafetyState(
  val nextCheckAt: Long = 0L,
  val lastCheckedAt: Long = 0L,
  val issueCodes: List<String> = emptyList(),
  val lastNotifiedAt: Long = 0L,
  val armedPlanKey: String? = null,
  val lastCheckedPlanKey: String? = null,
  val lastNotifiedKey: String? = null
) {
  fun toStatusMap(): Map<String, Any> = mapOf(
    "nextCheckAt" to nextCheckAt.toDouble(),
    "lastCheckedAt" to lastCheckedAt.toDouble(),
    "issueCodes" to issueCodes,
    "lastNotifiedAt" to lastNotifiedAt.toDouble()
  )
}

internal object AlarmPyoAlarmSafetyStore {
  private const val PREFERENCES_NAME = "alarmpyo-alarm-safety-v1"
  private const val KEY_INITIALIZED = "initialized"
  private const val KEY_NEXT_CHECK_AT = "next-check-at"
  private const val KEY_LAST_CHECKED_AT = "last-checked-at"
  private const val KEY_ISSUE_CODES = "issue-codes"
  private const val KEY_LAST_NOTIFIED_AT = "last-notified-at"
  private const val KEY_ARMED_PLAN_KEY = "armed-plan-key"
  private const val KEY_LAST_CHECKED_PLAN_KEY = "last-checked-plan-key"
  private const val KEY_LAST_NOTIFIED_KEY = "last-notified-key"
  private const val ISSUE_SEPARATOR = "\u001f"

  fun read(context: Context): AlarmPyoAlarmSafetyState? {
    val preferences = preferences(context)
    if (!preferences.getBoolean(KEY_INITIALIZED, false)) return null
    return AlarmPyoAlarmSafetyState(
      nextCheckAt = preferences.getLong(KEY_NEXT_CHECK_AT, 0L).coerceAtLeast(0L),
      lastCheckedAt = preferences.getLong(KEY_LAST_CHECKED_AT, 0L).coerceAtLeast(0L),
      issueCodes = preferences.getString(KEY_ISSUE_CODES, null)
        ?.split(ISSUE_SEPARATOR)
        ?.filter(String::isNotBlank)
        ?.distinct()
        ?.sorted()
        .orEmpty(),
      lastNotifiedAt = preferences.getLong(KEY_LAST_NOTIFIED_AT, 0L).coerceAtLeast(0L),
      armedPlanKey = preferences.getString(KEY_ARMED_PLAN_KEY, null),
      lastCheckedPlanKey = preferences.getString(KEY_LAST_CHECKED_PLAN_KEY, null),
      lastNotifiedKey = preferences.getString(KEY_LAST_NOTIFIED_KEY, null)
    )
  }

  fun write(context: Context, state: AlarmPyoAlarmSafetyState) {
    check(
      preferences(context).edit()
        .putBoolean(KEY_INITIALIZED, true)
        .putLong(KEY_NEXT_CHECK_AT, state.nextCheckAt.coerceAtLeast(0L))
        .putLong(KEY_LAST_CHECKED_AT, state.lastCheckedAt.coerceAtLeast(0L))
        .putString(KEY_ISSUE_CODES, state.issueCodes.distinct().sorted().joinToString(ISSUE_SEPARATOR))
        .putLong(KEY_LAST_NOTIFIED_AT, state.lastNotifiedAt.coerceAtLeast(0L))
        .putString(KEY_ARMED_PLAN_KEY, state.armedPlanKey)
        .putString(KEY_LAST_CHECKED_PLAN_KEY, state.lastCheckedPlanKey)
        .putString(KEY_LAST_NOTIFIED_KEY, state.lastNotifiedKey)
        .commit()
    ) { "알람 안전 점검 상태를 저장하지 못했어요." }
  }

  private fun preferences(context: Context) =
    (if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
      context.createDeviceProtectedStorageContext()
    } else {
      context
    }).getSharedPreferences(PREFERENCES_NAME, Context.MODE_PRIVATE)
}
