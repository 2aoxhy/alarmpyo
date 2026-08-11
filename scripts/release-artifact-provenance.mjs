import { createProjectHashAsync } from '@expo/fingerprint';

export const SHA256_PATTERN = /^[0-9a-f]{64}$/iu;
export const GIT_COMMIT_PATTERN = /^[0-9a-f]{40}$/iu;
export const EAS_BUILD_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
export const REQUIRED_ANDROID_EMULATOR_SDKS = [31, 33, 34, 35, 36];
export const REQUIRED_ANDROID_PHYSICAL_CHECKS = [
  'upgradePreservedData',
  'permissionsPreserved',
  'alarmWhileClosed',
  'alarmAfterReboot',
  'blockedNotificationState',
  'fullScreenAlarm',
  'widgetAvailable',
];
export const REQUIRED_ANDROID_EMULATOR_CHECKS = [
  'installAndLaunch',
  'dataMigration',
  'alarmWhileClosed',
  'alarmAfterReboot',
  'blockedNotificationState',
  'fullScreenAlarm',
  'widgetAvailable',
];

const MAX_DEVICE_MATRIX_AGE_MS = 14 * 24 * 60 * 60 * 1000;
const CLOCK_SKEW_MS = 5 * 60 * 1000;

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isHttpsUrl(value) {
  try {
    return typeof value === 'string' && new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
}

function parseTimestamp(value, label) {
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) {
    throw new Error(`${label}이 올바른 ISO 날짜가 아니에요.`);
  }
  return new Date(value).toISOString();
}

function normalizeVersionCode(value) {
  const parsed = typeof value === 'string' ? Number.parseInt(value, 10) : value;
  return Number.isInteger(parsed) ? parsed : null;
}

/** Expo가 APK와 OTA에서 사용하는 Android 네이티브 입력만 SHA-256으로 묶어요. */
export async function createAndroidNativeFingerprint(projectRoot) {
  return createProjectHashAsync(projectRoot, {
    platforms: ['android'],
    hashAlgorithm: 'sha256',
    silent: true,
  });
}

/** `eas build:view <id> --json` 결과를 릴리스에 사용할 수 있는 증거로 정규화해요. */
export function normalizeEasBuildProvenance(value, expected) {
  if (!isRecord(value)) throw new Error('EAS 빌드 증거가 객체가 아니에요.');

  const artifactUrl = value.artifacts?.buildUrl;
  const sourceCommit = value.gitCommitHash;
  const finishedAt = value.completedAt ?? value.updatedAt;
  const versionCode = normalizeVersionCode(value.appBuildVersion);
  const projectId = value.project?.id;

  if (value.status !== 'FINISHED') {
    throw new Error('완료된 EAS 빌드만 APK 릴리스에 사용할 수 있어요.');
  }
  if (value.platform !== 'ANDROID') {
    throw new Error('Android EAS 빌드 증거가 아니에요.');
  }
  if (value.buildProfile !== expected.buildProfile) {
    throw new Error(`EAS 빌드 프로필은 ${expected.buildProfile}이어야 해요.`);
  }
  if (!EAS_BUILD_ID_PATTERN.test(value.id ?? '')) {
    throw new Error('EAS 빌드 ID가 올바르지 않아요.');
  }
  if (!GIT_COMMIT_PATTERN.test(sourceCommit ?? '')) {
    throw new Error('EAS 빌드에 40자리 Git 소스 커밋이 기록되지 않았어요.');
  }
  if (!isHttpsUrl(artifactUrl)) {
    throw new Error('EAS 빌드 APK 주소가 올바르지 않아요.');
  }
  if (
    value.appVersion !== expected.versionName ||
    versionCode !== expected.versionCode
  ) {
    throw new Error('EAS 빌드 버전이 현재 앱 버전과 다르게 기록됐어요.');
  }
  if (projectId !== expected.projectId) {
    throw new Error('EAS 빌드 프로젝트가 현재 Expo 프로젝트와 달라요.');
  }

  return {
    easBuildId: value.id,
    sourceCommit: sourceCommit.toLowerCase(),
    artifactUrl,
    finishedAt: parseTimestamp(finishedAt, 'EAS 빌드 완료 시각'),
  };
}

function assertBoundValue(actual, expected, label) {
  if (actual !== expected) {
    throw new Error(`실기기 검사 기록의 ${label}이 staged APK와 달라요.`);
  }
}

function assertEvidence(device, label, verifiedEvidenceSha256s) {
  const evidence = device?.evidence;
  if (
    !isRecord(evidence) ||
    typeof evidence.path !== 'string' ||
    !/^\.release\/device-evidence\/[a-z0-9._-]+\.json$/iu.test(evidence.path) ||
    !SHA256_PATTERN.test(evidence.sha256 ?? '')
  ) {
    throw new Error(`${label}의 원본 증거 파일 정보가 올바르지 않아요.`);
  }
  if (
    !(verifiedEvidenceSha256s instanceof Set) ||
    !verifiedEvidenceSha256s.has(evidence.sha256.toLowerCase())
  ) {
    throw new Error(
      `${label}의 원본 증거 파일을 SHA-256으로 확인하지 못했어요.`,
    );
  }
  return evidence.sha256.toLowerCase();
}

function assertDeviceTimestamp(
  device,
  label,
  buildFinishedAt,
  checkedTimestamp,
) {
  const deviceCheckedAt = Date.parse(
    parseTimestamp(device.checkedAt, `${label} 검사 시각`),
  );
  if (
    deviceCheckedAt + CLOCK_SKEW_MS < buildFinishedAt ||
    deviceCheckedAt > checkedTimestamp + CLOCK_SKEW_MS
  ) {
    throw new Error(
      `${label} 검사 시각이 APK·검사 완료 시각 범위를 벗어났어요.`,
    );
  }
}

function assertRequiredChecks(device, checks, label) {
  for (const check of checks) {
    if (device[check] !== true) {
      throw new Error(`${label}의 ${check} 검사가 통과하지 않았어요.`);
    }
  }
}

/** 현재 Samsung 실기기 한 대와 Android 12~16 에뮬레이터가 같은 staged APK를 검사했는지 확인해요. */
export function assertAndroidDeviceMatrixBinding(
  matrix,
  manifest,
  options = {},
) {
  if (!isRecord(matrix))
    throw new Error('Android 기기 검사 기록이 객체가 아니에요.');
  if (!isRecord(manifest))
    throw new Error('staged APK 배포 정보가 객체가 아니에요.');
  if (matrix.schemaVersion !== 3) {
    throw new Error('Android 기기 검사 기록은 schemaVersion 3이어야 해요.');
  }

  for (const [field, label] of [
    ['packageName', '패키지 이름'],
    ['versionName', '버전 이름'],
    ['versionCode', '버전 코드'],
    ['apkSha256', 'APK SHA-256'],
    ['sourceCommit', '소스 커밋'],
    ['easBuildId', 'EAS 빌드 ID'],
    ['nativeFingerprint', '네이티브 호환 지문'],
  ]) {
    const manifestField = field === 'apkSha256' ? 'sha256' : field;
    assertBoundValue(matrix[field], manifest[manifestField], label);
  }

  if (!SHA256_PATTERN.test(matrix.apkSha256 ?? '')) {
    throw new Error('실기기 검사 기록의 APK SHA-256이 올바르지 않아요.');
  }
  if (!GIT_COMMIT_PATTERN.test(matrix.sourceCommit ?? '')) {
    throw new Error('실기기 검사 기록의 소스 커밋이 올바르지 않아요.');
  }
  if (!EAS_BUILD_ID_PATTERN.test(matrix.easBuildId ?? '')) {
    throw new Error('실기기 검사 기록의 EAS 빌드 ID가 올바르지 않아요.');
  }
  if (!SHA256_PATTERN.test(matrix.nativeFingerprint ?? '')) {
    throw new Error('실기기 검사 기록의 네이티브 호환 지문이 올바르지 않아요.');
  }

  const checkedAt = parseTimestamp(matrix.checkedAt, '기기 검사 완료 시각');
  const checkedTimestamp = Date.parse(checkedAt);
  const now = options.now ?? Date.now();
  if (checkedTimestamp > now + CLOCK_SKEW_MS) {
    throw new Error('기기 검사 완료 시각이 현재보다 미래예요.');
  }
  if (now - checkedTimestamp > MAX_DEVICE_MATRIX_AGE_MS) {
    throw new Error('기기 검사 기록이 14일보다 오래됐어요.');
  }
  const buildFinishedAt = Date.parse(manifest.easBuildFinishedAt ?? '');
  if (!Number.isFinite(buildFinishedAt)) {
    throw new Error('staged APK에 EAS 빌드 완료 시각이 없어요.');
  }
  if (checkedTimestamp + CLOCK_SKEW_MS < buildFinishedAt) {
    throw new Error('실기기 검사가 EAS APK 빌드보다 먼저 완료된 기록이에요.');
  }

  const physicalDevice = matrix.physicalDevice;
  if (!isRecord(physicalDevice)) {
    throw new Error('현재 사용 중인 Samsung 실기기 검사 기록이 없어요.');
  }
  if (
    physicalDevice.deviceType !== 'physical' ||
    physicalDevice.currentSamsungDevice !== true ||
    !/samsung/iu.test(physicalDevice.manufacturer ?? '') ||
    !Number.isInteger(physicalDevice.sdk) ||
    physicalDevice.sdk < 31 ||
    physicalDevice.sdk > 36
  ) {
    throw new Error(
      '현재 사용 중인 Samsung 실기기를 physical로 명확히 기록해야 해요.',
    );
  }
  for (const field of ['model', 'osVersion', 'buildFingerprint']) {
    if (
      typeof physicalDevice[field] !== 'string' ||
      physicalDevice[field].trim().length < 2
    ) {
      throw new Error(`Samsung 실기기의 ${field} 정보가 없어요.`);
    }
  }
  assertDeviceTimestamp(
    physicalDevice,
    'Samsung 실기기',
    buildFinishedAt,
    checkedTimestamp,
  );
  assertRequiredChecks(
    physicalDevice,
    REQUIRED_ANDROID_PHYSICAL_CHECKS,
    'Samsung 실기기',
  );
  const physicalEvidenceSha256 = assertEvidence(
    physicalDevice,
    'Samsung 실기기',
    options.verifiedEvidenceSha256s,
  );

  if (
    !Array.isArray(matrix.emulators) ||
    matrix.emulators.length !== REQUIRED_ANDROID_EMULATOR_SDKS.length
  ) {
    throw new Error(
      'Android 12~16 에뮬레이터 검사 결과가 각각 한 개씩 필요해요.',
    );
  }
  const emulatorEvidence = [];
  for (const sdk of REQUIRED_ANDROID_EMULATOR_SDKS) {
    const matches = matrix.emulators.filter((device) => device?.sdk === sdk);
    if (matches.length !== 1) {
      throw new Error(
        `Android SDK ${sdk} 에뮬레이터 검사 결과가 정확히 한 개여야 해요.`,
      );
    }
    const device = matches[0];
    const label = `Android SDK ${sdk} 에뮬레이터`;
    if (
      device.deviceType !== 'emulator' ||
      typeof device.avdName !== 'string' ||
      device.avdName.trim().length < 2 ||
      typeof device.osVersion !== 'string' ||
      device.osVersion.trim().length < 2 ||
      typeof device.buildFingerprint !== 'string' ||
      device.buildFingerprint.trim().length < 2
    ) {
      throw new Error(`${label} 정보를 emulator로 명확히 기록해야 해요.`);
    }
    assertDeviceTimestamp(device, label, buildFinishedAt, checkedTimestamp);
    assertRequiredChecks(device, REQUIRED_ANDROID_EMULATOR_CHECKS, label);
    emulatorEvidence.push({
      sdk,
      sha256: assertEvidence(device, label, options.verifiedEvidenceSha256s),
    });
  }

  return {
    apkSha256: matrix.apkSha256,
    sourceCommit: matrix.sourceCommit,
    easBuildId: matrix.easBuildId,
    nativeFingerprint: matrix.nativeFingerprint,
    checkedAt,
    physicalEvidenceSha256,
    emulatorEvidence,
  };
}
