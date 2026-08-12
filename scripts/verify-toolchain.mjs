import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

import { resolveNpmInvocation } from './npm-runtime.mjs';

export const REQUIRED_NODE_VERSION = '24.16.0';
export const REQUIRED_NPM_VERSION = '11.13.0';

function normalizeNodeVersion(value) {
  return typeof value === 'string' ? value.replace(/^v/u, '') : '';
}

export function assertExactToolchain({ nodeVersion, npmVersion }) {
  const actualNodeVersion = normalizeNodeVersion(nodeVersion);
  const actualNpmVersion = typeof npmVersion === 'string' ? npmVersion.trim() : '';
  const errors = [];

  if (actualNodeVersion !== REQUIRED_NODE_VERSION) {
    errors.push(
      `Node.js ${REQUIRED_NODE_VERSION}이 필요해요. 현재 ${actualNodeVersion || '확인 불가'}예요.`,
    );
  }
  if (actualNpmVersion !== REQUIRED_NPM_VERSION) {
    errors.push(
      `npm ${REQUIRED_NPM_VERSION}이 필요해요. 현재 ${actualNpmVersion || '확인 불가'}예요.`,
    );
  }
  if (errors.length > 0) throw new Error(errors.join('\n'));

  return {
    nodeVersion: actualNodeVersion,
    npmVersion: actualNpmVersion,
  };
}

export function verifyExactToolchain({
  environment = process.env,
  nodeVersion = process.versions.node,
  npmInvocation,
  spawn = spawnSync,
} = {}) {
  const npm = npmInvocation ?? resolveNpmInvocation({ environment });
  const result = spawn(npm.command, [...npm.prefixArgs, '--version'], {
    encoding: 'utf8',
    env: environment,
  });
  if (result.error || result.status !== 0) {
    throw new Error(
      `npm 버전을 확인하지 못했어요.${result.error?.message ? ` ${result.error.message}` : ''}`,
    );
  }
  return assertExactToolchain({
    nodeVersion,
    npmVersion: result.stdout,
  });
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  try {
    const toolchain = verifyExactToolchain();
    console.log(
      `고정 도구 버전을 확인했어요. Node.js ${toolchain.nodeVersion} · npm ${toolchain.npmVersion}`,
    );
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
