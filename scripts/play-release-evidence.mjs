export const PLAY_RELEASE_EVIDENCE_MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;
export const REQUIRED_PLAY_PHYSICAL_CHECKS = Object.freeze([
  'playInstallAndLaunch',
  'directApkUpgrade',
  'dataPreserved',
  'permissionsPreserved',
  'alarmWhileClosed',
  'alarmAfterReboot',
  'timerWhileClosed',
  'timerAfterReboot',
  'timerSoundAndVibration',
  'timeAndTimezoneRecovery',
  'notificationDeniedState',
  'exactAlarm',
  'fullScreenAlarm',
  'foregroundAlarmAudio',
  'widgetAvailable',
]);
export const PLAY_DIRECT_UPGRADE_CHECKS = Object.freeze([
  'directApkUpgrade',
  'dataPreserved',
  'permissionsPreserved',
]);
export const REQUIRED_PLAY_16KB_CHECKS = Object.freeze([
  'installAndLaunch',
  'coreScheduleFlow',
  'alarmWhileClosed',
  'alarmAfterReboot',
  'timerWhileClosed',
  'timerAfterReboot',
  'fullScreenAlarm',
  'widgetAvailable',
]);

const SHA256_PATTERN = /^[0-9a-f]{64}$/u;
const GIT_COMMIT_PATTERN = /^[0-9a-f]{40}$/u;
const EAS_BUILD_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const CLOCK_SKEW_MS = 5 * 60 * 1000;

function ensure(condition, message) {
  if (!condition) throw new Error(message);
}

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function timestamp(value, label) {
  const parsed = typeof value === 'string' ? Date.parse(value) : Number.NaN;
  ensure(Number.isFinite(parsed), `${label}이 올바른 ISO 날짜가 아니에요.`);
  return parsed;
}

function normalizeSha256(value, label) {
  const normalized = typeof value === 'string' ? value.toLowerCase() : '';
  ensure(SHA256_PATTERN.test(normalized), `${label}이 올바른 SHA-256이 아니에요.`);
  return normalized;
}

function assertArtifactBinding(evidence, artifact, label) {
  for (const [evidenceField, artifactField, fieldLabel] of [
    ['packageName', 'packageName', '패키지 이름'],
    ['versionName', 'versionName', '버전 이름'],
    ['versionCode', 'versionCode', 'version 코드'],
    ['aabSha256', 'sha256', 'AAB SHA-256'],
    ['sourceCommit', 'sourceCommit', '소스 커밋'],
    ['easBuildId', 'easBuildId', 'EAS 빌드 ID'],
  ]) {
    ensure(
      evidence?.[evidenceField] === artifact?.[artifactField],
      `${label}의 ${fieldLabel}이 AAB 출처 기록과 달라요.`,
    );
  }
}

function assertAfterBuild(value, artifact, label, upperBound) {
  const checkedAt = timestamp(value, label);
  const buildFinishedAt = timestamp(
    artifact.easBuildFinishedAt,
    'EAS AAB 빌드 완료 시각',
  );
  ensure(
    checkedAt + CLOCK_SKEW_MS >= buildFinishedAt,
    `${label}이 EAS AAB 빌드보다 빨라요.`,
  );
  ensure(
    checkedAt <= upperBound + CLOCK_SKEW_MS,
    `${label}이 전체 증거 완료 시각보다 늦어요.`,
  );
  return checkedAt;
}

function assertChecks(value, required, label) {
  ensure(isRecord(value), `${label} 검사 결과가 없어요.`);
  for (const check of required) {
    ensure(value[check] === true, `${label}의 ${check} 검사가 통과하지 않았어요.`);
  }
}

function assertPhysicalEvidence(
  value,
  releaseEvidence,
  artifact,
  checkedAt,
  directUpgradeCompatible,
) {
  ensure(
    value?.schemaVersion === 1 &&
      value?.evidenceType === 'play-physical-device' &&
      value?.captureMethod === 'adb-and-play-console',
    'Play Samsung 실기기 증거 형식이 올바르지 않아요.',
  );
  assertArtifactBinding(value, artifact, 'Play Samsung 실기기 증거');
  assertAfterBuild(value.checkedAt, artifact, 'Play Samsung 실기기 검사 시각', checkedAt);
  const device = value.device;
  ensure(
    isRecord(device) &&
      device.deviceType === 'physical' &&
      device.currentSamsungDevice === true &&
      /samsung/iu.test(device.manufacturer ?? '') &&
      typeof device.model === 'string' &&
      device.model.trim().length >= 2 &&
      Number.isInteger(device.sdk) &&
      device.sdk >= 31 &&
      typeof device.buildFingerprint === 'string' &&
      device.buildFingerprint.trim().length >= 2,
    '현재 Samsung 실기기 정보를 증거에 기록해야 해요.',
  );
  ensure(
    device.installerPackageName === 'com.android.vending',
    'Samsung 실기기 앱은 Play 내부 또는 비공개 트랙에서 설치해야 해요.',
  );
  ensure(
    normalizeSha256(
      device.signingCertificateSha256,
      'Samsung 실기기 APK 서명 인증서',
    ) ===
      normalizeSha256(
        releaseEvidence.appSigningCertificateSha256,
        'Play 앱 서명 인증서',
      ),
    'Samsung 실기기 APK 서명 인증서가 Play 앱 서명 인증서와 달라요.',
  );
  assertChecks(
    value.checks,
    REQUIRED_PLAY_PHYSICAL_CHECKS.filter(
      (check) => !PLAY_DIRECT_UPGRADE_CHECKS.includes(check),
    ),
    'Play Samsung 실기기',
  );
  if (directUpgradeCompatible) {
    assertChecks(
      value.checks,
      PLAY_DIRECT_UPGRADE_CHECKS,
      'Play Samsung direct 업데이트',
    );
  } else {
    for (const check of PLAY_DIRECT_UPGRADE_CHECKS) {
      ensure(
        value.checks?.[check] === false,
        `별도 Play 서명 계보에서는 ${check} 검사를 false로 기록해 주세요.`,
      );
    }
  }
}

function assert16KbEvidence(value, releaseEvidence, artifact, checkedAt) {
  ensure(
    value?.schemaVersion === 1 &&
      value?.evidenceType === 'play-16kb-device' &&
      value?.captureMethod === 'adb-and-play-console',
    'Play 16KB 기기 증거 형식이 올바르지 않아요.',
  );
  assertArtifactBinding(value, artifact, 'Play 16KB 기기 증거');
  assertAfterBuild(value.checkedAt, artifact, 'Play 16KB 기기 검사 시각', checkedAt);
  const device = value.device;
  ensure(
    isRecord(device) &&
      ['physical', 'emulator'].includes(device.deviceType) &&
      Number.isInteger(device.sdk) &&
      device.sdk >= 35 &&
      device.pageSizeBytes === 16384 &&
      typeof device.buildFingerprint === 'string' &&
      device.buildFingerprint.trim().length >= 2,
    'Android 15 이상의 16KB page size 기기 정보를 기록해야 해요.',
  );
  const delivery = value.delivery;
  ensure(
    isRecord(delivery) &&
      delivery.source === 'play-app-bundle-explorer' &&
      delivery.splitApks === true &&
      delivery.zipalign16Kb === true &&
      delivery.elfLoadSegments16Kb === true,
    'App Bundle Explorer split APK의 ZIP·ELF 16KB 검증이 모두 필요해요.',
  );
  ensure(
    normalizeSha256(
      delivery.signingCertificateSha256,
      '16KB split APK 서명 인증서',
    ) ===
      normalizeSha256(
        releaseEvidence.appSigningCertificateSha256,
        'Play 앱 서명 인증서',
      ),
    '16KB split APK 서명 인증서가 Play 앱 서명 인증서와 달라요.',
  );
  assertChecks(value.checks, REQUIRED_PLAY_16KB_CHECKS, 'Play 16KB 기기');
}

function assertPreLaunchEvidence(value, artifact, checkedAt) {
  ensure(
    value?.schemaVersion === 1 &&
      value?.evidenceType === 'play-pre-launch-report' &&
      value?.captureMethod === 'play-console' &&
      value?.status === 'completed',
    'Play 사전 출시 보고서 증거 형식이나 상태가 올바르지 않아요.',
  );
  assertArtifactBinding(value, artifact, 'Play 사전 출시 보고서');
  assertAfterBuild(value.completedAt, artifact, 'Play 사전 출시 보고서 완료 시각', checkedAt);
  for (const category of [
    'stability',
    'compatibility',
    'performance',
    'accessibility',
  ]) {
    ensure(
      value.categories?.[category]?.blockingIssueCount === 0,
      `Play 사전 출시 보고서의 ${category} 차단 문제가 남아 있어요.`,
    );
  }
}

/** Play Console과 ADB에서 수집한 최종 출고 증거를 검증된 AAB에 묶어요. */
export function assertPlayReleaseEvidence(
  releaseEvidence,
  artifact,
  playPolicy,
  rawEvidence,
  options = {},
) {
  ensure(isRecord(releaseEvidence), 'Play 릴리스 증거가 객체가 아니에요.');
  ensure(releaseEvidence.schemaVersion === 1, 'Play 릴리스 증거는 schemaVersion 1이어야 해요.');
  ensure(artifact?.artifactType === 'android-app-bundle', '검증된 AAB 출처 기록이 아니에요.');
  ensure(
    artifact?.distribution === 'play' &&
      artifact?.signed === true &&
      artifact?.sourceDirty === false,
    '깨끗한 소스에서 서명·검증된 Play AAB 출처 기록이 아니에요.',
  );
  ensure(
    artifact?.releasePurpose === 'play-release' &&
      artifact?.submissionEligible === true,
    'Play 서명 부트스트랩 AAB 출처는 릴리스·제출 증거로 사용할 수 없어요.',
  );
  ensure(
    artifact?.pageAlignment === 'PAGE_ALIGNMENT_16K',
    'AAB가 PAGE_ALIGNMENT_16K 검증을 통과하지 않았어요.',
  );
  ensure(SHA256_PATTERN.test(artifact?.sha256 ?? ''), 'AAB SHA-256이 올바르지 않아요.');
  ensure(GIT_COMMIT_PATTERN.test(artifact?.sourceCommit ?? ''), 'AAB 소스 커밋이 올바르지 않아요.');
  ensure(EAS_BUILD_ID_PATTERN.test(artifact?.easBuildId ?? ''), 'AAB EAS 빌드 ID가 올바르지 않아요.');
  assertArtifactBinding(releaseEvidence, artifact, 'Play 릴리스 증거');

  const trustedSigner = playPolicy?.appSigningCertificateSha256;
  const appSigningCertificateSha256 = normalizeSha256(
    releaseEvidence.appSigningCertificateSha256,
    'Play 앱 서명 인증서',
  );
  ensure(
    typeof trustedSigner === 'string' &&
      trustedSigner.toLowerCase() === appSigningCertificateSha256,
    'Play 앱 서명 인증서가 Play 배포 정책 인증서와 일치하지 않아요.',
  );
  ensure(
    ['internal', 'closed'].includes(releaseEvidence.track),
    'Play 릴리스 증거는 internal 또는 closed 트랙에서 먼저 수집해야 해요.',
  );

  for (const [field, label] of [
    ['highestPreviouslyDistributedVersionCode', '실제 유통 최고 versionCode'],
    [
      'highestExistingPlayVersionCode',
      '후보 업로드 전 Play Console 최고 versionCode',
    ],
  ]) {
    ensure(
      Number.isInteger(releaseEvidence[field]) && releaseEvidence[field] >= 0,
      `${label}를 0 이상의 정수로 기록해 주세요.`,
    );
    ensure(
      artifact.versionCode > releaseEvidence[field],
      `AAB versionCode ${artifact.versionCode}가 ${label} ${releaseEvidence[field]}보다 커야 해요.`,
    );
  }

  const checkedAt = timestamp(releaseEvidence.checkedAt, 'Play 릴리스 증거 완료 시각');
  const now = options.now ?? Date.now();
  ensure(checkedAt <= now + CLOCK_SKEW_MS, 'Play 릴리스 증거 완료 시각이 미래예요.');
  ensure(
    now - checkedAt <= PLAY_RELEASE_EVIDENCE_MAX_AGE_MS,
    'Play 릴리스 증거가 14일보다 오래됐어요.',
  );

  const directUpgradeCompatible =
    playPolicy.directUpgradeCompatible !== false;
  assertPhysicalEvidence(
    rawEvidence.physicalDevice,
    releaseEvidence,
    artifact,
    checkedAt,
    directUpgradeCompatible,
  );
  assert16KbEvidence(rawEvidence.pageSize16KbDevice, releaseEvidence, artifact, checkedAt);
  assertPreLaunchEvidence(rawEvidence.preLaunchReport, artifact, checkedAt);

  return {
    aabSha256: artifact.sha256,
    sourceCommit: artifact.sourceCommit,
    easBuildId: artifact.easBuildId,
    versionCode: artifact.versionCode,
    appSigningCertificateSha256,
    directUpgradeCompatible,
    checkedAt: new Date(checkedAt).toISOString(),
  };
}
