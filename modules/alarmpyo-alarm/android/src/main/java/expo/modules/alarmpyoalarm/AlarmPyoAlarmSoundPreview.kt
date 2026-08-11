package expo.modules.alarmpyoalarm

import android.content.Context
import android.media.AudioAttributes
import android.media.MediaPlayer
import android.os.Handler
import android.os.Looper
import java.util.concurrent.atomic.AtomicBoolean

internal class AlarmPyoAlarmPreviewResult(
  private val callback: (Boolean) -> Unit
) {
  private val resolved = AtomicBoolean(false)

  fun resolve(started: Boolean): Boolean {
    if (!resolved.compareAndSet(false, true)) return false
    callback(started)
    return true
  }
}

internal object AlarmPyoAlarmSoundPreview {
  private const val PREVIEW_START_TIMEOUT_MILLIS = 5_000L
  private const val PREVIEW_DURATION_MILLIS = 10_000L
  private val handler = Handler(Looper.getMainLooper())
  private val audioAttributes = AudioAttributes.Builder()
    .setUsage(AudioAttributes.USAGE_ALARM)
    .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
    .build()

  @Volatile private var mediaPlayer: MediaPlayer? = null
  @Volatile private var generation = 0
  @Volatile private var previewRequested = false
  private var pendingResult: AlarmPyoAlarmPreviewResult? = null

  fun start(context: Context, onResult: (Boolean) -> Unit) {
    val candidates = AlarmPyoAlarmSoundStore.playbackCandidates(context)
    val nextResult = AlarmPyoAlarmPreviewResult(onResult)
    val previousResult: AlarmPyoAlarmPreviewResult?
    val activeGeneration: Int
    synchronized(this) {
      previousResult = pendingResult
      pendingResult = null
      activeGeneration = ++generation
      previewRequested = candidates.isNotEmpty()
      if (candidates.isNotEmpty()) pendingResult = nextResult
    }
    previousResult?.resolve(false)
    if (candidates.isEmpty()) {
      nextResult.resolve(false)
      return
    }
    handler.post {
      releasePlayer()
      startCandidate(context.applicationContext, candidates, 0, activeGeneration)
    }
    handler.postDelayed(
      { failTimedOutStart(activeGeneration) },
      PREVIEW_START_TIMEOUT_MILLIS
    )
  }

  fun stop(): Boolean {
    val pending: AlarmPyoAlarmPreviewResult?
    val wasRequested: Boolean
    synchronized(this) {
      wasRequested = previewRequested || mediaPlayer != null || pendingResult != null
      generation += 1
      previewRequested = false
      pending = pendingResult
      pendingResult = null
    }
    pending?.resolve(false)
    handler.removeCallbacksAndMessages(null)
    if (Looper.myLooper() == Looper.getMainLooper()) {
      releasePlayer()
    } else {
      handler.post(::releasePlayer)
    }
    return wasRequested
  }

  private fun startCandidate(
    context: Context,
    candidates: List<android.net.Uri>,
    index: Int,
    activeGeneration: Int
  ) {
    if (activeGeneration != generation) return
    if (index >= candidates.size) {
      finishAttempt(activeGeneration, started = false)
      return
    }
    val player = MediaPlayer()
    try {
      player.apply {
        setAudioAttributes(audioAttributes)
        setDataSource(context, candidates[index])
        isLooping = true
        setOnPreparedListener { prepared ->
          if (activeGeneration != generation || mediaPlayer !== prepared) {
            runCatching { prepared.release() }
            return@setOnPreparedListener
          }
          runCatching { prepared.start() }.onSuccess {
            finishAttempt(activeGeneration, started = true)
            handler.postDelayed({
              if (activeGeneration == generation) stop()
            }, PREVIEW_DURATION_MILLIS)
          }.onFailure {
            failCandidate(context, candidates, index, activeGeneration, prepared)
          }
        }
        setOnErrorListener { failed, _, _ ->
          failCandidate(context, candidates, index, activeGeneration, failed)
          true
        }
      }
      mediaPlayer = player
      player.prepareAsync()
    } catch (_: Throwable) {
      if (mediaPlayer === player) mediaPlayer = null
      runCatching { player.release() }
      startCandidate(context, candidates, index + 1, activeGeneration)
    }
  }

  private fun failCandidate(
    context: Context,
    candidates: List<android.net.Uri>,
    index: Int,
    activeGeneration: Int,
    failed: MediaPlayer
  ) {
    if (activeGeneration != generation || mediaPlayer !== failed) return
    mediaPlayer = null
    runCatching { failed.release() }
    startCandidate(context, candidates, index + 1, activeGeneration)
  }

  private fun finishAttempt(activeGeneration: Int, started: Boolean) {
    val result = synchronized(this) {
      if (activeGeneration != generation) return
      if (!started) previewRequested = false
      pendingResult.also { pendingResult = null }
    }
    result?.resolve(started)
  }

  private fun failTimedOutStart(activeGeneration: Int) {
    val result = synchronized(this) {
      if (activeGeneration != generation || pendingResult == null) return
      generation += 1
      previewRequested = false
      pendingResult.also { pendingResult = null }
    }
    releasePlayer()
    result?.resolve(false)
  }

  private fun releasePlayer() {
    val player = mediaPlayer
    mediaPlayer = null
    player?.let {
      runCatching { if (it.isPlaying) it.stop() }
      runCatching { it.reset() }
      runCatching { it.release() }
    }
  }
}
