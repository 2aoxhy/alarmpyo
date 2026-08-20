package expo.modules.alarmpyoalarm

import android.content.ClipData
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.pm.PackageInfo
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.provider.Settings
import androidx.core.content.FileProvider
import java.io.File
import java.io.FileInputStream
import java.security.MessageDigest

// 직접 배포 소스 세트에서만 컴파일해요.
internal object AlarmPyoApkInstaller {
  private const val MIME_APK = "application/vnd.android.package-archive"
  private const val MIN_APK_BYTES = 1024L * 1024L
  private const val MAX_APK_BYTES = 350L * 1024L * 1024L
  private val SHA256_PATTERN = Regex("^[0-9a-fA-F]{64}$")

  private data class VerifiedApk(
    val file: File,
    val versionCode: Long,
    val sha256: String
  )

  fun appInfo(context: Context): Map<String, Any> {
    val packageInfo = installedPackageInfo(context)
    return mapOf(
      "supported" to true,
      "packageName" to context.packageName,
      "versionName" to (packageInfo.versionName ?: ""),
      "versionCode" to longVersionCode(packageInfo).toDouble(),
      "installPermissionAllowed" to installPermissionAllowed(context)
    )
  }

  fun openInstallPermissionSettings(context: Context): Boolean {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O || installPermissionAllowed(context)) {
      return true
    }
    val intent = Intent(
      Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
      Uri.parse("package:${context.packageName}")
    ).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    context.startActivity(intent)
    return false
  }

  fun verify(
    context: Context,
    fileUri: String,
    expectedSha256: String,
    expectedVersionCode: Long
  ): Map<String, Any> {
    val verified = verifyFile(context, fileUri, expectedSha256, expectedVersionCode)
    return mapOf(
      "valid" to true,
      "versionCode" to verified.versionCode.toDouble(),
      "sha256" to verified.sha256
    )
  }

  fun verifyAndOpen(
    context: Context,
    fileUri: String,
    expectedSha256: String,
    expectedVersionCode: Long
  ): Map<String, Any> {
    val verified = verifyFile(context, fileUri, expectedSha256, expectedVersionCode)
    val apkFile = verified.file
    val archiveVersionCode = verified.versionCode
    val actualSha256 = verified.sha256

    if (!installPermissionAllowed(context)) {
      openInstallPermissionSettings(context)
      return mapOf(
        "opened" to false,
        "permissionRequired" to true,
        "versionCode" to archiveVersionCode.toDouble(),
        "sha256" to actualSha256
      )
    }

    val contentUri = FileProvider.getUriForFile(
      context,
      "${context.packageName}.alarmpyo-updates",
      apkFile
    )
    val intent = Intent(Intent.ACTION_VIEW).apply {
      setDataAndType(contentUri, MIME_APK)
      clipData = ClipData.newRawUri("AlarmPyo 업데이트", contentUri)
      addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
    }
    check(openPackageInstaller(context, contentUri, intent)) {
      "APK 설치 화면을 열 수 없습니다. 파일 앱에서 다운로드한 APK를 선택해야 합니다."
    }
    return mapOf(
      "opened" to true,
      "permissionRequired" to false,
      "versionCode" to archiveVersionCode.toDouble(),
      "sha256" to actualSha256
    )
  }

  @Suppress("DEPRECATION")
  private fun openPackageInstaller(
    context: Context,
    contentUri: Uri,
    fallbackViewIntent: Intent
  ): Boolean {
    val installIntent = Intent(AlarmPyoApkInstallIntentPolicy.ACTION_INSTALL_PACKAGE).apply {
      setDataAndType(contentUri, MIME_APK)
      clipData = ClipData.newRawUri("AlarmPyo 업데이트", contentUri)
      addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
      putExtra(Intent.EXTRA_NOT_UNKNOWN_SOURCE, true)
      putExtra(Intent.EXTRA_RETURN_RESULT, false)
    }
    val candidates = listOf(installIntent, fallbackViewIntent)
    val packageManager = context.packageManager

    candidates.forEach { candidate ->
      val handlers = packageManager.queryIntentActivities(
        candidate,
        PackageManager.MATCH_DEFAULT_ONLY
      )
      handlers.forEach { handler ->
        val activityInfo = handler.activityInfo ?: return@forEach
        val explicitIntent = Intent(candidate).apply {
          component = ComponentName(activityInfo.packageName, activityInfo.name)
        }
        val opened = runCatching {
          context.grantUriPermission(
            activityInfo.packageName,
            contentUri,
            Intent.FLAG_GRANT_READ_URI_PERMISSION
          )
          context.startActivity(explicitIntent)
          true
        }.getOrDefault(false)
        if (opened) return true
      }

      val openedImplicitly = runCatching {
        if (candidate.resolveActivity(packageManager) == null) return@runCatching false
        context.startActivity(candidate)
        true
      }.getOrDefault(false)
      if (openedImplicitly) return true
    }
    return false
  }

  private fun verifyFile(
    context: Context,
    fileUri: String,
    expectedSha256: String,
    expectedVersionCode: Long
  ): VerifiedApk {
    require(SHA256_PATTERN.matches(expectedSha256)) {
      "APK 검증값이 올바르지 않습니다."
    }
    require(expectedVersionCode > 0L) {
      "APK 버전 정보가 올바르지 않습니다."
    }

    val apkFile = resolveUpdateFile(context, fileUri)
    require(apkFile.isFile) { "다운로드한 APK 파일을 찾을 수 없습니다." }
    require(apkFile.length() in MIN_APK_BYTES..MAX_APK_BYTES) {
      "다운로드한 APK 파일 크기가 올바르지 않습니다."
    }

    val actualSha256 = sha256(apkFile)
    require(actualSha256.equals(expectedSha256, ignoreCase = true)) {
      apkFile.delete()
      "APK 파일이 손상되었거나 검증값이 일치하지 않습니다."
    }

    val archiveInfo = archivePackageInfo(context, apkFile)
      ?: run {
        apkFile.delete()
        error("APK 설치 정보를 읽을 수 없습니다.")
      }
    require(archiveInfo.packageName == context.packageName) {
      apkFile.delete()
      "다른 앱의 설치 파일은 사용할 수 없습니다."
    }
    val archiveVersionCode = longVersionCode(archiveInfo)
    require(archiveVersionCode == expectedVersionCode) {
      apkFile.delete()
      "APK 버전이 최신 배포 정보와 일치하지 않습니다."
    }

    val installedInfo = installedPackageInfo(context)
    val installedVersionCode = longVersionCode(installedInfo)
    require(archiveVersionCode > installedVersionCode) {
      apkFile.delete()
      "현재 앱보다 최신인 APK만 설치할 수 있습니다."
    }
    val archiveSigners = signingCertificateDigests(archiveInfo)
    val installedSigners = signingCertificateDigests(installedInfo)
    require(
      installedSigners.isNotEmpty() &&
        archiveSigners.isNotEmpty() &&
        installedSigners.intersect(archiveSigners).isNotEmpty()
    ) {
      apkFile.delete()
      "APK 서명이 현재 앱과 일치하지 않습니다."
    }

    return VerifiedApk(apkFile, archiveVersionCode, actualSha256)
  }

  private fun installPermissionAllowed(context: Context): Boolean =
    Build.VERSION.SDK_INT < Build.VERSION_CODES.O ||
      context.packageManager.canRequestPackageInstalls()

  private fun resolveUpdateFile(context: Context, fileUri: String): File {
    val uri = Uri.parse(fileUri)
    require(uri.scheme == "file") { "APK 파일 경로가 올바르지 않습니다." }
    val candidate = File(requireNotNull(uri.path)).canonicalFile
    val updateRoot = File(context.cacheDir, "alarmpyo-updates").canonicalFile
    require(candidate.path.startsWith("${updateRoot.path}${File.separator}")) {
      "허용되지 않은 APK 파일 경로입니다."
    }
    require(candidate.extension.equals("apk", ignoreCase = true)) {
      "APK 파일만 설치할 수 있습니다."
    }
    return candidate
  }

  private fun sha256(file: File): String {
    val digest = MessageDigest.getInstance("SHA-256")
    FileInputStream(file).use { input ->
      val buffer = ByteArray(DEFAULT_BUFFER_SIZE)
      while (true) {
        val count = input.read(buffer)
        if (count < 0) break
        digest.update(buffer, 0, count)
      }
    }
    return digest.digest().joinToString("") { byte -> "%02x".format(byte) }
  }

  @Suppress("DEPRECATION")
  private fun installedPackageInfo(context: Context): PackageInfo =
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
      context.packageManager.getPackageInfo(
        context.packageName,
        PackageManager.PackageInfoFlags.of(PackageManager.GET_SIGNING_CERTIFICATES.toLong())
      )
    } else {
      val flags = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
        PackageManager.GET_SIGNING_CERTIFICATES
      } else {
        PackageManager.GET_SIGNATURES
      }
      context.packageManager.getPackageInfo(context.packageName, flags)
    }

  @Suppress("DEPRECATION")
  private fun archivePackageInfo(context: Context, file: File): PackageInfo? =
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
      context.packageManager.getPackageArchiveInfo(
        file.path,
        PackageManager.PackageInfoFlags.of(PackageManager.GET_SIGNING_CERTIFICATES.toLong())
      )
    } else {
      val flags = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
        PackageManager.GET_SIGNING_CERTIFICATES
      } else {
        PackageManager.GET_SIGNATURES
      }
      context.packageManager.getPackageArchiveInfo(file.path, flags)
    }

  @Suppress("DEPRECATION")
  private fun longVersionCode(info: PackageInfo): Long =
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) info.longVersionCode
    else info.versionCode.toLong()

  @Suppress("DEPRECATION")
  private fun signingCertificateDigests(info: PackageInfo): Set<String> {
    val signatures = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
      val signingInfo = info.signingInfo ?: return emptySet()
      if (signingInfo.hasMultipleSigners()) {
        signingInfo.apkContentsSigners
      } else {
        signingInfo.signingCertificateHistory
      }
    } else {
      info.signatures ?: emptyArray()
    }
    return signatures.map { signature ->
      MessageDigest.getInstance("SHA-256")
        .digest(signature.toByteArray())
        .joinToString("") { byte -> "%02x".format(byte) }
    }.toSet()
  }
}
