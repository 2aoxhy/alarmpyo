import { parseEnvironmentBriefingPayload } from '../../application/environment/environment-codec';
import {
  type EnvironmentBriefingGateway,
  type EnvironmentBriefingPayload,
  type EnvironmentProviderFailureReason,
  type KmaGrid,
} from '../../application/environment/environment-types';
import { isValidKmaGrid } from '../../application/environment/kma-grid';

const DEFAULT_TIMEOUT_MS = 5_000;
const MAX_RESPONSE_BYTES = 256 * 1_024;

export type EnvironmentGatewayErrorCode =
  | EnvironmentProviderFailureReason
  | 'not-configured';

export class EnvironmentGatewayError extends Error {
  readonly code: EnvironmentGatewayErrorCode;

  constructor(code: EnvironmentGatewayErrorCode) {
    super(`Environment briefing request failed: ${code}`);
    this.name = 'EnvironmentGatewayError';
    this.code = code;
  }
}

export type EnvironmentFetch = (
  input: string,
  init?: RequestInit,
) => Promise<Response>;

export type EnvironmentHttpGatewayOptions = Readonly<{
  baseUrl: string;
  timeoutMs?: number;
  fetchImpl?: EnvironmentFetch;
}>;

function resolveEndpoint(baseUrl: string): string {
  const normalized = baseUrl.trim().replace(/\/+$/, '');
  if (!normalized) throw new EnvironmentGatewayError('not-configured');
  let url: URL;
  try {
    url = new URL(`${normalized}/v1/environment-briefing`);
  } catch {
    throw new EnvironmentGatewayError('not-configured');
  }
  const localDevelopment =
    url.protocol === 'http:' &&
    (url.hostname === 'localhost' || url.hostname === '127.0.0.1');
  if (url.protocol !== 'https:' && !localDevelopment) {
    throw new EnvironmentGatewayError('not-configured');
  }
  return url.toString();
}

function mapHttpFailure(status: number): EnvironmentGatewayErrorCode {
  if (status === 401 || status === 403) return 'auth';
  if (status === 408 || status === 504) return 'timeout';
  if (status === 429) return 'quota';
  return status >= 500 ? 'upstream' : 'invalid-response';
}

export function createEnvironmentBriefingHttpGateway({
  baseUrl,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  fetchImpl = fetch,
}: EnvironmentHttpGatewayOptions): EnvironmentBriefingGateway {
  const endpoint = resolveEndpoint(baseUrl);
  const boundedTimeout =
    Number.isInteger(timeoutMs) && timeoutMs >= 1_000 && timeoutMs <= 30_000
      ? timeoutMs
      : DEFAULT_TIMEOUT_MS;

  return {
    async fetch(grid: KmaGrid): Promise<EnvironmentBriefingPayload> {
      if (!isValidKmaGrid(grid)) {
        throw new EnvironmentGatewayError('invalid-response');
      }
      const abortController = new AbortController();
      const timeout = setTimeout(() => abortController.abort(), boundedTimeout);
      try {
        const response = await fetchImpl(endpoint, {
          method: 'POST',
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ schemaVersion: 1, nx: grid.nx, ny: grid.ny }),
          signal: abortController.signal,
        });
        if (!response.ok) {
          throw new EnvironmentGatewayError(mapHttpFailure(response.status));
        }
        const contentLength = Number(response.headers.get('content-length'));
        if (Number.isFinite(contentLength) && contentLength > MAX_RESPONSE_BYTES) {
          throw new EnvironmentGatewayError('invalid-response');
        }
        const bytes = await response.arrayBuffer();
        if (bytes.byteLength > MAX_RESPONSE_BYTES) {
          throw new EnvironmentGatewayError('invalid-response');
        }
        let raw: string;
        try {
          raw = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
        } catch {
          throw new EnvironmentGatewayError('invalid-response');
        }
        let value: unknown;
        try {
          value = JSON.parse(raw);
        } catch {
          throw new EnvironmentGatewayError('invalid-response');
        }
        const payload = parseEnvironmentBriefingPayload(value);
        if (!payload) throw new EnvironmentGatewayError('invalid-response');
        return payload;
      } catch (error) {
        if (error instanceof EnvironmentGatewayError) throw error;
        if (abortController.signal.aborted) {
          throw new EnvironmentGatewayError('timeout');
        }
        throw new EnvironmentGatewayError('upstream');
      } finally {
        clearTimeout(timeout);
      }
    },
  };
}
