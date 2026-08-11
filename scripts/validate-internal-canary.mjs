import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { readReleasePolicy } from './release-policy.mjs';

const defaultRoot = resolve(import.meta.dirname, '..');
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

function isEasUpdatesUrl(value, projectId) {
  try {
    const url = new URL(value);
    return (
      url.protocol === 'https:' &&
      url.hostname === 'u.expo.dev' &&
      url.pathname === `/${projectId}` &&
      url.username === '' &&
      url.password === '' &&
      url.search === '' &&
      url.hash === ''
    );
  } catch {
    return false;
  }
}

export function assertInternalCanaryConfig({
  pkg,
  lock,
  app,
  eas,
  releasePolicy,
  resolvedConfig,
}) {
  const errors = [];
  const expect = (condition, message) => {
    if (!condition) errors.push(message);
  };
  const expo = app.expo ?? {};
  const resolvedExpo = resolvedConfig ?? {};
  const projectId = expo.extra?.eas?.projectId;
  const canary = eas.build?.canary ?? {};
  const lockRoot = lock.packages?.[''] ?? {};
  const updates = expo.updates ?? {};
  const updatesDisabled = updates.enabled === false;
  const updatesLinked =
    updates.enabled !== false &&
    updates.checkAutomatically === 'ON_LOAD' &&
    Number.isInteger(updates.fallbackToCacheTimeout) &&
    updates.fallbackToCacheTimeout >= 0 &&
    isEasUpdatesUrl(updates.url, projectId);
  const sameJson = (left, right) =>
    JSON.stringify(left) === JSON.stringify(right);

  expect(pkg.name === 'alarmpyo', 'npm 패키지 이름은 alarmpyo여야 해요.');
  expect(
    /^\d+\.\d+\.\d+$/u.test(pkg.version ?? ''),
    '앱 버전은 1.2.3 형식이어야 해요.',
  );
  expect(
    pkg.version === expo.version &&
      pkg.version === lock.version &&
      pkg.version === lockRoot.version &&
      resolvedExpo.version === expo.version,
    'package.json, package-lock.json, app.json의 앱 버전이 모두 같아야 해요.',
  );
  expect(
    lock.name === pkg.name && lockRoot.name === pkg.name,
    'package-lock.json의 패키지 계보가 alarmpyo와 일치해야 해요.',
  );
  expect(
    Number.isInteger(expo.android?.versionCode) && expo.android.versionCode > 0,
    'Android versionCode는 1 이상의 정수여야 해요.',
  );
  expect(
    resolvedExpo.android?.versionCode === expo.android?.versionCode,
    'EAS가 해석한 Android versionCode가 app.json과 같아야 해요.',
  );
  expect(
    expo.android?.package === 'com.personal.alarmpyo' &&
      expo.android.package === releasePolicy.packageName &&
      resolvedExpo.android?.package === expo.android.package,
    '내부 canary의 Android 패키지는 com.personal.alarmpyo여야 해요.',
  );
  expect(
    expo.ios?.bundleIdentifier === 'com.personal.alarmpyo',
    'iOS bundleIdentifier도 AlarmPyo 새 계보와 일치해야 해요.',
  );

  expect(
    UUID_PATTERN.test(projectId ?? '') &&
      projectId === releasePolicy.expoProjectId &&
      resolvedExpo.extra?.eas?.projectId === projectId,
    'app config와 릴리스 정책의 EAS project ID가 일치해야 해요.',
  );
  expect(
    expo.owner === '2aox.hy' &&
      expo.slug === 'alarmpyo' &&
      resolvedExpo.owner === expo.owner &&
      resolvedExpo.slug === expo.slug,
    'EAS 프로젝트 이름은 @2aox.hy/alarmpyo여야 해요.',
  );
  expect(
    !releasePolicy.releaseBlockers.includes('expoProjectId'),
    'EAS project ID 연결이 차단된 상태에서는 내부 canary를 만들 수 없어요.',
  );

  expect(
    expo.runtimeVersion?.policy === 'appVersion' &&
      sameJson(resolvedExpo.runtimeVersion, expo.runtimeVersion),
    '서로 다른 앱 버전의 OTA가 섞이지 않도록 appVersion 런타임 정책이 필요해요.',
  );
  expect(
    typeof pkg.dependencies?.['expo-updates'] === 'string',
    'expo-updates 의존성이 누락됐어요.',
  );
  expect(
    updatesDisabled || updatesLinked,
    '내부 canary의 Expo Updates는 명시적으로 끄거나 현재 EAS project ID에 안전하게 연결해야 해요.',
  );
  expect(
    sameJson(resolvedExpo.updates, expo.updates),
    'EAS가 해석한 Expo Updates 설정이 app.json과 같아야 해요.',
  );
  if (updatesDisabled) {
    expect(
      updates.url === undefined &&
        updates.checkAutomatically === undefined &&
        updates.fallbackToCacheTimeout === undefined,
      'Expo Updates를 끈 canary에는 사용하지 않는 OTA 주소나 실행 정책을 남기지 마세요.',
    );
  }

  expect(
    eas.cli?.appVersionSource === 'local',
    '앱 버전은 저장소의 app.json을 기준으로 관리해야 해요.',
  );
  expect(
    canary.extends === 'base' &&
      canary.distribution === 'internal' &&
      canary.environment === 'preview' &&
      canary.channel === 'canary' &&
      canary.android?.buildType === 'apk',
    'EAS canary는 preview 환경의 internal APK여야 해요.',
  );
  expect(
    canary.env?.ALARMPYO_DISTRIBUTION === 'direct',
    '내부 canary의 EAS 빌더는 direct 배포 구분으로 고정해야 해요.',
  );
  expect(
    eas.build?.base?.node === '24.16.0' &&
      eas.build?.base?.autoIncrement === false,
    'EAS canary는 고정된 Node 버전과 로컬 versionCode를 사용해야 해요.',
  );
  expect(
    resolvedExpo.extra?.distribution === 'direct' &&
      !resolvedExpo.plugins?.includes('./plugins/with-play-store-policy.js'),
    '내부 canary는 direct 앱 구성으로 해석되어야 해요.',
  );

  if (errors.length > 0) {
    throw new Error(errors.join('\n'));
  }
  return true;
}

export async function validateInternalCanary(projectRoot = defaultRoot) {
  const readJson = async (path) =>
    JSON.parse(
      (await readFile(resolve(projectRoot, path), 'utf8')).replace(/^\uFEFF/u, ''),
    );
  const [pkg, lock, app, eas, releasePolicy] = await Promise.all([
    readJson('package.json'),
    readJson('package-lock.json'),
    readJson('app.json'),
    readJson('eas.json'),
    readReleasePolicy(projectRoot, { allowBlocked: true }),
  ]);

  const previousDistribution = process.env.ALARMPYO_DISTRIBUTION;
  process.env.ALARMPYO_DISTRIBUTION = 'direct';
  try {
    const require = createRequire(import.meta.url);
    const createConfig = require(resolve(projectRoot, 'app.config.js'));
    const resolvedConfig = createConfig();
    return assertInternalCanaryConfig({
      pkg,
      lock,
      app,
      eas,
      releasePolicy,
      resolvedConfig,
    });
  } finally {
    if (previousDistribution === undefined) {
      delete process.env.ALARMPYO_DISTRIBUTION;
    } else {
      process.env.ALARMPYO_DISTRIBUTION = previousDistribution;
    }
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  validateInternalCanary()
    .then(() => {
      console.log(
        'AlarmPyo 내부 canary의 패키지·버전·Updates·EAS 연결을 확인했어요.',
      );
    })
    .catch((error) => {
      console.error(error instanceof Error ? error.message : String(error));
      process.exit(1);
    });
}
