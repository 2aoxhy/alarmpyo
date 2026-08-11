import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

import { writeJsonAtomic } from './atomic-json-file.mjs';
import { immutableDeploymentUrl } from './release-deployment-url.mjs';
import { createFullDeploymentValidationArgs } from './release-validation-policy.mjs';
import { readReleasePolicy } from './release-policy.mjs';

const root = resolve(import.meta.dirname, '..');
const releasePolicy = await readReleasePolicy(root);
const validator = resolve(import.meta.dirname, 'validate-release.mjs');
const statePath = resolve(root, '.release', 'production-web-deployment.json');
const idIndex = process.argv.indexOf('--id');
const identifier =
  (idIndex >= 0 ? process.argv[idIndex + 1] : null) ??
  process.env.ALARMPYO_CURRENT_DEPLOYMENT_ID;

if (!identifier) {
  throw new Error(
    'Expo Hosting의 현재 production deployment ID를 --id 또는 ALARMPYO_CURRENT_DEPLOYMENT_ID로 입력해 주세요.',
  );
}

const productionUrl = releasePolicy.productionHostingUrl;
const immutableUrl = immutableDeploymentUrl(productionUrl, identifier);

function verify(baseUrl, label) {
  const result = spawnSync(
    process.execPath,
    [
      validator,
      ...createFullDeploymentValidationArgs({
        allowHistorical: true,
        baseUrl,
        manifestPath: 'public/updates/latest-android.json',
      }),
    ],
    { cwd: root, stdio: 'inherit' },
  );
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${label} 검증을 완료하지 못했어요.`);
}

console.log('1/2 · 입력한 불변 배포가 현재 APK를 제공하는지 확인해요.');
verify(immutableUrl, '불변 배포');
console.log('2/2 · 운영 주소도 같은 APK를 제공하는지 확인해요.');
verify(productionUrl, '운영 배포');

const state = {
  schemaVersion: 1,
  identifier,
  url: immutableUrl,
  productionUrl,
  bootstrappedAt: new Date().toISOString(),
  previousIdentifier: null,
};
await writeJsonAtomic(statePath, state);
console.log(`현재 운영 불변 배포를 복구 기준으로 저장했어요: ${identifier}`);
