package expo.modules.alarmpyoalarm

import android.app.Notification
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.media.AudioAttributes
import android.media.AudioFocusRequest
import android.media.AudioManager
import android.media.MediaPlayer
import android.media.ToneGenerator
import android.net.Uri
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.os.PowerManager
import android.os.VibrationAttributes
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import android.util.Log
import java.util.concurrent.TimeUnit

class AlarmPyoAlarmService : Service() {
  private val handler = Handler(Looper.getMainLooper())
  private val audioAttributes = AudioAttributes.Builder()
    .setUsage(AudioAttributes.USAGE_ALARM)
    .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
    .build()
  private val audioFocusListener = AudioManager.OnAudioFocusChangeListener { }

  private var mediaPlayer: MediaPlayer? = null
  private var toneGenerator: ToneGenerator? = null
  private var wakeLock: PowerManager.WakeLock? = null
  private var audioFocusRequest: AudioFocusRequest? = null
  private var audioFocusHeld = false
  private var ringingPlanId: String? = null
  private var ringingPlan: AlarmPyoAlarmPlan? = null
  private var ringingSource: AlarmPyoAlarmSource? = null
  private var deliveryCommitted = false
  private var deliveryCommitAttempt = 0
  private var deliveryRetryScheduled = false
  private var retryAlreadyArmed = false
  private var playbackConfirmedRecorded = false
  private var soundGeneration = 0
  private var ringStartedAt = 0L
  private val stopRingingRunnable = Runnable { stopAlarm() }

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    val plan = intent?.let(AlarmPyoAlarmPlan::fromIntent)
    val source = intent?.let { AlarmPyoAlarmSource.fromIntent(it, plan) }
      ?: AlarmPyoAlarmSource.WORK
    val hasArmedRetry = intent?.getBooleanExtra(EXTRA_RETRY_ARMED, false) == true
    val automaticRepeatEligible =
      intent?.getBooleanExtra(EXTRA_AUTOMATIC_REPEAT_ELIGIBLE, false) == true
    when (intent?.action) {
      ACTION_DISMISS_ALARM -> {
        if (matchesActiveAlarm(plan, source)) {
          plan?.let {
            val completed = confirmDelivery(it, source).completed
            cancelSingleRepeat(it, source)
            if (completed) recordEvent(AlarmPyoAlarmEventType.DISMISSED, it, source)
          }
          stopAlarm()
        } else if (ringingPlanId == null) stopSelf(startId)
      }
      ACTION_SNOOZE_ALARM -> {
        if (matchesActiveAlarm(plan, source)) {
          plan?.let {
            val completed = confirmDelivery(it, source).completed
            if (completed) {
              if (it.isSingleRepeat()) {
                // 두 번째 알람은 마지막 단계입니다. 오래된 알림 액션이 호출돼도
                // 세 번째 알람을 만들지 않고 끄기와 동일하게 처리합니다.
                cancelSingleRepeat(it, source)
                recordEvent(AlarmPyoAlarmEventType.DISMISSED, it, source)
              } else {
                val repeat = scheduleManualSingleRepeat(it, source, 5)
                if (repeat != null) {
                  recordEvent(
                    AlarmPyoAlarmEventType.SNOOZED,
                    it,
                    source,
                    nextAlarmAt = repeat.alarmAt
                  )
                } else {
                  cancelSingleRepeat(it, source)
                  recordEvent(AlarmPyoAlarmEventType.DISMISSED, it, source)
                }
              }
            }
          }
          stopAlarm()
        } else if (ringingPlanId == null) {
          stopSelf(startId)
        }
      }
      ACTION_START_RINGING -> {
        if (plan != null) {
          runCatching {
            startRinging(plan, source, hasArmedRetry, automaticRepeatEligible)
          }.onFailure { error ->
            Log.e(TAG, "AlarmPyo 알람 재생을 시작하지 못했습니다.", error)
            retryAndStop(plan, source)
          }
        } else {
          stopSelf(startId)
        }
      }
      else -> stopSelf(startId)
    }
    return START_NOT_STICKY
  }

  override fun onDestroy() {
    AlarmPyoAlarmSoundPreview.stop()
    cleanUpRinging()
    AlarmPyoAlarmActivity.finishActiveAlarm()
    super.onDestroy()
  }

  private fun startRinging(
    plan: AlarmPyoAlarmPlan,
    source: AlarmPyoAlarmSource,
    hasArmedRetry: Boolean,
    automaticRepeatEligible: Boolean
  ) {
    val activePlan = ringingPlan
    val activeSource = ringingSource ?: AlarmPyoAlarmSource.WORK
    if (
      activePlan?.hasSameDeliveryGeneration(plan) == true &&
      activeSource == source
    ) return
    if (activePlan != null && source.priority < activeSource.priority) {
      Log.w(TAG, "더 중요한 알람이 울리는 중이라 현재 알람은 안전 재시도를 기다립니다.")
      return
    }
    if (
      activePlan?.id == plan.id &&
      activeSource == source &&
      (mediaPlayer != null || toneGenerator != null)
    ) {
      // 소리는 이미 정상 재생 중이지만 저장 완료만 실패해 안전 재시도가 도착한
      // 경우, 새 세대를 다시 재생하지 않고 현재 가청 상태로 완료를 확정합니다.
      ringingPlan = plan
      deliveryCommitted = false
      deliveryCommitAttempt = 0
      deliveryRetryScheduled = false
      retryAlreadyArmed = hasArmedRetry
      val completion = confirmDelivery(
        plan,
        source,
        allowAutomaticRepeat = playbackConfirmedRecorded && automaticRepeatEligible
      )
      if (completion.completed && playbackConfirmedRecorded) {
        handleConfirmedPlayback(plan, source, completion)
      }
      return
    }
    AlarmPyoAlarmChannels.ensure(this)
    if (!AlarmPyoAlarmPermissions.notificationsAllowed(this)) {
      throw IllegalStateException("알림 또는 알람 채널이 차단되어 있습니다.")
    }

    AlarmPyoAlarmSoundPreview.stop()
    cleanUpRinging()
    ringStartedAt = System.currentTimeMillis()
    val ringDurationMillis = AlarmPyoAlarmRuntimePolicy.ringDurationMillis(
      automaticRepeatArmed = false
    )
    AlarmPyoAlarmStore.markActive(
      applicationContext,
      plan.id,
      System.currentTimeMillis() + ringDurationMillis,
      source
    )

    // 활성 상태는 메모리에 즉시 반영한 뒤 디스크 작업이나 미디어 준비보다 먼저
    // 포그라운드 알림을 게시해 Android 12+의 시작 제한을 안정적으로 만족합니다.
    promoteToForeground(plan, source)

    ringingPlanId = plan.id
    ringingPlan = plan
    ringingSource = source
    deliveryCommitted = false
    deliveryCommitAttempt = 0
    deliveryRetryScheduled = false
    retryAlreadyArmed = hasArmedRetry
    playbackConfirmedRecorded = false
    acquireWakeLock()
    runCatching(::requestAudioFocus).onFailure { error ->
      Log.e(TAG, "알람 오디오 포커스를 얻지 못했습니다.", error)
    }.onSuccess { granted ->
      if (!granted) {
        Log.w(TAG, "다른 오디오가 사용 중이어서 알람 오디오 포커스를 얻지 못했어요.")
      }
    }
    runCatching(::startVibration).onFailure { error ->
      Log.e(TAG, "알람 진동을 시작하지 못했습니다.", error)
    }
    startAlarmSound(
      onStarted = {
        val completion = confirmDelivery(
          plan,
          source,
          allowAutomaticRepeat = automaticRepeatEligible
        )
        if (!completion.completed) {
          stopAlarm()
          return@startAlarmSound
        }
        handleConfirmedPlayback(plan, source, completion)
      },
      onFailed = {
        Log.e(TAG, "기본음과 대체음 재생에 모두 실패해 알람을 다시 예약합니다.")
        retryAndStop(plan, source)
      }
    )

    scheduleRingStop()
    handler.postDelayed({
      if (!deliveryCommitted) {
        Log.e(TAG, "제한 시간 안에 알람 소리 시작을 확인하지 못했습니다.")
        retryAndStop(plan, source)
      }
    }, SOUND_START_TIMEOUT_MILLIS)
  }

  private fun confirmDelivery(
    plan: AlarmPyoAlarmPlan,
    source: AlarmPyoAlarmSource,
    allowAutomaticRepeat: Boolean = false
  ): AlarmPyoAlarmDeliveryCompletionResult {
    if (deliveryCommitted) return AlarmPyoAlarmDeliveryCompletionResult(completed = true)
    if (
      deliveryRetryScheduled ||
      ringingPlan?.hasSameDeliveryGeneration(plan) != true
    ) return AlarmPyoAlarmDeliveryCompletionResult(completed = false)

    repeat(MAX_DELIVERY_COMMIT_ATTEMPTS) {
      deliveryCommitAttempt += 1
      val result = runCatching {
        when (source) {
          AlarmPyoAlarmSource.TIMER ->
            AlarmPyoQuickTimerScheduler.completeConfirmedDelivery(
              applicationContext,
              plan,
              automaticRepeatEligible = allowAutomaticRepeat
            )
          AlarmPyoAlarmSource.TEST,
          AlarmPyoAlarmSource.WORK ->
            AlarmPyoAlarmScheduler.completeConfirmedDelivery(
              applicationContext,
              plan,
              source == AlarmPyoAlarmSource.TEST,
              automaticRepeatEligible = allowAutomaticRepeat
            )
        }
      }.getOrElse { error ->
        Log.e(TAG, "알람 완료 상태 저장에 실패했습니다.", error)
        AlarmPyoAlarmDeliveryCompletionResult(completed = false)
      }
      if (result.completed) {
        deliveryCommitted = true
        return result
      }
    }
    Log.e(TAG, "알람 계획 세대가 변경되어 이전 알람 완료 처리를 건너뜁니다.")
    return AlarmPyoAlarmDeliveryCompletionResult(completed = false)
  }

  private fun handleConfirmedPlayback(
    plan: AlarmPyoAlarmPlan,
    source: AlarmPyoAlarmSource,
    completion: AlarmPyoAlarmDeliveryCompletionResult
  ) {
    if (!playbackConfirmedRecorded) {
      playbackConfirmedRecorded = true
      recordEvent(AlarmPyoAlarmEventType.PLAYBACK_CONFIRMED, plan, source)
      if (plan.isSingleRepeat()) {
        recordEvent(AlarmPyoAlarmEventType.AUTO_REPEAT_STARTED, plan, source)
      }
    }
    completion.automaticRepeat?.let { repeat ->
      if (repeat.created) {
        recordEvent(
          AlarmPyoAlarmEventType.AUTO_REPEAT_SCHEDULED,
          plan,
          source,
          nextAlarmAt = repeat.plan.alarmAt
        )
      }
      scheduleRingStop(repeat.plan.alarmAt)
    }
  }

  private fun cancelSingleRepeat(
    plan: AlarmPyoAlarmPlan,
    source: AlarmPyoAlarmSource
  ) {
    when (source) {
      AlarmPyoAlarmSource.TIMER ->
        AlarmPyoQuickTimerScheduler.cancelSingleRepeat(applicationContext, plan.rootPlanId)
      AlarmPyoAlarmSource.TEST,
      AlarmPyoAlarmSource.WORK ->
        AlarmPyoAlarmScheduler.cancelSingleRepeat(applicationContext, plan.rootPlanId)
    }
  }

  private fun scheduleManualSingleRepeat(
    plan: AlarmPyoAlarmPlan,
    source: AlarmPyoAlarmSource,
    minutes: Int
  ): AlarmPyoAlarmPlan? = when (source) {
    AlarmPyoAlarmSource.TIMER ->
      AlarmPyoQuickTimerScheduler.scheduleManualSingleRepeat(
        applicationContext,
        plan,
        minutes
      )
    AlarmPyoAlarmSource.TEST,
    AlarmPyoAlarmSource.WORK ->
      AlarmPyoAlarmScheduler.scheduleManualSingleRepeat(
        applicationContext,
        plan,
        source == AlarmPyoAlarmSource.TEST,
        minutes
      )
  }

  private fun scheduleRingStop(repeatAt: Long? = null) {
    handler.removeCallbacks(stopRingingRunnable)
    val deadline = repeatAt?.let(AlarmPyoAlarmRuntimePolicy::firstRingStopAt)
      ?: (ringStartedAt + AlarmPyoAlarmRuntimePolicy.ringDurationMillis(
        automaticRepeatArmed = false
      ))
    ringingPlanId?.let {
      AlarmPyoAlarmStore.markActive(
        applicationContext,
        it,
        deadline,
        ringingSource ?: AlarmPyoAlarmSource.WORK
      )
    }
    handler.postDelayed(
      stopRingingRunnable,
      (deadline - System.currentTimeMillis()).coerceAtLeast(0L)
    )
  }

  private fun retryAndStop(plan: AlarmPyoAlarmPlan, source: AlarmPyoAlarmSource) {
    if (deliveryCommitted || deliveryRetryScheduled) return
    deliveryRetryScheduled = true
    recordEvent(AlarmPyoAlarmEventType.PLAYBACK_FAILED, plan, source)
    val retryResult = if (!retryAlreadyArmed) {
      runCatching {
        when (source) {
          AlarmPyoAlarmSource.TIMER ->
            AlarmPyoQuickTimerScheduler.retryDelivery(applicationContext, plan)
          AlarmPyoAlarmSource.TEST,
          AlarmPyoAlarmSource.WORK ->
            AlarmPyoAlarmScheduler.retryDelivery(
              applicationContext,
              plan,
              source == AlarmPyoAlarmSource.TEST
            )
        }
      }.onFailure { error ->
        Log.e(TAG, "AlarmPyo 알람 재시도를 예약하지 못했습니다.", error)
      }.getOrNull()
    } else {
      AlarmPyoAlarmRetryResult(plan, scheduled = true)
    }
    recordEvent(
      if (retryResult?.scheduled == true) {
        AlarmPyoAlarmEventType.RETRY_SCHEDULED
      } else {
        AlarmPyoAlarmEventType.RETRY_EXHAUSTED
      },
      plan,
      source,
      nextAlarmAt = if (retryResult?.scheduled == true) retryResult.plan.alarmAt else 0L
    )
    stopAlarm()
  }

  private fun recordEvent(
    type: String,
    plan: AlarmPyoAlarmPlan,
    source: AlarmPyoAlarmSource,
    nextAlarmAt: Long = 0L
  ) {
    if (source == AlarmPyoAlarmSource.TIMER) return
    AlarmPyoAlarmStore.appendRecentEvent(
      applicationContext,
      AlarmPyoAlarmHistoryEvent.create(
        type,
        plan,
        source == AlarmPyoAlarmSource.TEST,
        nextAlarmAt
      )
    )
  }

  private fun promoteToForeground(
    plan: AlarmPyoAlarmPlan,
    source: AlarmPyoAlarmSource
  ) {
    val notification = buildAlarmNotification(plan, source)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      startForeground(
        ALARM_NOTIFICATION_ID,
        notification,
        ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK
      )
    } else {
      startForeground(ALARM_NOTIFICATION_ID, notification)
    }
  }

  private fun matchesActiveAlarm(
    plan: AlarmPyoAlarmPlan?,
    source: AlarmPyoAlarmSource
  ): Boolean =
    plan != null && (
      (
        ringingPlan?.hasSameDeliveryGeneration(plan) == true &&
          ringingSource == source
        ) ||
        (
          ringingPlan == null &&
            AlarmPyoAlarmStore.isActiveSource(applicationContext, plan.id, source)
          )
      )

  private fun stopAlarm() {
    cleanUpRinging()
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
      stopForeground(STOP_FOREGROUND_REMOVE)
    } else {
      @Suppress("DEPRECATION")
      stopForeground(true)
    }
    stopSelf()
  }

  private fun cleanUpRinging(clearActiveState: Boolean = true) {
    val clearedPlanId = ringingPlanId
    val clearedSource = ringingSource
    handler.removeCallbacksAndMessages(null)
    soundGeneration += 1
    val player = mediaPlayer
    mediaPlayer = null
    player?.let {
      runCatching { if (it.isPlaying) it.stop() }
      runCatching { it.reset() }
      runCatching { it.release() }
    }
    toneGenerator?.let { runCatching { it.release() } }
    toneGenerator = null
    runCatching { vibrator().cancel() }
    abandonAudioFocus()
    wakeLock?.takeIf { it.isHeld }?.release()
    wakeLock = null
    ringingPlanId = null
    ringingPlan = null
    ringingSource = null
    deliveryCommitted = false
    deliveryCommitAttempt = 0
    deliveryRetryScheduled = false
    retryAlreadyArmed = false
    playbackConfirmedRecorded = false
    ringStartedAt = 0L
    if (clearActiveState && clearedPlanId != null) {
      AlarmPyoAlarmStore.clearActive(applicationContext, clearedPlanId, clearedSource)
    }
  }

  @Suppress("DEPRECATION")
  private fun buildAlarmNotification(
    plan: AlarmPyoAlarmPlan,
    source: AlarmPyoAlarmSource
  ): Notification {
    val fullScreenIntent = Intent(this, AlarmPyoAlarmActivity::class.java).apply {
      action = ACTION_START_RINGING
      data = android.net.Uri.Builder()
        .scheme("alarmpyo-alarm")
        .authority("ringing")
        .appendPath(plan.id)
        .build()
      addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP)
      putAlarmPyoSource(source)
      plan.addToIntent(this)
    }
    val fullScreenPendingIntent = PendingIntent.getActivity(
      this,
      plan.id.hashCode(),
      fullScreenIntent,
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
    )

    val dismissPendingIntent = serviceActionPendingIntent(
      plan,
      source,
      ACTION_DISMISS_ALARM,
      0x444953
    )
    val title = when {
      source == AlarmPyoAlarmSource.TIMER ->
        AlarmPyoQuickTimerPresentation.notificationTitle(plan.isSingleRepeat())
      plan.isSingleRepeat() && plan.shiftTypeId == "test" -> "AlarmPyo 시험 재알람"
      plan.isSingleRepeat() -> "AlarmPyo 5분 재알람"
      plan.shiftTypeId == "test" -> "AlarmPyo 시험 알람"
      else -> "AlarmPyo 근무 알람"
    }
    val content = if (source == AlarmPyoAlarmSource.TIMER) {
      AlarmPyoQuickTimerPresentation.notificationContent(plan)
    } else {
      plan.shiftName.ifBlank { "근무 준비 시간입니다." }
    }

    val builder = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      Notification.Builder(this, ALARM_CHANNEL_ID)
    } else {
      @Suppress("DEPRECATION")
      Notification.Builder(this)
    }
    builder
      .setSmallIcon(R.drawable.alarmpyo_ic_alarm)
      .setColor(alarmpyoColor(R.color.alarmpyo_accent))
      .setContentTitle(title)
      .setContentText(content)
      .setCategory(Notification.CATEGORY_ALARM)
      .setVisibility(Notification.VISIBILITY_PUBLIC)
      .setPriority(Notification.PRIORITY_MAX)
      .setOngoing(true)
      .setAutoCancel(false)
      .setOnlyAlertOnce(true)
      .setSound(null)
      .setVibrate(longArrayOf(0L))
      .setContentIntent(fullScreenPendingIntent)
      .setFullScreenIntent(fullScreenPendingIntent, true)
    if (!plan.isSingleRepeat()) {
      val snoozePendingIntent = serviceActionPendingIntent(
        plan,
        source,
        ACTION_SNOOZE_ALARM,
        0x534E5A
      )
      builder.addAction(
        Notification.Action.Builder(
          R.drawable.alarmpyo_ic_alarm,
          "5분 뒤 다시 울리기",
          snoozePendingIntent
        ).build()
      )
    }
    builder.addAction(
      Notification.Action.Builder(
        R.drawable.alarmpyo_ic_alarm,
        "알람 끄기",
        dismissPendingIntent
      ).build()
    )

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
      builder.setForegroundServiceBehavior(Notification.FOREGROUND_SERVICE_IMMEDIATE)
    }

    return builder.build()
  }

  private fun serviceActionPendingIntent(
    plan: AlarmPyoAlarmPlan,
    source: AlarmPyoAlarmSource,
    action: String,
    requestCodeSalt: Int
  ): PendingIntent {
    val intent = Intent(this, AlarmPyoAlarmService::class.java).apply {
      this.action = action
      putExtra(EXTRA_IS_TEST, plan.shiftTypeId == "test")
      putAlarmPyoSource(source)
      plan.addToIntent(this)
    }
    return PendingIntent.getService(
      this,
      plan.id.hashCode() xor requestCodeSalt,
      intent,
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
    )
  }

  private fun acquireWakeLock() {
    val powerManager = getSystemService(Context.POWER_SERVICE) as PowerManager
    wakeLock = powerManager.newWakeLock(
      PowerManager.PARTIAL_WAKE_LOCK,
      "AlarmPyo:AlarmRinging"
    ).apply {
      setReferenceCounted(false)
      acquire(AlarmPyoAlarmRuntimePolicy.MAX_RING_DURATION_MILLIS)
    }
  }

  private fun requestAudioFocus(): Boolean {
    val audioManager = getSystemService(Context.AUDIO_SERVICE) as AudioManager
    val result = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      val request = AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN_TRANSIENT)
        .setAudioAttributes(audioAttributes)
        .setOnAudioFocusChangeListener(audioFocusListener)
        .build()
      audioFocusRequest = request
      audioManager.requestAudioFocus(request)
    } else {
      @Suppress("DEPRECATION")
      audioManager.requestAudioFocus(
        audioFocusListener,
        AudioManager.STREAM_ALARM,
        AudioManager.AUDIOFOCUS_GAIN_TRANSIENT
      )
    }
    audioFocusHeld = AlarmPyoAlarmRuntimePolicy.audioFocusGranted(
      result,
      AudioManager.AUDIOFOCUS_REQUEST_GRANTED
    )
    if (!audioFocusHeld && Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      audioFocusRequest = null
    }
    return audioFocusHeld
  }

  private fun abandonAudioFocus() {
    if (!audioFocusHeld && audioFocusRequest == null) return
    val audioManager = getSystemService(Context.AUDIO_SERVICE) as AudioManager
    runCatching {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        audioFocusRequest?.let(audioManager::abandonAudioFocusRequest)
      } else if (audioFocusHeld) {
        @Suppress("DEPRECATION")
        audioManager.abandonAudioFocus(audioFocusListener)
      }
    }.onFailure { error ->
      Log.w(TAG, "알람 오디오 포커스를 반환하지 못했어요.", error)
    }
    audioFocusRequest = null
    audioFocusHeld = false
  }

  private fun startAlarmSound(onStarted: () -> Unit, onFailed: () -> Unit) {
    val generation = ++soundGeneration
    val candidates = AlarmPyoAlarmSoundStore.playbackCandidates(applicationContext)
    startSoundCandidate(generation, candidates, 0, onStarted, onFailed)
  }

  private fun startSoundCandidate(
    generation: Int,
    candidates: List<Uri>,
    index: Int,
    onStarted: () -> Unit,
    onFailed: () -> Unit
  ) {
    if (generation != soundGeneration) return
    if (index >= candidates.size) {
      startFallbackTone(generation, onStarted, onFailed)
      return
    }

    val player = MediaPlayer()
    try {
      player.apply {
        setAudioAttributes(audioAttributes)
        setDataSource(applicationContext, candidates[index])
        isLooping = true
        setOnPreparedListener { prepared ->
          if (generation != soundGeneration || mediaPlayer !== prepared) {
            runCatching { prepared.release() }
            return@setOnPreparedListener
          }
          runCatching { prepared.start() }.onSuccess {
            // start() 반환 직후 발생하는 비동기 디코더 오류를 성공으로 오인하지
            // 않도록 짧게 재생 상태를 확인한 뒤에만 계획을 완료 처리합니다.
            handler.postDelayed({
              if (generation != soundGeneration || mediaPlayer !== prepared) return@postDelayed
              val audible = runCatching { prepared.isPlaying }.getOrDefault(false)
              if (audible) {
                onStarted()
              } else {
                if (mediaPlayer === prepared) mediaPlayer = null
                runCatching { prepared.release() }
                startSoundCandidate(
                  generation,
                  candidates,
                  index + 1,
                  onStarted,
                  onFailed
                )
              }
            }, MEDIA_PLAYBACK_CONFIRM_MILLIS)
          }.onFailure {
            if (mediaPlayer === prepared) mediaPlayer = null
            runCatching { prepared.release() }
            startSoundCandidate(generation, candidates, index + 1, onStarted, onFailed)
          }
        }
        setOnErrorListener { failedPlayer, _, _ ->
          if (mediaPlayer === failedPlayer) mediaPlayer = null
          runCatching { failedPlayer.release() }
          startSoundCandidate(generation, candidates, index + 1, onStarted, onFailed)
          true
        }
      }
      mediaPlayer = player
      player.prepareAsync()
    } catch (error: Throwable) {
      if (mediaPlayer === player) mediaPlayer = null
      runCatching { player.release() }
      Log.w(TAG, "알람 음원 ${index + 1}번을 열지 못해 다음 음원을 시도합니다.", error)
      startSoundCandidate(generation, candidates, index + 1, onStarted, onFailed)
    }
  }

  private fun startFallbackTone(
    generation: Int,
    onStarted: () -> Unit,
    onFailed: () -> Unit
  ) {
    if (generation != soundGeneration) return
    val generator = runCatching {
      ToneGenerator(AudioManager.STREAM_ALARM, ToneGenerator.MAX_VOLUME)
    }.getOrElse {
      onFailed()
      return
    }
    toneGenerator = generator

    val firstStarted = runCatching {
      generator.startTone(ToneGenerator.TONE_CDMA_ALERT_CALL_GUARD, FALLBACK_TONE_DURATION_MILLIS)
    }.getOrDefault(false)
    if (!firstStarted) {
      toneGenerator = null
      runCatching { generator.release() }
      onFailed()
      return
    }
    handler.postDelayed({
      if (generation == soundGeneration && toneGenerator === generator) onStarted()
    }, FALLBACK_TONE_CONFIRM_MILLIS)

    val repeater = object : Runnable {
      override fun run() {
        if (generation != soundGeneration || toneGenerator !== generator) return
        runCatching {
          generator.startTone(
            ToneGenerator.TONE_CDMA_ALERT_CALL_GUARD,
            FALLBACK_TONE_DURATION_MILLIS
          )
        }
        handler.postDelayed(this, FALLBACK_TONE_REPEAT_MILLIS)
      }
    }
    handler.postDelayed(repeater, FALLBACK_TONE_REPEAT_MILLIS)
  }

  private fun startVibration() {
    val pattern = longArrayOf(0L, 700L, 300L, 700L, 800L)
    val vibrator = vibrator()
    if (!vibrator.hasVibrator()) return
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      val effect = VibrationEffect.createWaveform(pattern, 0)
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
        vibrator.vibrate(
          effect,
          VibrationAttributes.createForUsage(VibrationAttributes.USAGE_ALARM)
        )
      } else {
        @Suppress("DEPRECATION")
        vibrator.vibrate(effect, audioAttributes)
      }
    } else {
      @Suppress("DEPRECATION")
      vibrator.vibrate(pattern, 0)
    }
  }

  private fun vibrator(): Vibrator = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
    (getSystemService(Context.VIBRATOR_MANAGER_SERVICE) as VibratorManager).defaultVibrator
  } else {
    @Suppress("DEPRECATION")
    getSystemService(Context.VIBRATOR_SERVICE) as Vibrator
  }

  private companion object {
    const val TAG = "AlarmPyoAlarmService"
    val SOUND_START_TIMEOUT_MILLIS: Long = TimeUnit.SECONDS.toMillis(12)
    const val MAX_DELIVERY_COMMIT_ATTEMPTS = 3
    const val MEDIA_PLAYBACK_CONFIRM_MILLIS = 750L
    const val FALLBACK_TONE_CONFIRM_MILLIS = 300L
    const val FALLBACK_TONE_DURATION_MILLIS = 1_000
    const val FALLBACK_TONE_REPEAT_MILLIS = 1_500L
  }
}
