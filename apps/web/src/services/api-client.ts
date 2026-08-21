import {
  API_ERROR_CODE,
  isApiError,
  type ApiErrorCode,
  type ApiSuccess,
  type PaginationMeta,
} from '@xeprime/types';

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
    // Vi phạm HỢP ĐỒNG giữa hai tầng — thông điệp cho lập trình viên đọc trong log, không
    // bao giờ lên giao diện (giao diện dịch từ `code`). Vì thế nó ở tiếng Anh như mọi log khác.
    message: `Response from ${path} does not follow the { data } envelope`,
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

export async function apiPut<TData>(path: string, body?: unknown): Promise<TData> {
  const result = await apiRequest<TData>(path, { method: 'PUT', body });
  return result.data;
}

/**
 * `body` tuỳ chọn: một số thao tác xoá cần LÝ DO đi kèm (gỡ khoản phát sinh, huỷ có audit) —
 * nhét lý do vào query string thì nó lọt vào log truy cập, nên nó đi trong body.
 */
export async function apiDelete<TData>(path: string, body?: unknown): Promise<TData> {
  const result = await apiRequest<TData>(path, { method: 'DELETE', body });
  return result.data;
}

/**
 * Một trang kết quả của endpoint danh sách — `{ data, meta }` đã bóc sẵn.
 *
 * Tên `items` (không phải `data`) là cố ý: chỗ gọi thường destructure cạnh các giá trị khác
 * (`const { items, meta } = ...`), và `data` ở đó không nói được nó là danh sách gì.
 */
export interface Paged<T> {
  items: T[];
  meta: PaginationMeta;
}

/**
 * Meta dự phòng khi endpoint KHÔNG trả `meta` — coi kết quả nhận được là trọn một trang.
 *
 * `page` đọc từ CHÍNH query đã gửi, không cứng `1`: với `useInfiniteQuery`, trang thứ ba mà báo
 * `page: 1` là nói dối về chỗ đang đứng. Không bịa `total` lớn hơn số dòng thật và không bao giờ
 * `hasNext: true` — một nút "trang sau" dẫn tới trang rỗng tệ hơn hẳn việc thiếu nút.
 */
function fullPageMeta(query: QueryParams, limit: number, count: number): PaginationMeta {
  return { page: Number(query.page) || 1, limit, total: count, hasNext: false };
}

/**
 * Gọi một endpoint danh sách có phân trang.
 *
 * Đây là chỗ DUY NHẤT quyết định meta dự phòng trông thế nào. Trước đây 23 file mỗi file tự lặp
 * lại đúng khối `?? { page: 1, limit: X, total: res.data.length, hasNext: false }` — cùng một
 * quyết định viết ở 23 nơi là 23 dịp để chúng trôi khỏi nhau khi có ai sửa một chỗ.
 *
 * `signal` để `useInfiniteQuery` huỷ được request khi người dùng cuộn nhanh qua nhiều trang.
 */
export async function fetchPage<T>(
  path: string,
  query: QueryParams,
  fallbackLimit: number,
  options?: { signal?: AbortSignal },
): Promise<Paged<T>> {
  const res = await apiRequest<T[]>(path, {
    query,
    ...(options?.signal ? { signal: options.signal } : {}),
  });
  return {
    items: res.data,
    meta:
      (res.meta as PaginationMeta | undefined) ??
      fullPageMeta(query, fallbackLimit, res.data.length),
  };
}

/**
 * @deprecated Dùng `useErrorMessage()` (`@/i18n/use-error-message`).
 *
 * Hàm này trả `message` do BACKEND sinh ra, và message đó là TIẾNG VIỆT — ở giao diện
 * tiếng Anh nó hiện một câu tiếng Việt ngay lúc người dùng đang gặp sự cố (ADR 0012 §4).
 * Bản dịch đúng đi từ MÃ lỗi. Giữ lại vì các khu chưa i18n hoá còn gọi; xoá khi
 * `pnpm i18n:audit` về 0.
 */
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
