import { API_ERROR_CODE, isApiError, type ApiErrorCode, type ApiSuccess } from '@xeprime/types';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import {
  applyErrorInterceptors,
  applyRequestInterceptors,
  applyResponseInterceptors,
  type HttpMethod,
} from './http-interceptors';

const DEFAULT_API_PORT = 4000;
/** Emulator Android không dùng chung loopback với máy dev — 10.0.2.2 mới trỏ về host. */
const ANDROID_EMULATOR_HOST = '10.0.2.2';
/** Mạng di động chập chờn không báo lỗi, nó treo. Không có trần thời gian thì UI treo theo. */
const DEFAULT_TIMEOUT_MS = 15_000;

/**
 * Thiếu `EXPO_PUBLIC_API_URL` thì suy host từ Expo dev server: thiết bị thật không gọi được
 * `localhost` của máy dev, phải dùng đúng IP LAN mà Metro đang phục vụ.
 */
export function getApiBaseUrl(): string {
  const configured = process.env.EXPO_PUBLIC_API_URL?.trim();
  if (configured) return configured.replace(/\/+$/, '');

  const [devHost] = (Constants.expoConfig?.hostUri ?? '').split(':');
  const host = devHost || 'localhost';
  const isLoopback = host === 'localhost' || host === '127.0.0.1';
  const target = isLoopback && Platform.OS === 'android' ? ANDROID_EMULATOR_HOST : host;

  return `http://${target}:${DEFAULT_API_PORT}`;
}

/**
 * Mã lỗi phát sinh ở CLIENT, không có trong `API_ERROR_CODE` của backend vì backend không
 * bao giờ phát chúng — request còn chưa tới nơi. Tiền tố `CLIENT_` để nhìn log là biết ngay
 * lỗi nằm ở phía nào.
 */
export const CLIENT_ERROR_CODE = {
  NETWORK_ERROR: 'CLIENT_NETWORK_ERROR',
  TIMEOUT: 'CLIENT_TIMEOUT',
} as const;

export type ClientErrorCode = (typeof CLIENT_ERROR_CODE)[keyof typeof CLIENT_ERROR_CODE];

/**
 * `(string & {})` giữ được gợi ý autocomplete của hai union trên mà vẫn nhận mã lạ: backend
 * có thể thêm mã bất cứ lúc nào và client cũ KHÔNG được vỡ vì điều đó.
 */
export type AnyErrorCode = ApiErrorCode | ClientErrorCode | (string & {});

export type QueryParamValue = string | number | boolean | null | undefined;
export type QueryParams = Readonly<Record<string, QueryParamValue>>;

export class ApiClientError extends Error {
  readonly code: AnyErrorCode;
  readonly status: number;
  readonly details: unknown;

  constructor(params: { code: AnyErrorCode; message: string; status: number; details?: unknown }) {
    super(params.message);
    this.name = 'ApiClientError';
    this.code = params.code;
    this.status = params.status;
    this.details = params.details;
  }
}

export interface ApiRequestOptions {
  method?: HttpMethod;
  headers?: Record<string, string>;
  query?: QueryParams;
  body?: unknown;
  signal?: AbortSignal;
  /** Đặt 0 để tắt trần thời gian — chỉ dùng cho upload/download dài. */
  timeoutMs?: number;
}

function buildUrl(path: string, query?: QueryParams): string {
  const url = `${getApiBaseUrl()}${path.startsWith('/') ? path : `/${path}`}`;
  if (!query) return url;

  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === '') continue;
    search.set(key, String(value));
  }

  const qs = search.toString();
  return qs ? `${url}?${qs}` : url;
}

async function readBody(response: Response): Promise<unknown> {
  if (response.status === 204) return null;

  const text = await response.text();
  if (!text) return null;

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function toApiError(response: Response, body: unknown): ApiClientError {
  if (isApiError(body)) {
    return new ApiClientError({
      code: body.error.code,
      message: body.error.message,
      status: response.status,
      details: body.error.details,
    });
  }

  return new ApiClientError({
    code: response.status === 401 ? API_ERROR_CODE.UNAUTHENTICATED : API_ERROR_CODE.INTERNAL_ERROR,
    message: typeof body === 'string' && body ? body : `HTTP ${response.status}`,
    status: response.status,
  });
}

/**
 * Gộp trần thời gian với `signal` của chỗ gọi (TanStack Query huỷ query bằng signal riêng).
 *
 * `AbortSignal.any`/`AbortSignal.timeout` CỐ Ý không dùng: Hermes không đảm bảo có chúng ở
 * mọi bản RN, và lỗi sẽ chỉ lộ ra trên máy thật chứ không phải trong Jest (chạy trên Node).
 */
function withTimeout(
  timeoutMs: number,
  external: AbortSignal | undefined,
): { signal: AbortSignal; dispose: () => void; timedOut: () => boolean } {
  const controller = new AbortController();
  let timedOut = false;

  const timer =
    timeoutMs > 0
      ? setTimeout(() => {
          timedOut = true;
          controller.abort();
        }, timeoutMs)
      : undefined;

  const forward = () => controller.abort();
  if (external) {
    if (external.aborted) forward();
    else external.addEventListener('abort', forward);
  }

  return {
    signal: controller.signal,
    timedOut: () => timedOut,
    dispose: () => {
      if (timer) clearTimeout(timer);
      external?.removeEventListener('abort', forward);
    },
  };
}

export async function apiRequest<TData>(
  path: string,
  options: ApiRequestOptions = {},
): Promise<ApiSuccess<TData>> {
  const { method = 'GET', query, body, headers, signal, timeoutMs = DEFAULT_TIMEOUT_MS } = options;

  const request = await applyRequestInterceptors({
    path,
    method,
    url: buildUrl(path, query),
    headers: {
      Accept: 'application/json',
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...headers,
    },
    body,
  });

  const abort = withTimeout(timeoutMs, signal);

  let response: Response;
  try {
    response = await fetch(request.url, {
      method: request.method,
      // ADR 0002: session là cookie httpOnly. Trên iOS/Android cookie do cookie store của hệ
      // điều hành gửi kèm, cờ này chỉ có tác dụng ở bản web của Expo.
      credentials: 'include',
      headers: request.headers,
      ...(request.body === undefined ? {} : { body: JSON.stringify(request.body) }),
      signal: abort.signal,
    });
  } catch (cause) {
    const error = new ApiClientError({
      code: abort.timedOut() ? CLIENT_ERROR_CODE.TIMEOUT : CLIENT_ERROR_CODE.NETWORK_ERROR,
      message: abort.timedOut() ? `Request to ${path} timed out` : `Request to ${path} failed`,
      status: 0,
      details: cause,
    });
    await applyErrorInterceptors(error, request);
    throw error;
  } finally {
    abort.dispose();
  }

  await applyResponseInterceptors(response, request);

  const payload = await readBody(response);

  if (!response.ok) {
    const error = toApiError(response, payload);
    await applyErrorInterceptors(error, request);
    throw error;
  }

  if (payload === null) {
    return { data: undefined as unknown as TData };
  }

  if (typeof payload === 'object' && 'data' in payload) {
    return payload as ApiSuccess<TData>;
  }

  // Vi phạm hợp đồng ADR 0007 — không đoán mò. Message tiếng Anh vì nó chỉ vào log.
  const error = new ApiClientError({
    code: API_ERROR_CODE.INTERNAL_ERROR,
    message: `Response from ${path} does not follow the { data } envelope`,
    status: response.status,
    details: payload,
  });
  await applyErrorInterceptors(error, request);
  throw error;
}

export async function apiGet<TData>(path: string, query?: QueryParams): Promise<TData> {
  const result = await apiRequest<TData>(path, { method: 'GET', query });
  return result.data;
}

export async function apiPost<TData>(path: string, body?: unknown): Promise<TData> {
  const result = await apiRequest<TData>(path, { method: 'POST', body });
  return result.data;
}

export async function apiDelete<TData>(path: string, body?: unknown): Promise<TData> {
  const result = await apiRequest<TData>(path, { method: 'DELETE', body });
  return result.data;
}

export function getErrorCode(error: unknown): AnyErrorCode | null {
  return error instanceof ApiClientError ? error.code : null;
}

export function isUnauthenticated(error: unknown): boolean {
  const code = getErrorCode(error);
  return code === API_ERROR_CODE.UNAUTHENTICATED || code === API_ERROR_CODE.SESSION_EXPIRED;
}

/** Lỗi đáng thử lại: mạng/timeout/5xx. 4xx là sai từ phía client, gọi lại vẫn sai. */
export function isRetriableError(error: unknown): boolean {
  if (!(error instanceof ApiClientError)) return true;
  return error.status === 0 || error.status >= 500;
}
