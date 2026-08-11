import { randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { writeJsonAtomic } from './atomic-json-file.mjs';
import {
  assertPromotionResult,
  manifestsHaveSameIdentity,
  resolvePreviousDeploymentState,
} from './release-deployment-policy.mjs';
import {
  readFileSnapshot,
  restoreFileSnapshot,
} from './release-file-transaction.mjs';
import { createFullDeploymentValidationArgs } from './release-validation-policy.mjs';
import { readReleasePolicy } from './release-policy.mjs';

const root = resolve(import.meta.dirname, '..');
const releasePolicy = await readReleasePolicy(root);
const easRunner = resolve(import.meta.dirname, 'run-eas-cli.mjs');
const releaseValidator = resolve(import.meta.dirname, 'validate-release.mjs');
const sourceChecker = resolve(import.meta.dirname, 'check-deploy-source.mjs');
const statePath = resolve(root, '.release', 'production-web-deployment.json');
const stagedStatePath = resolve(root, '.release', 'staged-web-deployment.json');
const deploymentId =
  process.env.ALARMPYO_EAS_DEPLOYMENT_ID ?? randomBytes(6).toString('hex');
const releaseTransaction = process.env.ALARMPYO_DEPLOY_VERIFY_RELEASE === '1';

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    env: process.env,
    encoding: options.json ? 'utf8' : undefined,
    stdio: options.json ? ['ignore', 'pipe', 'inherit'] : 'inherit',
    shell: false,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${options.label ?? args[0]} 단계가 완료되지 않았어요.`);
  }
  if (!options.json) return null;
  try {
    return JSON.parse(result.stdout);
  } catch {
    throw new Error(`${options.label ?? args[0]} 결과를 읽지 못했어요.`);
  }
}

function runEasJson(args, label) {
  return run(process.execPath, [easRunner, ...args, '--json'], {
    json: true,
    label,
  });
}

function runReleaseValidation(args, label) {
  run(process.execPath, [releaseValidator, ...args], { label });
}

async function readJson(path) {
  try {
    return JSON.parse(await readFile(path, 'utf8'));
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw error;
  }
}

const wait = (milliseconds) =>
  new Promise((resolveWait) => setTimeout(resolveWait, milliseconds));

async function waitForUrl(url, attempts = 10) {
  let lastError = null;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);
    try {
      const response = await fetch(`${url}${url.includes('?') ? '&' : '?'}verify=${Date.now()}`, {
        cache: 'no-store',
        headers: { 'Cache-Control': 'no-cache' },
        redirect: 'follow',
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      await response.body?.cancel();
      return;
    } catch (error) {
      lastError = error;
      if (attempt < attempts) await wait(3_000);
    } finally {
      clearTimeout(timeout);
    }
  }
  throw new Error(
    `배포 주소를 확인하지 못했어요: ${url} (${lastError instanceof Error ? lastError.message : '알 수 없는 오류'})`,
  );
}

async function verifyStagedDeployment(url) {
  await waitForUrl(url);
  await waitForManifestMatch(url, 'public/updates/latest-android.json');
  runReleaseValidation(
    createFullDeploymentValidationArgs({
      allowHistorical: !releaseTransaction,
      baseUrl: url,
      verifyProvenanceArtifact: releaseTransaction,
    }),
    '불변 배포 APK 검증',
  );
}

async function verifyProductionDeployment(productionUrl) {
  await waitForUrl(productionUrl);
  await waitForManifestMatch(
    productionUrl,
    'public/updates/latest-android.json',
  );
  runReleaseValidation(
    createFullDeploymentValidationArgs({
      allowHistorical: !releaseTransaction,
      baseUrl: productionUrl,
      verifyProvenanceArtifact: releaseTransaction,
    }),
    '운영 배포 최종 검증',
  );
}

async function waitForManifestMatch(
  deploymentUrl,
  manifestPath,
  attempts = 20,
) {
  const expected = await readJson(resolve(root, manifestPath));
  if (!expected) throw new Error(`검증할 배포 정보가 없어요: ${manifestPath}`);
  const manifestUrl = new URL(
    'updates/latest-android.json',
    deploymentUrl,
  ).toString();
  let lastError = null;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);
    try {
      const separator = manifestUrl.includes('?') ? '&' : '?';
      const response = await fetch(
        `${manifestUrl}${separator}verify=${Date.now()}`,
        {
          cache: 'no-store',
          headers: { Accept: 'application/json', 'Cache-Control': 'no-cache' },
          redirect: 'follow',
          signal: controller.signal,
        },
      );
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const actual = await response.json();
      if (!manifestsHaveSameIdentity(actual, expected)) {
        throw new Error('배포 정보가 아직 목표 버전과 달라요.');
      }
      return;
    } catch (error) {
      lastError = error;
      if (attempt < attempts) await wait(3_000);
    } finally {
      clearTimeout(timeout);
    }
  }
  throw new Error(
    `배포 정보 반영을 확인하지 못했어요: ${manifestUrl} (${lastError instanceof Error ? lastError.message : '알 수 없는 오류'})`,
  );
}

async function verifyPreviousDeployment(url, manifestPath) {
  await waitForUrl(url);
  await waitForManifestMatch(url, manifestPath);
  runReleaseValidation(
    createFullDeploymentValidationArgs({
      allowHistorical: true,
      baseUrl: url,
      manifestPath,
    }),
    '직전 불변 배포 검증',
  );
}

async function promote(identifier) {
  const promoted = runEasJson(
    ['deploy:alias', '--prod', '--id', identifier, '--non-interactive'],
    '운영 주소 연결',
  );
  return assertPromotionResult(promoted, identifier);
}

run(process.execPath, [sourceChecker], { label: '웹 배포 소스 검증' });

const productionUrl = releasePolicy.productionHostingUrl;
const previousStateSnapshot = await readFileSnapshot(statePath);
const previousState = await readJson(statePath);
const previousDeployment = resolvePreviousDeploymentState({
  environmentIdentifier: process.env.ALARMPYO_PREVIOUS_DEPLOYMENT_ID,
  previousState,
  productionUrl,
});
const previousIdentifier = previousDeployment?.identifier ?? null;

if (!previousIdentifier) {
  throw new Error(
    '운영 배포 전에는 검증된 직전 배포 식별자가 필요해요. release:bootstrap:web을 먼저 실행하거나 ALARMPYO_PREVIOUS_DEPLOYMENT_ID를 설정해 주세요.',
  );
}
const previousDeploymentUrl = previousDeployment?.url ?? null;
const rollbackManifestPath = releaseTransaction
  ? 'public/updates/previous-android.json'
  : 'public/updates/latest-android.json';

if (previousDeploymentUrl) {
  console.log('0/4 · 문제가 생길 때 되돌릴 직전 불변 배포를 먼저 검증해요.');
  await verifyPreviousDeployment(previousDeploymentUrl, rollbackManifestPath);
}

console.log(`1/4 · 불변 배포를 한 번 만들어요: ${deploymentId}`);
const staged = runEasJson(
  [
    'deploy',
    '--id',
    deploymentId,
    '--environment',
    'production',
    '--non-interactive',
  ],
  '불변 배포 생성',
);
if (staged?.identifier !== deploymentId || typeof staged?.url !== 'string') {
  throw new Error('만든 불변 배포의 식별자와 주소를 확인하지 못했어요.');
}
await writeJsonAtomic(stagedStatePath, {
  schemaVersion: 1,
  identifier: staged.identifier,
  url: staged.url,
  createdAt: new Date().toISOString(),
});

console.log('2/4 · 운영 주소를 바꾸기 전에 APK와 배포 내용을 검증해요.');
await verifyStagedDeployment(staged.url);

try {
  console.log('3/4 · 검증된 동일 배포를 운영 주소에 연결해요.');
  await promote(staged.identifier);
  console.log('4/4 · 운영 주소가 같은 내용을 제공하는지 최종 확인해요.');
  await verifyProductionDeployment(productionUrl);
  await writeJsonAtomic(statePath, {
    schemaVersion: 1,
    identifier: staged.identifier,
    url: staged.url,
    productionUrl,
    promotedAt: new Date().toISOString(),
    previousIdentifier,
  });
} catch (error) {
  console.error('운영 확인에 실패해 직전 불변 배포로 되돌려요.');
  const recoveryErrors = [];
  try {
    await promote(previousIdentifier);
    await verifyPreviousDeployment(productionUrl, rollbackManifestPath);
  } catch (rollbackError) {
    recoveryErrors.push(
      new Error('직전 운영 배포를 복구하고 검증하지 못했어요.', {
        cause: rollbackError,
      }),
    );
  }
  try {
    await restoreFileSnapshot(statePath, previousStateSnapshot);
  } catch (stateError) {
    recoveryErrors.push(
      new Error('직전 운영 배포 상태 파일을 복구하지 못했어요.', {
        cause: stateError,
      }),
    );
  }
  if (recoveryErrors.length > 0) {
    throw new AggregateError(
      [error, ...recoveryErrors],
      '새 배포 검증과 자동 복구를 모두 완료하지 못했어요.',
    );
  }
  throw new Error('새 배포를 직전 운영 배포로 되돌렸어요.', { cause: error });
}
console.log(`운영 웹 배포를 완료했어요: ${staged.identifier}`);
