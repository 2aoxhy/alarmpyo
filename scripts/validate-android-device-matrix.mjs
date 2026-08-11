import { createHash } from 'node:crypto';
import { lstat, readFile } from 'node:fs/promises';
import { relative, resolve, sep } from 'node:path';

import { writeJsonAtomic } from './atomic-json-file.mjs';
import {
  REQUIRED_ANDROID_EMULATOR_CHECKS,
  REQUIRED_ANDROID_PHYSICAL_CHECKS,
  assertAndroidDeviceMatrixBinding,
} from './release-artifact-provenance.mjs';

const root = resolve(import.meta.dirname, '..');
const matrixPath = resolve(
  root,
  process.env.ALARMPYO_DEVICE_MATRIX_PATH ?? '.release/android-device-matrix.json',
);
const manifestPath = resolve(
  root,
  process.env.ALARMPYO_STAGED_MANIFEST_PATH ?? '.release/latest-android.json',
);
const verifiedOutputPath = resolve(
  root,
  process.env.ALARMPYO_VERIFIED_DEVICE_MATRIX_PATH ??
    '.release/verified-device-matrix.json',
);

const readJson = async (path, missingMessage) => {
  try {
    return JSON.parse((await readFile(path, 'utf8')).replace(/^\uFEFF/u, ''));
  } catch (error) {
    if (error?.code === 'ENOENT') throw new Error(missingMessage);
    throw error;
  }
};

function isInsideProject(path) {
  const result = relative(root, path);
  return result.length > 0 && result !== '..' && !result.startsWith(`..${sep}`);
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

async function verifyEvidenceFile(device) {
  const evidencePath = device?.evidence?.path;
  if (
    typeof evidencePath !== 'string' ||
    !/^\.release\/device-evidence\/[a-z0-9._-]+\.json$/iu.test(evidencePath)
  ) {
    throw new Error(
      '기기 증거 경로는 .release/device-evidence 안의 JSON 파일이어야 해요.',
    );
  }
  const absolutePath = resolve(root, ...evidencePath.split('/'));
  if (!isInsideProject(absolutePath)) {
    throw new Error('기기 증거 경로가 프로젝트 경계를 벗어났어요.');
  }
  const stats = await lstat(absolutePath);
  if (!stats.isFile() || stats.isSymbolicLink()) {
    throw new Error(`실제 JSON 증거 파일만 사용할 수 있어요: ${evidencePath}`);
  }
  const bytes = await readFile(absolutePath);
  const actualSha256 = sha256(bytes);
  if (actualSha256 !== String(device.evidence.sha256 ?? '').toLowerCase()) {
    throw new Error(`기기 증거 파일 SHA-256이 기록과 달라요: ${evidencePath}`);
  }
  const evidence = JSON.parse(bytes.toString('utf8').replace(/^\uFEFF/u, ''));
  if (
    evidence.schemaVersion !== 1 ||
    evidence.captureMethod !== 'adb' ||
    evidence.deviceType !== device.deviceType ||
    evidence.sdk !== device.sdk ||
    evidence.checkedAt !== device.checkedAt ||
    evidence.properties?.buildFingerprint !== device.buildFingerprint
  ) {
    throw new Error(
      `ADB 원본 증거가 기기 검사 기록과 일치하지 않아요: ${evidencePath}`,
    );
  }
  const checks =
    device.deviceType === 'physical'
      ? REQUIRED_ANDROID_PHYSICAL_CHECKS
      : REQUIRED_ANDROID_EMULATOR_CHECKS;
  if (checks.some((check) => evidence.checks?.[check] !== true)) {
    throw new Error(
      `ADB 원본 증거에 통과한 검사 결과가 모두 기록되지 않았어요: ${evidencePath}`,
    );
  }
  if (
    device.deviceType === 'physical' &&
    (evidence.properties?.manufacturer !== device.manufacturer ||
      evidence.properties?.model !== device.model)
  ) {
    throw new Error(
      `Samsung 실기기 원본 정보가 매트릭스와 달라요: ${evidencePath}`,
    );
  }
  if (
    device.deviceType === 'emulator' &&
    evidence.properties?.avdName !== device.avdName
  ) {
    throw new Error(
      `에뮬레이터 AVD 원본 정보가 매트릭스와 달라요: ${evidencePath}`,
    );
  }
  return actualSha256;
}

try {
  const [matrix, manifest] = await Promise.all([
    readJson(
      matrixPath,
      'Samsung 실기기와 Android 12~16 에뮬레이터 검사 기록이 없어요. docs/android-device-matrix.example.json을 참고해 .release/android-device-matrix.json을 만들어 주세요.',
    ),
    readJson(
      manifestPath,
      'staged APK 배포 정보가 없어요. release:manifest를 먼저 실행해 주세요.',
    ),
  ]);
  const devices = [matrix.physicalDevice, ...(matrix.emulators ?? [])];
  const verifiedEvidenceSha256s = new Set(
    await Promise.all(devices.map(verifyEvidenceFile)),
  );
  const binding = assertAndroidDeviceMatrixBinding(matrix, manifest, {
    verifiedEvidenceSha256s,
  });
  await writeJsonAtomic(verifiedOutputPath, {
    schemaVersion: 1,
    ...binding,
    verifiedAt: new Date().toISOString(),
  });
  console.log(
    `Samsung 실기기와 Android 12~16 에뮬레이터 기록이 staged APK ${binding.apkSha256.slice(0, 12)}…와 일치해요.`,
  );
} catch (error) {
  console.error(
    `오류: ${error instanceof Error ? error.message : '기기 검사 기록을 확인하지 못했어요.'}`,
  );
  process.exit(1);
}
