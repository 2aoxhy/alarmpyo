package expo.modules.alarmpyoalarm

import android.app.Activity
import android.content.Context
import android.os.Build
import com.google.android.play.core.appupdate.AppUpdateInfo
import com.google.android.play.core.appupdate.AppUpdateManagerFactory
import com.google.android.play.core.appupdate.AppUpdateOptions
import com.google.android.play.core.install.InstallException
import com.google.android.play.core.install.model.AppUpdateType
import com.google.android.play.core.install.model.InstallStatus
import com.google.android.play.core.install.model.UpdateAvailability
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.ModuleDefinitionBuilder

/** Google Play 빌드에서만 공식 Play Core flexible update API를 등록합니다. */
internal fun ModuleDefinitionBuilder.registerAlarmPyoDistributionApi(
  contextProvider: () -> Context,
  activityProvider: () -> Activity?
) {
  AsyncFunction("getPlayUpdateStatusAsync") { promise: Promise ->
    AlarmPyoPlayUpdateBridge.getStatus(contextProvider(), promise)
  }

  AsyncFunction("startPlayUpdateAsync") { promise: Promise ->
    AlarmPyoPlayUpdateBridge.start(contextProvider(), activityProvider(), promise)
  }

  AsyncFunction("completePlayUpdateAsync") { promise: Promise ->
    AlarmPyoPlayUpdateBridge.complete(contextProvider(), promise)
  }
}

private object AlarmPyoPlayUpdateBridge {
  private const val PLAY_STORE_PACKAGE = "com.android.vending"
  private const val ERROR_UNKNOWN = -1
  private const val ERROR_ACTIVITY_UNAVAILABLE = -2

  fun getStatus(context: Context, promise: Promise) {
    val appContext = context.applicationContext
    if (!isPlayInstall(appContext)) {
      promise.resolve(AlarmPyoPlayUpdateStatus.unsupported().toMap())
      return
    }
    val manager = runCatching { AppUpdateManagerFactory.create(appContext) }
      .getOrElse { error ->
        promise.resolve(failureStatus(error).toMap())
        return
      }
    manager.appUpdateInfo
      .addOnSuccessListener { info -> promise.resolve(info.toStatus().toMap()) }
      .addOnFailureListener { error -> promise.resolve(failureStatus(error).toMap()) }
  }

  fun start(context: Context, activity: Activity?, promise: Promise) {
    val appContext = context.applicationContext
    if (!isPlayInstall(appContext)) {
      promise.resolve(AlarmPyoPlayUpdateStartResult.unsupported().toMap())
      return
    }
    if (activity == null || activity.isFinishing || activity.isDestroyed) {
      promise.resolve(
        AlarmPyoPlayUpdateStartResult(
          started = false,
          resultCode = 0,
          status = failureStatus(ERROR_ACTIVITY_UNAVAILABLE)
        ).toMap()
      )
      return
    }

    val manager = runCatching { AppUpdateManagerFactory.create(appContext) }
      .getOrElse { error ->
        promise.resolve(
          AlarmPyoPlayUpdateStartResult(false, 0, failureStatus(error)).toMap()
        )
        return
      }
    manager.appUpdateInfo
      .addOnSuccessListener { info ->
        val status = info.toStatus()
        if (!status.updateAvailable || !status.flexibleAllowed) {
          promise.resolve(AlarmPyoPlayUpdateStartResult(false, 0, status).toMap())
          return@addOnSuccessListener
        }
        val flow = runCatching {
          manager.startUpdateFlow(
            info,
            activity,
            AppUpdateOptions.defaultOptions(AppUpdateType.FLEXIBLE)
          )
        }.getOrElse { error ->
          promise.resolve(
            AlarmPyoPlayUpdateStartResult(false, 0, failureStatus(error)).toMap()
          )
          return@addOnSuccessListener
        }
        flow.addOnSuccessListener { resultCode ->
          val started = resultCode == Activity.RESULT_OK
          val nextStatus = when {
            started -> status.copy(
              installStatus = AlarmPyoPlayUpdateInstallStatus.PENDING,
              errorCode = 0
            )
            resultCode == Activity.RESULT_CANCELED -> status
            else -> status.copy(
              installStatus = AlarmPyoPlayUpdateInstallStatus.FAILED,
              errorCode = resultCode
            )
          }
          promise.resolve(
            AlarmPyoPlayUpdateStartResult(
              started = started,
              resultCode = resultCode,
              status = nextStatus
            ).toMap()
          )
        }.addOnFailureListener { error ->
          promise.resolve(
            AlarmPyoPlayUpdateStartResult(false, 0, failureStatus(error)).toMap()
          )
        }
      }
      .addOnFailureListener { error ->
        promise.resolve(
          AlarmPyoPlayUpdateStartResult(false, 0, failureStatus(error)).toMap()
        )
      }
  }

  fun complete(context: Context, promise: Promise) {
    val appContext = context.applicationContext
    if (!isPlayInstall(appContext)) {
      promise.resolve(AlarmPyoPlayUpdateCompleteResult.unsupported().toMap())
      return
    }
    val manager = runCatching { AppUpdateManagerFactory.create(appContext) }
      .getOrElse { error ->
        promise.resolve(
          AlarmPyoPlayUpdateCompleteResult(false, failureStatus(error)).toMap()
        )
        return
      }
    manager.appUpdateInfo
      .addOnSuccessListener { info ->
        val status = info.toStatus()
        if (status.installStatus != AlarmPyoPlayUpdateInstallStatus.DOWNLOADED) {
          promise.resolve(AlarmPyoPlayUpdateCompleteResult(false, status).toMap())
          return@addOnSuccessListener
        }
        val completion = runCatching { manager.completeUpdate() }
          .getOrElse { error ->
            promise.resolve(
              AlarmPyoPlayUpdateCompleteResult(false, failureStatus(error)).toMap()
            )
            return@addOnSuccessListener
          }
        completion.addOnSuccessListener {
            promise.resolve(
              AlarmPyoPlayUpdateCompleteResult(
                completed = true,
                status = status.copy(
                  installStatus = AlarmPyoPlayUpdateInstallStatus.INSTALLING,
                  errorCode = 0
                )
              ).toMap()
            )
          }
          .addOnFailureListener { error ->
            promise.resolve(
              AlarmPyoPlayUpdateCompleteResult(false, failureStatus(error)).toMap()
            )
          }
      }
      .addOnFailureListener { error ->
        promise.resolve(
          AlarmPyoPlayUpdateCompleteResult(false, failureStatus(error)).toMap()
        )
      }
  }

  private fun AppUpdateInfo.toStatus() = AlarmPyoPlayUpdateStatus(
    supported = true,
    updateAvailable = updateAvailability() == UpdateAvailability.UPDATE_AVAILABLE,
    flexibleAllowed = isUpdateTypeAllowed(AppUpdateType.FLEXIBLE),
    availableVersionCode = availableVersionCode(),
    installStatus = installStatus().toAlarmPyoStatus(),
    bytesDownloaded = bytesDownloaded().coerceAtLeast(0L),
    totalBytesToDownload = totalBytesToDownload().coerceAtLeast(0L),
    errorCode = 0
  )

  private fun Int.toAlarmPyoStatus(): AlarmPyoPlayUpdateInstallStatus = when (this) {
    InstallStatus.PENDING -> AlarmPyoPlayUpdateInstallStatus.PENDING
    InstallStatus.DOWNLOADING -> AlarmPyoPlayUpdateInstallStatus.DOWNLOADING
    InstallStatus.DOWNLOADED -> AlarmPyoPlayUpdateInstallStatus.DOWNLOADED
    InstallStatus.INSTALLING -> AlarmPyoPlayUpdateInstallStatus.INSTALLING
    InstallStatus.INSTALLED -> AlarmPyoPlayUpdateInstallStatus.INSTALLED
    InstallStatus.FAILED -> AlarmPyoPlayUpdateInstallStatus.FAILED
    InstallStatus.CANCELED -> AlarmPyoPlayUpdateInstallStatus.CANCELED
    else -> AlarmPyoPlayUpdateInstallStatus.UNKNOWN
  }

  private fun failureStatus(error: Throwable): AlarmPyoPlayUpdateStatus =
    failureStatus((error as? InstallException)?.errorCode ?: ERROR_UNKNOWN)

  private fun failureStatus(errorCode: Int) = AlarmPyoPlayUpdateStatus(
    supported = true,
    updateAvailable = false,
    flexibleAllowed = false,
    availableVersionCode = 0,
    installStatus = AlarmPyoPlayUpdateInstallStatus.FAILED,
    bytesDownloaded = 0L,
    totalBytesToDownload = 0L,
    errorCode = errorCode
  )

  @Suppress("DEPRECATION")
  private fun isPlayInstall(context: Context): Boolean = runCatching {
    val installer = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
      context.packageManager
        .getInstallSourceInfo(context.packageName)
        .installingPackageName
    } else {
      context.packageManager.getInstallerPackageName(context.packageName)
    }
    installer == PLAY_STORE_PACKAGE
  }.getOrDefault(false)
}
