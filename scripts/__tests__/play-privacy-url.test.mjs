import { Buffer } from 'node:buffer';

import { describe, expect, it, vi } from 'vitest';

import { validatePublishedPrivacyPolicy } from '../validate-play-privacy-url.mjs';

const url = 'https://owner.github.io/alarmpyo/privacy-policy.html';
const html = '<!doctype html><title>개인정보처리방침</title><h1>알람표 개인정보 처리방침</h1>';
const expectedBody = Buffer.from(html, 'utf8');

function response(body = html, init = {}) {
  return new Response(body, {
    status: 200,
    headers: { 'content-type': 'text/html; charset=utf-8' },
    ...init,
  });
}

describe('공개 Play 개인정보처리방침 검사', () => {
  it('같은 호스트의 HTTPS HTML과 알람표 제목을 확인해요', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(null, {
          status: 301,
          headers: { location: '/alarmpyo/privacy-policy.html' },
        }),
      )
      .mockResolvedValueOnce(response());

    await expect(
      validatePublishedPrivacyPolicy(url, { expectedBody, fetchImpl }),
    ).resolves.toMatchObject({ sizeBytes: Buffer.byteLength(html) });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('다른 호스트로 이동하거나 실패·비HTML 응답이면 거부해요', async () => {
    await expect(
      validatePublishedPrivacyPolicy(url, {
        expectedBody,
        fetchImpl: vi.fn().mockResolvedValue(
          new Response(null, {
            status: 302,
            headers: { location: 'https://login.example.com/' },
          }),
        ),
      }),
    ).rejects.toThrow('허용한 호스트 밖');
    await expect(
      validatePublishedPrivacyPolicy(url, {
        expectedBody,
        fetchImpl: vi.fn().mockResolvedValue(
          response('missing', {
            status: 404,
            headers: { 'content-type': 'text/html; charset=utf-8' },
          }),
        ),
      }),
    ).rejects.toThrow('HTTP 404');
    await expect(
      validatePublishedPrivacyPolicy(url, {
        expectedBody,
        fetchImpl: vi.fn().mockResolvedValue(
          response(html, { headers: { 'content-type': 'application/pdf' } }),
        ),
      }),
    ).rejects.toThrow('text/html');
  });

  it('제목이 없거나 로그인·편집 화면이거나 너무 크면 거부해요', async () => {
    for (const body of [
      '<html><h1>다른 문서</h1></html>',
      `${html}<input type="password">`,
      `${html}<main contenteditable="true">edit</main>`,
    ]) {
      await expect(
        validatePublishedPrivacyPolicy(url, {
          expectedBody,
          fetchImpl: vi.fn().mockResolvedValue(response(body)),
        }),
      ).rejects.toThrow();
    }
    await expect(
      validatePublishedPrivacyPolicy(url, {
        expectedBody,
        fetchImpl: vi.fn().mockResolvedValue(
          response(html, {
            headers: {
              'content-type': 'text/html; charset=utf-8',
              'content-length': String(512 * 1024 + 1),
            },
          }),
        ),
      }),
    ).rejects.toThrow('512KB');
  });

  it('게시본이 로컬 원본과 한 바이트라도 다르면 거부해요', async () => {
    await expect(
      validatePublishedPrivacyPolicy(url, {
        expectedBody,
        fetchImpl: vi.fn().mockResolvedValue(response(`${html}\n`)),
      }),
    ).rejects.toThrow('로컬 원본과 일치하지 않아요');
  });

  it('GitHub Pages의 고정 경로와 제한 시간을 요구해요', async () => {
    for (const invalidUrl of [
      'https://localhost/privacy-policy.html',
      'https://example.com/privacy-policy.html',
      'https://owner.github.io/alarmpyo/',
    ]) {
      await expect(
        validatePublishedPrivacyPolicy(invalidUrl, {
          expectedBody,
          fetchImpl: vi.fn(),
        }),
      ).rejects.toThrow('GitHub Pages');
    }

    await expect(
      validatePublishedPrivacyPolicy(url, {
        expectedBody,
        fetchImpl: vi.fn((_url, { signal }) =>
          new Promise((_resolve, reject) => {
            signal.addEventListener('abort', () => reject(signal.reason), {
              once: true,
            });
          }),
        ),
        timeoutMs: 1,
      }),
    ).rejects.toThrow('시간이 초과됐어요');
  });
});
