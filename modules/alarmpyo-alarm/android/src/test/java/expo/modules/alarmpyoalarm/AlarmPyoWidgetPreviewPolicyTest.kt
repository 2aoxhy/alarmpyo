package expo.modules.alarmpyoalarm

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Test

class AlarmPyoWidgetPreviewPolicyTest {
  @Test
  fun `Android 14 이하는 정적 previewLayout을 사용해요`() {
    assertEquals(
      AlarmPyoWidgetPreviewDecision.UNSUPPORTED,
      decide(sdkInt = 34)
    )
  }

  @Test
  fun `스냅샷이 없으면 생성형 미리보기를 덮어쓰지 않아요`() {
    assertEquals(
      AlarmPyoWidgetPreviewDecision.NO_DATA,
      decide(hasSnapshot = false, signature = null)
    )
  }

  @Test
  fun `같은 화면 서명은 호출 제한과 무관하게 생략해요`() {
    assertEquals(
      AlarmPyoWidgetPreviewDecision.UNCHANGED,
      decide(signature = "same", storedSignature = "same", lastAttemptAt = NOW - 1_000L)
    )
  }

  @Test
  fun `바뀐 화면도 마지막 시도 후 30분 전에는 미뤄요`() {
    assertEquals(
      AlarmPyoWidgetPreviewDecision.DEFERRED,
      decide(lastAttemptAt = NOW - AlarmPyoWidgetPreviewPolicy.RETRY_COOLDOWN_MILLIS + 1L)
    )
    assertEquals(
      AlarmPyoWidgetPreviewDecision.UPDATE,
      decide(lastAttemptAt = NOW - AlarmPyoWidgetPreviewPolicy.RETRY_COOLDOWN_MILLIS)
    )
  }

  @Test
  fun `시계가 과거로 바뀌면 미래의 시도 시각에 영구 차단되지 않아요`() {
    assertEquals(
      AlarmPyoWidgetPreviewDecision.UPDATE,
      decide(lastAttemptAt = NOW + 60_000L)
    )
  }

  @Test
  fun `보이는 자료와 글자 크기 단계가 서명을 결정해요`() {
    val original = state()
    val originalSignature = AlarmPyoWidgetPreviewPolicy.signature(original, 1f)

    assertEquals(
      originalSignature,
      AlarmPyoWidgetPreviewPolicy.signature(original, 1.29f)
    )
    assertNotEquals(
      originalSignature,
      AlarmPyoWidgetPreviewPolicy.signature(original.copy(scheduleText = "08:10–16:40"), 1f)
    )
    assertNotEquals(
      originalSignature,
      AlarmPyoWidgetPreviewPolicy.signature(original, 1.3f)
    )
  }

  private fun decide(
    sdkInt: Int = 35,
    hasSnapshot: Boolean = true,
    signature: String? = "new",
    storedSignature: String? = "old",
    lastAttemptAt: Long = 0L
  ): AlarmPyoWidgetPreviewDecision = AlarmPyoWidgetPreviewPolicy.decide(
    sdkInt = sdkInt,
    hasSnapshot = hasSnapshot,
    signature = signature,
    storedSignature = storedSignature,
    lastAttemptAt = lastAttemptAt,
    nowMillis = NOW
  )

  private fun state() = AlarmPyoWidgetViewState(
    dateText = "2026년 8월 15일 토요일",
    statusText = "현재 근무 중",
    titleText = "주간 근무 중",
    scheduleText = "06:45–17:45",
    bottomLabel = "다음 근무",
    bottomText = "내일 야간 · 17:45",
    visual = AlarmPyoWidgetVisual.DAY,
    contentDescription = "현재 근무 중",
    nextRefreshAt = null
  )

  companion object {
    private const val NOW = 1_786_755_600_000L
  }
}
