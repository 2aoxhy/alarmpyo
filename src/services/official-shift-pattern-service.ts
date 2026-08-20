import {
  MAX_SHIFT_PATTERN_BYTES,
  OFFICIAL_PATTERN_DEFINITIONS,
  OFFICIAL_PATTERN_IDS,
  OFFICIAL_SHIFT_PATTERN_BASE_URL,
  ShiftPatternError,
  assertShiftPatternByteSize,
  parseAndValidateShiftPattern,
  type OfficialPatternId,
  type OfficialPatternPublicKeyring,
  type ValidatedPatternDescriptor,
} from './shift-pattern-schema';

const DEFAULT_REQUEST_TIMEOUT_MS = 10_000;

export type OfficialPatternFetchOptions = {
  /** 화면 진입 또는 사용자의 새로고침 동작에서만 호출합니다. */
  signal?: AbortSignal;
  fetchImpl?: typeof fetch;
  baseUrl?: string;
  timeoutMs?: number;
  /** 테스트와 검증 도구에서만 사용합니다. 앱 화면은 빌드에 포함된 keyring을 사용합니다. */
  keyring?: OfficialPatternPublicKeyring;
};

export type OfficialPatternFetchResult =
  | {
      id: OfficialPatternId;
      status: 'ready';
      pattern: ValidatedPatternDescriptor & { source: 'official' };
    }
  | {
      id: OfficialPatternId;
      status: 'error';
      error: ShiftPatternError;
    };

function normalizeBaseUrl(value: string): URL {
  let url: URL;
  try {
    url = new URL(value.endsWith('/') ? value : `${value}/`);
  } catch (error) {
    throw new ShiftPatternError('invalid-response', '공식 패턴 주소가 올바르지 않습니다.', {
      cause: error,
    });
  }
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) {
    throw new ShiftPatternError('invalid-response', '공식 패턴 주소는 안전한 HTTPS 주소여야 합니다.');
  }
  return url;
}

function combineSignals(
  externalSignal: AbortSignal | undefined,
  timeoutMs: number,
): { signal: AbortSignal; cleanup: () => void } {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(new Error('request-timeout')), timeoutMs);
  const abortFromExternal = () => controller.abort(externalSignal?.reason);
  if (externalSignal?.aborted) abortFromExternal();
  else externalSignal?.addEventListener('abort', abortFromExternal, { once: true });
  return {
    signal: controller.signal,
    cleanup: () => {
      clearTimeout(timeout);
      externalSignal?.removeEventListener('abort', abortFromExternal);
    },
  };
}

function checkedContentLength(response: Response, patternId: OfficialPatternId): void {
  const raw = response.headers.get('content-length');
  if (raw === null) return;
  if (!/^\d+$/u.test(raw)) {
    throw new ShiftPatternError('invalid-response', '공식 패턴 응답 크기가 올바르지 않습니다.', {
      patternId,
    });
  }
  if (Number(raw) > MAX_SHIFT_PATTERN_BYTES) {
    throw new ShiftPatternError('file-too-large', '공식 근무 패턴 파일은 256KB 이하여야 합니다.', {
      patternId,
    });
  }
}

function checkedContentType(response: Response, patternId: OfficialPatternId): void {
  const raw = response.headers.get('content-type');
  if (!raw) return;
  const mediaType = raw.split(';', 1)[0]!.trim().toLowerCase();
  if (mediaType !== 'application/json' && mediaType !== 'text/json') {
    throw new ShiftPatternError('invalid-response', '공식 패턴 응답이 JSON 형식이 아닙니다.', {
      patternId,
    });
  }
}

function asShiftPatternError(error: unknown, patternId: OfficialPatternId): ShiftPatternError {
  if (error instanceof ShiftPatternError) return error;
  return new ShiftPatternError('network', '공식 근무 패턴을 불러오지 못했습니다.', {
    cause: error,
    patternId,
  });
}

/**
 * 공식 패턴 한 개를 사용자의 화면 진입 또는 새로고침 동작으로만 가져옵니다.
 * 이 서비스는 예약, 백그라운드 작업, 재시도를 만들지 않습니다.
 */
export async function fetchOfficialShiftPatternOnDemand(
  id: OfficialPatternId,
  options: OfficialPatternFetchOptions = {},
): Promise<ValidatedPatternDescriptor & { source: 'official' }> {
  const definition = OFFICIAL_PATTERN_DEFINITIONS.get(id);
  if (!definition) {
    throw new ShiftPatternError('official-contract-mismatch', '지원하지 않는 공식 패턴 ID입니다.', {
      patternId: id,
    });
  }
  const baseUrl = normalizeBaseUrl(options.baseUrl ?? OFFICIAL_SHIFT_PATTERN_BASE_URL);
  const expectedUrl = new URL(definition.fileName, baseUrl);
  if (expectedUrl.origin !== baseUrl.origin || !expectedUrl.pathname.startsWith(baseUrl.pathname)) {
    throw new ShiftPatternError('invalid-response', '공식 패턴 경로가 허용된 범위를 벗어났습니다.', {
      patternId: id,
    });
  }
  const timeoutMs = options.timeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1_000 || timeoutMs > 30_000) {
    throw new ShiftPatternError('invalid-response', '공식 패턴 요청 제한 시간이 올바르지 않습니다.', {
      patternId: id,
    });
  }
  const { signal, cleanup } = combineSignals(options.signal, timeoutMs);
  try {
    const response = await (options.fetchImpl ?? fetch)(expectedUrl, {
      cache: 'no-store',
      credentials: 'omit',
      headers: { Accept: 'application/json' },
      method: 'GET',
      redirect: 'follow',
      signal,
    });
    if (!response.ok) {
      throw new ShiftPatternError(
        'http',
        `공식 근무 패턴 서버가 HTTP ${response.status} 상태를 반환했습니다.`,
        { patternId: id },
      );
    }
    if (response.url && new URL(response.url).href !== expectedUrl.href) {
      throw new ShiftPatternError(
        'invalid-response',
        '공식 근무 패턴이 허용되지 않은 주소로 이동했습니다.',
        { patternId: id },
      );
    }
    checkedContentLength(response, id);
    checkedContentType(response, id);
    const contents = await response.text();
    assertShiftPatternByteSize(contents);
    const pattern = parseAndValidateShiftPattern(contents, { keyring: options.keyring });
    if (pattern.id !== id || pattern.source !== 'official') {
      throw new ShiftPatternError(
        'official-contract-mismatch',
        '요청한 공식 근무 패턴과 응답 내용이 다릅니다.',
        { patternId: id },
      );
    }
    return pattern as ValidatedPatternDescriptor & { source: 'official' };
  } catch (error) {
    throw asShiftPatternError(error, id);
  } finally {
    cleanup();
  }
}

export async function fetchOfficialShiftPatternsOnDemand(
  options: OfficialPatternFetchOptions = {},
): Promise<OfficialPatternFetchResult[]> {
  return Promise.all(
    OFFICIAL_PATTERN_IDS.map(async (id): Promise<OfficialPatternFetchResult> => {
      try {
        return {
          id,
          status: 'ready',
          pattern: await fetchOfficialShiftPatternOnDemand(id, options),
        };
      } catch (error) {
        return { id, status: 'error', error: asShiftPatternError(error, id) };
      }
    }),
  );
}
