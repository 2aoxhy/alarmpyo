import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { TextDecoder } from 'node:util';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import {
  isHttpsPrivacyPolicyUrl,
  readPlayReleasePolicy,
} from './play-release-policy.mjs';
import { readReleasePolicy } from './release-policy.mjs';

const root = resolve(import.meta.dirname, '..');
const MAX_PRIVACY_POLICY_BYTES = 512 * 1024;
const MAX_REDIRECTS = 5;
const REQUEST_TIMEOUT_MS = 15_000;
const REQUIRED_HEADING = '알람표 개인정보 처리방침';

function ensure(condition, message) {
  if (!condition) throw new Error(message);
}

function redirectStatus(status) {
  return [301, 302, 303, 307, 308].includes(status);
}

async function readBoundedBody(response) {
  const declaredLength = Number(response.headers.get('content-length'));
  ensure(
    !Number.isFinite(declaredLength) ||
      declaredLength <= MAX_PRIVACY_POLICY_BYTES,
    '공개 개인정보처리방침 응답이 512KB를 초과해요.',
  );
  ensure(response.body, '공개 개인정보처리방침 응답 본문이 없어요.');

  const chunks = [];
  let size = 0;
  for await (const chunk of response.body) {
    const bytes = chunk instanceof Uint8Array ? chunk : Buffer.from(chunk);
    size += bytes.byteLength;
    ensure(
      size <= MAX_PRIVACY_POLICY_BYTES,
      '공개 개인정보처리방침 응답이 512KB를 초과해요.',
    );
    chunks.push(bytes);
  }
  try {
    const bytes = Buffer.concat(chunks, size);
    return {
      bytes,
      text: new TextDecoder('utf-8', { fatal: true }).decode(bytes),
    };
  } catch {
    throw new Error('공개 개인정보처리방침 본문이 올바른 UTF-8이 아니에요.');
  }
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function isGitHubPagesPrivacyPolicyUrl(value) {
  const url = new URL(value);
  return (
    url.hostname.toLowerCase().endsWith('.github.io') &&
    url.pathname.endsWith('/privacy-policy.html')
  );
}

export async function validatePublishedPrivacyPolicy(
  privacyPolicyUrl,
  {
    expectedBody,
    fetchImpl = fetch,
    timeoutMs = REQUEST_TIMEOUT_MS,
  } = {},
) {
  ensure(
    isHttpsPrivacyPolicyUrl(privacyPolicyUrl) &&
      isGitHubPagesPrivacyPolicyUrl(privacyPolicyUrl),
    'Play 개인정보처리방침은 GitHub Pages의 /privacy-policy.html HTTPS 주소여야 해요.',
  );
  ensure(
    expectedBody instanceof Uint8Array && expectedBody.byteLength > 0,
    '비교할 로컬 개인정보처리방침 원본이 없어요.',
  );
  ensure(
    expectedBody.byteLength <= MAX_PRIVACY_POLICY_BYTES,
    '로컬 개인정보처리방침 원본이 512KB를 초과해요.',
  );
  const expectedSha256 = sha256(expectedBody);
  const allowedHost = new URL(privacyPolicyUrl).hostname.toLowerCase();
  let currentUrl = privacyPolicyUrl;
  let response;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  timeout.unref?.();

  try {
    for (let redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount += 1) {
      response = await fetchImpl(currentUrl, {
        headers: {
          Accept: 'text/html',
          'User-Agent': 'AlarmPyo-Play-privacy-policy-validator',
        },
        redirect: 'manual',
        signal: controller.signal,
      });
      if (!redirectStatus(response.status)) break;
      ensure(
        redirectCount < MAX_REDIRECTS,
        '공개 개인정보처리방침의 리디렉션이 너무 많아요.',
      );
      const location = response.headers.get('location');
      ensure(location, '공개 개인정보처리방침 리디렉션 주소가 없어요.');
      const nextUrl = new URL(location, currentUrl).href;
      ensure(
        isHttpsPrivacyPolicyUrl(nextUrl) &&
          isGitHubPagesPrivacyPolicyUrl(nextUrl) &&
          new URL(nextUrl).hostname.toLowerCase() === allowedHost,
        '공개 개인정보처리방침이 허용한 호스트 밖으로 이동해요.',
      );
      currentUrl = nextUrl;
    }

    ensure(
      response && response.status >= 200 && response.status < 300,
      `공개 개인정보처리방침을 열지 못했어요. HTTP ${response?.status ?? '-'}`,
    );
    const finalUrl = response.url || currentUrl;
    ensure(
      isGitHubPagesPrivacyPolicyUrl(finalUrl) &&
        new URL(finalUrl).hostname.toLowerCase() === allowedHost,
      '공개 개인정보처리방침 최종 응답 호스트가 달라요.',
    );
    const contentType = response.headers.get('content-type') ?? '';
    ensure(
      /^text\/html(?:\s*;|\s*$)/iu.test(contentType),
      '공개 개인정보처리방침은 text/html 응답이어야 해요.',
    );
    const charset = contentType.match(/charset\s*=\s*["']?([^;\s"']+)/iu)?.[1];
    ensure(
      charset === undefined || /^utf-?8$/iu.test(charset),
      '공개 개인정보처리방침은 UTF-8 HTML이어야 해요.',
    );

    const body = await readBoundedBody(response);
    ensure(
      body.text.includes(REQUIRED_HEADING),
      '공개 개인정보처리방침에서 알람표 방침 제목을 확인하지 못했어요.',
    );
    ensure(
      !/<input\b[^>]*\btype\s*=\s*["']?password/iu.test(body.text) &&
        !/\bcontenteditable\s*=/iu.test(body.text) &&
        !/<title[^>]*>\s*(?:sign\s*in|log\s*in|로그인)/iu.test(body.text),
      '공개 개인정보처리방침 응답에 로그인 또는 편집 화면이 포함됐어요.',
    );
    const publishedSha256 = sha256(body.bytes);
    ensure(
      publishedSha256 === expectedSha256,
      '게시된 개인정보처리방침이 현재 로컬 원본과 일치하지 않아요.',
    );
    return {
      finalUrl,
      sizeBytes: body.bytes.byteLength,
      sha256: publishedSha256,
    };
  } catch (error) {
    if (controller.signal.aborted) {
      throw new Error('공개 개인정보처리방침 확인 시간이 초과됐어요.');
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export async function validateConfiguredPlayPrivacyPolicy() {
  const directPolicy = await readReleasePolicy(root, { allowBlocked: true });
  const playPolicy = await readPlayReleasePolicy(root, directPolicy);
  const expectedBody = await readFile(
    resolve(root, 'public', 'privacy-policy.html'),
  );
  return validatePublishedPrivacyPolicy(playPolicy.privacyPolicyUrl, {
    expectedBody,
  });
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  validateConfiguredPlayPrivacyPolicy()
    .then(({ finalUrl }) =>
      console.log(`공개 Play 개인정보처리방침을 확인했어요. ${finalUrl}`),
    )
    .catch((error) => {
      console.error(error instanceof Error ? error.message : String(error));
      // Allow the built-in fetch implementation to close its Windows handles
      // before Node exits. A synchronous exit can trigger a libuv assertion
      // after the intended validation error has already been reported.
      process.exitCode = 1;
    });
}
