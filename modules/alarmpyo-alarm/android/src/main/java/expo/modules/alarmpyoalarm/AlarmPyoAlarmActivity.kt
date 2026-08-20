package expo.modules.alarmpyoalarm

import android.app.Activity
import android.content.Intent
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.os.Build
import android.os.Bundle
import android.text.TextUtils
import android.util.TypedValue
import android.view.Gravity
import android.view.KeyEvent
import android.view.View
import android.view.WindowInsets
import android.view.WindowManager
import android.widget.Button
import android.widget.FrameLayout
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.Space
import android.widget.TextView
import java.lang.ref.WeakReference
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

class AlarmPyoAlarmActivity : Activity() {
  private lateinit var timeText: TextView
  private lateinit var dateText: TextView
  private lateinit var shiftBadgeText: TextView
  private lateinit var shiftText: TextView
  private lateinit var actionHintText: TextView
  private lateinit var snoozeButton: Button
  private var plan: AlarmPyoAlarmPlan? = null
  private var source: AlarmPyoAlarmSource = AlarmPyoAlarmSource.WORK
  private var isFinishingAlarm = false

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    configureLockScreenWindow()
    setContentView(createContentView())
    updateFromIntent(intent)
  }

  override fun onNewIntent(intent: Intent) {
    super.onNewIntent(intent)
    setIntent(intent)
    isFinishingAlarm = false
    updateFromIntent(intent)
    val planId = plan?.id
    if (
      planId == null ||
      !AlarmPyoAlarmStore.isActiveSource(applicationContext, planId, source)
    ) {
      finishAndRemoveTask()
    }
  }

  override fun onStart() {
    super.onStart()
    val planId = plan?.id
    if (
      planId == null ||
      !AlarmPyoAlarmStore.isActiveSource(applicationContext, planId, source)
    ) {
      finishAndRemoveTask()
      return
    }
    activeActivity = WeakReference(this)
  }

  override fun onDestroy() {
    if (activeActivity.get() === this) activeActivity.clear()
    super.onDestroy()
  }

  @Deprecated("알람은 알람 끄기 또는 다시 울리기 버튼으로 종료합니다.")
  override fun onBackPressed() = Unit

  override fun dispatchKeyEvent(event: KeyEvent): Boolean {
    if (AlarmPyoAlarmKeyPolicy.handles(event.keyCode)) {
      if (
        AlarmPyoAlarmKeyPolicy.shouldDismiss(
          event.keyCode,
          event.action,
          event.repeatCount
        )
      ) {
        finishAlarm(ACTION_DISMISS_ALARM)
      }
      // Consume down, repeat and up events so the alarm volume is not changed.
      return true
    }
    return super.dispatchKeyEvent(event)
  }

  @Suppress("DEPRECATION")
  private fun configureLockScreenWindow() {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
      setShowWhenLocked(true)
      setTurnScreenOn(true)
    } else {
      @Suppress("DEPRECATION")
      window.addFlags(
        WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED or
          WindowManager.LayoutParams.FLAG_DISMISS_KEYGUARD or
          WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON
      )
    }

    window.addFlags(
      WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON or
        WindowManager.LayoutParams.FLAG_DRAWS_SYSTEM_BAR_BACKGROUNDS
    )
    window.statusBarColor = alarmpyoColor(R.color.alarmpyo_background)
    window.navigationBarColor = alarmpyoColor(R.color.alarmpyo_background)

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
      window.attributes = window.attributes.apply {
        layoutInDisplayCutoutMode =
          WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES
      }
    }
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      window.isNavigationBarContrastEnforced = false
    }
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
      window.setDecorFitsSystemWindows(false)
    } else {
      @Suppress("DEPRECATION")
      window.decorView.systemUiVisibility =
        View.SYSTEM_UI_FLAG_LAYOUT_STABLE or
          View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN or
          View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
    }
  }

  private fun createContentView(): View {
    val configuration = resources.configuration
    val compactWidth = configuration.screenWidthDp in 1..359
    val compactHeight = configuration.screenHeightDp in 1..639
    val largeText = configuration.fontScale >= 1.3f
    val horizontalPadding = dp(if (compactWidth) 16 else 22)
    val topPadding = dp(if (compactHeight) 20 else 30)
    val bottomPadding = dp(if (compactHeight) 20 else 28)

    val root = FrameLayout(this).apply {
      background = GradientDrawable(
        GradientDrawable.Orientation.TL_BR,
        intArrayOf(
          alarmpyoColor(R.color.alarmpyo_background),
          alarmpyoColor(R.color.alarmpyo_night),
          alarmpyoColor(R.color.alarmpyo_day)
        )
      )
    }

    val content = LinearLayout(this).apply {
      orientation = LinearLayout.VERTICAL
      gravity = Gravity.CENTER_HORIZONTAL
      setPadding(horizontalPadding, topPadding, horizontalPadding, bottomPadding)
    }

    val brand = LinearLayout(this).apply {
      orientation = LinearLayout.HORIZONTAL
      gravity = Gravity.CENTER_VERTICAL
      background = roundedShape(alarmpyoColor(R.color.alarmpyo_surface_subtle), dp(18).toFloat())
      setPadding(dp(9), dp(7), dp(15), dp(7))
    }
    brand.addView(ImageView(this).apply {
      setImageResource(R.drawable.alarmpyo_ic_alarm)
      setPadding(dp(8), dp(8), dp(8), dp(8))
      background = roundedShape(alarmpyoColor(R.color.alarmpyo_surface_soft), dp(13).toFloat())
      importantForAccessibility = View.IMPORTANT_FOR_ACCESSIBILITY_NO
    }, LinearLayout.LayoutParams(dp(40), dp(40)))
    brand.addView(label(
      "AlarmPyo 근무 알람",
      15f,
      alarmpyoColor(R.color.alarmpyo_text_primary)
    ).apply {
      typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
      letterSpacing = 0.02f
      maxLines = 3
    }, LinearLayout.LayoutParams(
      LinearLayout.LayoutParams.WRAP_CONTENT,
      LinearLayout.LayoutParams.WRAP_CONTENT
    ).apply { leftMargin = dp(10) })
    content.addView(brand, LinearLayout.LayoutParams(
      LinearLayout.LayoutParams.WRAP_CONTENT,
      LinearLayout.LayoutParams.WRAP_CONTENT
    ))

    content.addView(Space(this), LinearLayout.LayoutParams(
      1,
      if (compactHeight || largeText) dp(18) else 0,
      if (compactHeight || largeText) 0f else 0.55f
    ))

    val alarmCard = LinearLayout(this).apply {
      orientation = LinearLayout.VERTICAL
      gravity = Gravity.CENTER_HORIZONTAL
      setPadding(
        dp(if (compactWidth) 18 else 22),
        dp(if (compactHeight) 22 else 27),
        dp(if (compactWidth) 18 else 22),
        dp(if (compactHeight) 24 else 29)
      )
      background = roundedShape(
        alarmpyoColor(R.color.alarmpyo_surface_subtle),
        dp(30).toFloat(),
        alarmpyoColor(R.color.alarmpyo_surface_soft),
        dp(1)
      )
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) elevation = dp(2).toFloat()
    }

    shiftBadgeText = label(
      "출근 준비",
      14f,
      alarmpyoColor(R.color.alarmpyo_background)
    ).apply {
      gravity = Gravity.CENTER
      typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
      background = roundedShape(alarmpyoColor(R.color.alarmpyo_accent), dp(99).toFloat())
      setPadding(dp(14), dp(7), dp(14), dp(7))
      maxLines = 3
    }
    alarmCard.addView(shiftBadgeText, LinearLayout.LayoutParams(
      LinearLayout.LayoutParams.WRAP_CONTENT,
      LinearLayout.LayoutParams.WRAP_CONTENT
    ))

    timeText = label(
      "--:--",
      if (compactWidth) 68f else 76f,
      alarmpyoColor(R.color.alarmpyo_text_primary)
    ).apply {
      gravity = Gravity.CENTER
      typeface = Typeface.create("sans-serif", Typeface.BOLD)
      letterSpacing = -0.035f
      contentDescription = "알람 시간"
      includeFontPadding = false
      maxLines = 1
      ellipsize = TextUtils.TruncateAt.END
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        setAutoSizeTextTypeUniformWithConfiguration(
          24,
          if (compactWidth) 68 else 76,
          2,
          TypedValue.COMPLEX_UNIT_SP
        )
      }
    }
    alarmCard.addView(timeText, matchWrap(topMargin = dp(15)))

    dateText = label("", 16f, alarmpyoColor(R.color.alarmpyo_text_secondary)).apply {
      gravity = Gravity.CENTER
      typeface = Typeface.create("sans-serif-medium", Typeface.NORMAL)
      maxLines = 2
    }
    alarmCard.addView(dateText, matchWrap(topMargin = dp(7)))

    alarmCard.addView(View(this).apply {
      setBackgroundColor(alarmpyoColor(R.color.alarmpyo_surface_soft))
    }, fixedHeight(dp(1), topMargin = dp(if (compactHeight) 18 else 22)))

    shiftText = label(
      "근무 준비 시간입니다.",
      if (compactWidth) 22f else 24f,
      alarmpyoColor(R.color.alarmpyo_text_primary)
    ).apply {
      gravity = Gravity.CENTER
      typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
      setLineSpacing(dp(2).toFloat(), 1.08f)
      maxLines = 4
    }
    alarmCard.addView(shiftText, matchWrap(topMargin = dp(if (compactHeight) 18 else 21)))

    content.addView(alarmCard, matchWrap())

    content.addView(Space(this), LinearLayout.LayoutParams(
      1,
      if (compactHeight || largeText) dp(20) else 0,
      if (compactHeight || largeText) 0f else 0.45f
    ))

    actionHintText = label(
      "알람을 끄거나 잠시 뒤 다시 울릴 수 있습니다.",
      14f,
      alarmpyoColor(R.color.alarmpyo_text_secondary)
    ).apply {
      gravity = Gravity.CENTER
      maxLines = 4
      setLineSpacing(dp(2).toFloat(), 1f)
    }
    content.addView(actionHintText, matchWrap())

    snoozeButton = alarmButton(
      text = "5분 뒤 다시 울리기",
      background = alarmpyoColor(R.color.alarmpyo_surface_soft),
      foreground = alarmpyoColor(R.color.alarmpyo_text_primary),
      border = alarmpyoColor(R.color.alarmpyo_surface_border)
    ) { finishAlarm(ACTION_SNOOZE_ALARM) }
    content.addView(snoozeButton, wrapButton(topMargin = dp(16)))

    val dismissButton = alarmButton(
      text = "알람 끄기",
      background = alarmpyoColor(R.color.alarmpyo_accent),
      foreground = alarmpyoColor(R.color.alarmpyo_background),
      border = null
    ) { finishAlarm(ACTION_DISMISS_ALARM) }
    content.addView(dismissButton, wrapButton(topMargin = dp(11)))

    val scrollView = ScrollView(this).apply {
      isFillViewport = true
      overScrollMode = View.OVER_SCROLL_NEVER
      clipToPadding = false
      addView(content, FrameLayout.LayoutParams(
        FrameLayout.LayoutParams.MATCH_PARENT,
        FrameLayout.LayoutParams.WRAP_CONTENT
      ))
    }
    root.addView(scrollView, FrameLayout.LayoutParams(
      FrameLayout.LayoutParams.MATCH_PARENT,
      FrameLayout.LayoutParams.MATCH_PARENT
    ))

    applySafeInsets(
      root = root,
      content = content,
      horizontalPadding = horizontalPadding,
      topPadding = topPadding,
      bottomPadding = bottomPadding
    )

    return root
  }

  private fun applySafeInsets(
    root: View,
    content: View,
    horizontalPadding: Int,
    topPadding: Int,
    bottomPadding: Int
  ) {
    root.setOnApplyWindowInsetsListener { _, windowInsets ->
      val safeInsets = safeInsets(windowInsets)
      content.setPadding(
        horizontalPadding + safeInsets.left,
        topPadding + safeInsets.top,
        horizontalPadding + safeInsets.right,
        bottomPadding + safeInsets.bottom
      )
      windowInsets
    }
    root.requestApplyInsets()
  }

  private fun safeInsets(windowInsets: WindowInsets): SafeInsets {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
      val insets = windowInsets.getInsets(
        WindowInsets.Type.systemBars() or WindowInsets.Type.displayCutout()
      )
      return SafeInsets(insets.left, insets.top, insets.right, insets.bottom)
    }

    @Suppress("DEPRECATION")
    var left = windowInsets.systemWindowInsetLeft
    @Suppress("DEPRECATION")
    var top = windowInsets.systemWindowInsetTop
    @Suppress("DEPRECATION")
    var right = windowInsets.systemWindowInsetRight
    @Suppress("DEPRECATION")
    var bottom = windowInsets.systemWindowInsetBottom

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
      windowInsets.displayCutout?.let { cutout ->
        left = maxOf(left, cutout.safeInsetLeft)
        top = maxOf(top, cutout.safeInsetTop)
        right = maxOf(right, cutout.safeInsetRight)
        bottom = maxOf(bottom, cutout.safeInsetBottom)
      }
    }
    return SafeInsets(left, top, right, bottom)
  }

  private fun updateFromIntent(intent: Intent) {
    val newPlan = AlarmPyoAlarmPlan.fromIntent(intent) ?: return
    plan = newPlan
    source = AlarmPyoAlarmSource.fromIntent(intent, newPlan)
    // 전달 안전 재시도 시각이 아니라 사용자가 처음 설정한 알람 시각을 표시해요.
    val displayAlarmAt = newPlan.originalAlarmAt.takeIf { it > 0L }
      ?: newPlan.alarmAt.takeIf { it > 0L }
      ?: System.currentTimeMillis()
    val alarmDate = Date(displayAlarmAt)
    timeText.text = SimpleDateFormat("HH:mm", Locale.KOREA).format(alarmDate)
    dateText.text = SimpleDateFormat("M월 d일 EEEE", Locale.KOREA).format(alarmDate)
    val shiftAccentResource = when (newPlan.shiftTypeId) {
      "day", "substitute-day" -> R.color.alarmpyo_day
      "night", "substitute-night" -> R.color.alarmpyo_night
      "exception-training" -> R.color.alarmpyo_training
      "exception-reserve" -> R.color.alarmpyo_reserve
      "off" -> R.color.alarmpyo_off
      "substitute" -> R.color.alarmpyo_unknown
      else -> R.color.alarmpyo_accent
    }
    val shiftAccent = alarmpyoColor(shiftAccentResource)
    shiftBadgeText.text = when {
      source == AlarmPyoAlarmSource.TIMER ->
        AlarmPyoQuickTimerPresentation.badge(newPlan.isSingleRepeat())
      newPlan.isSingleRepeat() && newPlan.shiftTypeId == "test" -> "시험 재알람"
      newPlan.isSingleRepeat() -> "5분 재알람"
      newPlan.shiftTypeId == "test" -> "시험 알람"
      newPlan.shiftName.isNotBlank() -> newPlan.shiftName
      else -> "출근 준비"
    }
    shiftBadgeText.setTextColor(
      alarmpyoColor(
        if (shiftAccentResource == R.color.alarmpyo_accent) {
          R.color.alarmpyo_background
        } else {
          R.color.alarmpyo_text_primary
        }
      )
    )
    shiftBadgeText.background = roundedShape(shiftAccent, dp(99).toFloat())
    shiftText.text = when {
      source == AlarmPyoAlarmSource.TIMER -> AlarmPyoQuickTimerPresentation.message(newPlan)
      newPlan.isSingleRepeat() && newPlan.shiftTypeId == "test" -> "시험 알람이 한 번 더 울립니다."
      newPlan.isSingleRepeat() && newPlan.shiftName.isNotBlank() ->
        "${newPlan.shiftName} 알람이 한 번 더 울립니다."
      newPlan.isSingleRepeat() -> "근무 알람이 한 번 더 울립니다."
      newPlan.shiftTypeId == "test" -> "시험 알람입니다."
      newPlan.shiftName.isNotBlank() -> "${newPlan.shiftName} 준비 시간입니다."
      else -> "근무 준비 시간입니다."
    }
    val finalRepeat = newPlan.isSingleRepeat()
    snoozeButton.visibility = if (finalRepeat) View.GONE else View.VISIBLE
    actionHintText.text = if (finalRepeat) {
      "이번 알람은 마지막 재알람입니다. 알람 끄기를 눌러 종료합니다."
    } else {
      "알람을 끄거나 잠시 뒤 다시 울릴 수 있습니다."
    }
    timeText.contentDescription = "${timeText.text} 알람"
  }

  private fun finishAlarm(action: String) {
    if (isFinishingAlarm) return
    val currentPlan = plan ?: return
    isFinishingAlarm = true
    val serviceIntent = Intent(this, AlarmPyoAlarmService::class.java).apply {
      this.action = action
      putAlarmPyoSource(source)
      currentPlan.addToIntent(this)
    }
    startService(serviceIntent)
    finishAndRemoveTask()
  }

  private fun label(text: String, size: Float, color: Int) = TextView(this).apply {
    this.text = text
    textSize = size
    setTextColor(color)
    fontFeatureSettings = "tnum"
  }

  private fun alarmButton(
    text: String,
    background: Int,
    foreground: Int,
    border: Int?,
    onClick: () -> Unit
  ) = Button(this).apply {
    this.text = text
    textSize = 17f
    isAllCaps = false
    setTextColor(foreground)
    typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
    this.background = roundedShape(background, dp(20).toFloat(), border, dp(1))
    stateListAnimator = null
    minimumHeight = dp(58)
    maxLines = 3
    ellipsize = null
    gravity = Gravity.CENTER
    setPadding(dp(18), dp(11), dp(18), dp(11))
    setOnClickListener { onClick() }
  }

  private fun roundedShape(
    color: Int,
    radius: Float,
    borderColor: Int? = null,
    borderWidth: Int = 0
  ) = GradientDrawable().apply {
    shape = GradientDrawable.RECTANGLE
    cornerRadius = radius
    setColor(color)
    if (borderColor != null && borderWidth > 0) setStroke(borderWidth, borderColor)
  }

  private fun matchWrap(topMargin: Int = 0) = LinearLayout.LayoutParams(
    LinearLayout.LayoutParams.MATCH_PARENT,
    LinearLayout.LayoutParams.WRAP_CONTENT
  ).apply { this.topMargin = topMargin }

  private fun fixedHeight(height: Int, topMargin: Int = 0) = LinearLayout.LayoutParams(
    LinearLayout.LayoutParams.MATCH_PARENT,
    height
  ).apply { this.topMargin = topMargin }

  private fun wrapButton(topMargin: Int = 0) = LinearLayout.LayoutParams(
    LinearLayout.LayoutParams.MATCH_PARENT,
    LinearLayout.LayoutParams.WRAP_CONTENT
  ).apply { this.topMargin = topMargin }

  private fun dp(value: Int): Int = (value * resources.displayMetrics.density).toInt()

  private data class SafeInsets(
    val left: Int,
    val top: Int,
    val right: Int,
    val bottom: Int
  )

  companion object {
    @Volatile
    private var activeActivity = WeakReference<AlarmPyoAlarmActivity>(null)

    internal fun finishActiveAlarm() {
      val activity = activeActivity.get() ?: return
      activity.runOnUiThread {
        if (!activity.isFinishing) activity.finishAndRemoveTask()
      }
    }
  }
}

internal object AlarmPyoAlarmKeyPolicy {
  fun handles(keyCode: Int): Boolean =
    keyCode == KeyEvent.KEYCODE_VOLUME_UP || keyCode == KeyEvent.KEYCODE_VOLUME_DOWN

  fun shouldDismiss(keyCode: Int, action: Int, repeatCount: Int): Boolean =
    handles(keyCode) && action == KeyEvent.ACTION_DOWN && repeatCount == 0
}
