package expo.modules.alarmpyoalarm

import java.util.concurrent.TimeUnit

/**
 * 첫 알람과 5분 뒤 자동 재알람이 동시에 울리지 않도록 재생 시간을 한곳에서 결정해요.
 * 자동 재알람은 마지막 단계이므로 최대 10분까지 울릴 수 있어요.
 */
internal object AlarmPyoAlarmRuntimePolicy {
  val MAX_RING_DURATION_MILLIS: Long = TimeUnit.MINUTES.toMillis(10)
  val AUTOMATIC_REPEAT_DELAY_MILLIS: Long = TimeUnit.MINUTES.toMillis(5)
  val REPEAT_OVERLAP_GUARD_MILLIS: Long = TimeUnit.SECONDS.toMillis(10)

  fun ringDurationMillis(automaticRepeatArmed: Boolean): Long =
    if (automaticRepeatArmed) {
      (AUTOMATIC_REPEAT_DELAY_MILLIS - REPEAT_OVERLAP_GUARD_MILLIS)
        .coerceAtLeast(0L)
    } else {
      MAX_RING_DURATION_MILLIS
    }

  fun firstRingStopAt(repeatAt: Long): Long =
    (repeatAt - REPEAT_OVERLAP_GUARD_MILLIS).coerceAtLeast(0L)

  fun audioFocusGranted(requestResult: Int, grantedResult: Int): Boolean =
    requestResult == grantedResult
}
