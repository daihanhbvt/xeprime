import { API_ERROR_CODE, isApiError, type ApiErrorCode, type ApiSuccess } from '@xeprime/types';

/**
 * Wrapper `fetch` duy nhất của web.
 *
 * ADR 0002: session là httpOnly cookie do NestJS phát, nên `credentials: 'include'` là bắt
 * buộc và KHÔNG có chỗ nào đọc token từ localStorage/JS.
 * ADR 0007: response luôn bọc `{ data, meta }` / `{ error }`, wrapper tự bóc `data` và ném
 * lỗi có `code` để chỗ gọi nhánh theo mã, không nhánh theo `message`.
 */
const DEFAULT_API_URL = 'http://localhost:4000';

export function getApiBaseUrl(): string {
  return (process.env.NEXT_PUBLIC_API_URL ?? DEFAULT_API_URL).replace(/\/+$/, '');
}

export type QueryParamValue = string | number | boolean | null | undefined;
export type QueryParams = Readonly<Record<string, QueryParamValue>>;

export class ApiClientError extends Error {
  readonly code: ApiErrorCode | string;
  readonly status: number;
  readonly details: unknown;

  constructor(params: {
    code: ApiErrorCode | string;
    message: string;
    status: number;
    details?: unknown;
  }) {
    super(params.message);
    this.name = 'ApiClientError';
    this.code = params.code;
    this.status = params.status;
    this.details = params.details;
  }
}

export interface ApiRequestOptions extends Omit<RequestInit, 'body' | 'method' | 'headers'> {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  /** Chỉ nhận dạng record để còn spread được; `Headers` instance không cần ở đây. */
  headers?: Record<string, string>;
  query?: QueryParams;
  body?: unknown;
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
    // Backend trả HTML/text (proxy lỗi, 502) — giữ nguyên để hiện ra message tử tế.
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

/** Gọi API và trả nguyên lớp bọc, dùng khi cần `meta` (phân trang). */
export async function apiRequest<TData>(
  path: string,
  options: ApiRequestOptions = {},
): Promise<ApiSuccess<TData>> {
  const { method = 'GET', query, body, headers, ...rest } = options;

  const response = await fetch(buildUrl(path, query), {
    ...rest,
    method,
    // ADR 0002: cookie phiên đi kèm mọi request, kể cả cross-origin web↔api lúc dev.
    credentials: 'include',
    headers: {
      Accept: 'application/json',
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...headers,
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });

  const payload = await readBody(response);

  if (!response.ok) {
    throw toApiError(response, payload);
  }

  if (payload === null) {
    // 204 No Content: DELETE /auth/session không trả body.
    return { data: undefined as unknown as TData };
  }

  if (typeof payload === 'object' && payload !== null && 'data' in payload) {
    return payload as ApiSuccess<TData>;
  }

  // Endpoint quên bọc `{ data }` — coi là lỗi hợp đồng, không đoán mò (ADR 0007).
  throw new ApiClientError({
    code: API_ERROR_CODE.INTERNAL_ERROR,
    message: `Response của ${path} không đúng convention { data }`,
    status: response.status,
    details: payload,
  });
}

export async function apiGet<TData>(path: string, query?: QueryParams): Promise<TData> {
  const result = await apiRequest<TData>(path, { method: 'GET', query });
  return result.data;
}

export async function apiPost<TData>(path: string, body?: unknown): Promise<TData> {
  const result = await apiRequest<TData>(path, { method: 'POST', body });
  return result.data;
}

export async function apiPatch<TData>(path: string, body?: unknown): Promise<TData> {
  const result = await apiRequest<TData>(path, { method: 'PATCH', body });
  return result.data;
}

export async function apiDelete<TData>(path: string): Promise<TData> {
  const result = await apiRequest<TData>(path, { method: 'DELETE' });
  return result.data;
}

const FALLBACK_ERROR_MESSAGE = 'Không kết nối được máy chủ. Thử lại sau.';

export function getErrorMessage(error: unknown): string {
  if (error instanceof ApiClientError) return error.message;
  if (error instanceof Error) return error.message || FALLBACK_ERROR_MESSAGE;
  return FALLBACK_ERROR_MESSAGE;
}

export function getErrorCode(error: unknown): ApiErrorCode | string | null {
  return error instanceof ApiClientError ? error.code : null;
}

export function isUnauthenticated(error: unknown): boolean {
  const code = getErrorCode(error);
  return code === API_ERROR_CODE.UNAUTHENTICATED || code === API_ERROR_CODE.SESSION_EXPIRED;
}
