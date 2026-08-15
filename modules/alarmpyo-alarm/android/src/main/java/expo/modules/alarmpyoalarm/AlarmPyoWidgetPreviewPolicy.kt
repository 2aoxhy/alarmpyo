package expo.modules.alarmpyoalarm

import android.content.Context
import java.security.MessageDigest

internal enum class AlarmPyoWidgetPreviewDecision {
  UNSUPPORTED,
  NO_DATA,
  UNCHANGED,
  DEFERRED,
  UPDATE
}

internal enum class AlarmPyoWidgetPreviewUpdateResult {
  UNSUPPORTED,
  NO_DATA,
  UNCHANGED,
  DEFERRED,
  UPDATED,
  RATE_LIMITED,
  FAILED
}

/**
 * Android 15 limits generated widget previews to roughly two calls per hour.
 * Keep the policy pure so clock rollback, duplicate payloads and the cooldown
 * can be verified without an Android host.
 */
internal object AlarmPyoWidgetPreviewPolicy {
  const val MIN_SUPPORTED_API = 35
  const val RETRY_COOLDOWN_MILLIS = 30L * 60L * 1_000L
  private const val RENDER_SCHEMA_VERSION = 1

  fun decide(
    sdkInt: Int,
    hasSnapshot: Boolean,
    signature: String?,
    storedSignature: String?,
    lastAttemptAt: Long,
    nowMillis: Long
  ): AlarmPyoWidgetPreviewDecision {
    if (sdkInt < MIN_SUPPORTED_API) return AlarmPyoWidgetPreviewDecision.UNSUPPORTED
    if (!hasSnapshot || signature.isNullOrBlank()) return AlarmPyoWidgetPreviewDecision.NO_DATA
    if (signature == storedSignature) return AlarmPyoWidgetPreviewDecision.UNCHANGED
    val withinCooldown =
      lastAttemptAt > 0L && nowMillis >= lastAttemptAt &&
        nowMillis - lastAttemptAt < RETRY_COOLDOWN_MILLIS
    return if (withinCooldown) {
      AlarmPyoWidgetPreviewDecision.DEFERRED
    } else {
      AlarmPyoWidgetPreviewDecision.UPDATE
    }
  }

  fun signature(state: AlarmPyoWidgetViewState, fontScale: Float): String {
    val fontBucket = when {
      fontScale >= 1.8f -> "very-large"
      fontScale >= 1.3f -> "large"
      else -> "regular"
    }
    // Exclude the accessibility-only remaining-time sentence: it changes each
    // minute and would waste the platform's preview update budget even though
    // the picker pixels are unchanged.
    val payload = listOf(
      RENDER_SCHEMA_VERSION,
      fontBucket,
      state.dateText,
      state.titleText,
      state.scheduleText,
      state.bottomLabel,
      state.bottomText,
      state.secondaryLabel.orEmpty(),
      state.secondaryText.orEmpty(),
      state.visual.name
    ).joinToString("\u001f")
    return MessageDigest.getInstance("SHA-256")
      .digest(payload.toByteArray(Charsets.UTF_8))
      .joinToString("") { byte -> "%02x".format(byte.toInt() and 0xff) }
  }
}

internal object AlarmPyoWidgetPreviewStateStore {
  private const val PREFERENCES_NAME = "alarmpyo-widget-preview-v1"
  private const val KEY_SIGNATURE = "signature"
  private const val KEY_LAST_ATTEMPT_AT = "last-attempt-at"

  private fun preferences(context: Context) =
    context.getSharedPreferences(PREFERENCES_NAME, Context.MODE_PRIVATE)

  fun signature(context: Context): String? =
    preferences(context).getString(KEY_SIGNATURE, null)

  fun lastAttemptAt(context: Context): Long =
    preferences(context).getLong(KEY_LAST_ATTEMPT_AT, 0L)

  fun recordAttempt(context: Context, attemptedAt: Long) {
    preferences(context).edit()
      .putLong(KEY_LAST_ATTEMPT_AT, attemptedAt)
      .apply()
  }

  fun recordSuccess(context: Context, signature: String, attemptedAt: Long) {
    preferences(context).edit()
      .putString(KEY_SIGNATURE, signature)
      .putLong(KEY_LAST_ATTEMPT_AT, attemptedAt)
      .apply()
  }
}
