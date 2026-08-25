import { API_ERROR_CODE, type ApiSuccess, type PaginationMeta } from '@xeprime/types';
import { ApiClientError, toApiClientError, toNetworkError } from './errors';
import { platformFetch, type AbortSignalLike, type FetchLike, type FetchResponse } from './http';
import { buildUrl, normalizeBaseUrl, type QueryParams } from './url';
import { webAuthTransport, type AuthTransport } from './transport';

export interface ApiRequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  headers?: Record<string, string>;
  query?: QueryParams;
  body?: unknown;
  signal?: AbortSignalLike;
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

export interface ApiClientOptions {
  /**
   * Gốc URL của API, ví dụ `http://localhost:4000`.
   *
   * Package dùng chung KHÔNG đọc biến môi trường: `NEXT_PUBLIC_API_URL` chỉ tồn tại trong bundle
   * Next, còn RN có cơ chế cấu hình riêng (`expo-constants`/`app.config`). Mỗi app tự đọc env
   * của mình rồi truyền vào đây.
   */
  baseUrl: string;
  /** Mặc định: web transport (cookie httpOnly — ADR 0002). */
  transport?: AuthTransport;
  /**
   * Ghi đè `fetch` — cho test, cho môi trường phải polyfill, và cho CHÍNH SÁCH của từng app.
   *
   * Trần thời gian đi qua đây chứ không thành một tuỳ chọn của package: `setTimeout` và
   * `AbortController` không nằm trong `lib: ES2023` mà package này nhắm tới, và "bao lâu là quá
   * lâu" khác nhau giữa một tab trình duyệt và một máy đang chuyển từ 4G sang wifi. App bọc
   * `fetch` của nó rồi ném `ApiClientError` — client giữ nguyên mã đó, không bọc lại.
   */
  fetch?: FetchLike;
}

export interface ApiClient {
  readonly baseUrl: string;
  /** Gọi API và trả nguyên lớp bọc, dùng khi cần `meta` (phân trang). */
  request<TData>(path: string, options?: ApiRequestOptions): Promise<ApiSuccess<TData>>;
  get<TData>(path: string, query?: QueryParams): Promise<TData>;
  post<TData>(path: string, body?: unknown): Promise<TData>;
  patch<TData>(path: string, body?: unknown): Promise<TData>;
  put<TData>(path: string, body?: unknown): Promise<TData>;
  delete<TData>(path: string, body?: unknown): Promise<TData>;
  fetchPage<T>(
    path: string,
    query: QueryParams,
    fallbackLimit: number,
    options?: { signal?: AbortSignalLike },
  ): Promise<Paged<T>>;
}

async function readBody(response: FetchResponse): Promise<unknown> {
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
 * Một client độc lập. Dùng hàm này khi app cần NHIỀU client (nhiều môi trường, nhiều người dùng
 * cùng lúc) hoặc trong test; app một-người-dùng gọi `configureApiClient()` một lần lúc khởi động
 * rồi dùng các hàm `apiGet`/`apiPost`/… như trước.
 */
export function createApiClient(options: ApiClientOptions): ApiClient {
  const baseUrl = normalizeBaseUrl(options.baseUrl);
  const transport = options.transport ?? webAuthTransport();
  const fetchImpl = options.fetch;

  async function request<TData>(
    path: string,
    requestOptions: ApiRequestOptions = {},
  ): Promise<ApiSuccess<TData>> {
    const { method = 'GET', query, body, headers, signal } = requestOptions;
    const auth = await transport.credentials();
    const doFetch = fetchImpl ?? platformFetch();

    let response: FetchResponse;
    try {
      response = await doFetch(buildUrl(baseUrl, path, query), {
        method,
        headers: {
          Accept: 'application/json',
          ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
          ...auth.headers,
          ...headers,
        },
        ...(auth.credentials ? { credentials: auth.credentials } : {}),
        ...(signal ? { signal } : {}),
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
    } catch (cause) {
      // Bản `fetch` do app truyền vào đã phân loại rồi (trần thời gian → `CLIENT_TIMEOUT`) —
      // bọc lại lần nữa sẽ nuốt mất mã chính xác hơn của nó.
      throw cause instanceof ApiClientError ? cause : toNetworkError(path, cause);
    }

    const payload = await readBody(response);

    if (!response.ok) {
      throw toApiClientError(response, payload);
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

  return {
    baseUrl,
    request,
    async get<TData>(path: string, query?: QueryParams): Promise<TData> {
      const result = await request<TData>(path, { method: 'GET', ...(query ? { query } : {}) });
      return result.data;
    },
    async post<TData>(path: string, body?: unknown): Promise<TData> {
      const result = await request<TData>(path, { method: 'POST', body });
      return result.data;
    },
    async patch<TData>(path: string, body?: unknown): Promise<TData> {
      const result = await request<TData>(path, { method: 'PATCH', body });
      return result.data;
    },
    async put<TData>(path: string, body?: unknown): Promise<TData> {
      const result = await request<TData>(path, { method: 'PUT', body });
      return result.data;
    },
    /**
     * `body` tuỳ chọn: một số thao tác xoá cần LÝ DO đi kèm (gỡ khoản phát sinh, huỷ có audit) —
     * nhét lý do vào query string thì nó lọt vào log truy cập, nên nó đi trong body.
     */
    async delete<TData>(path: string, body?: unknown): Promise<TData> {
      const result = await request<TData>(path, { method: 'DELETE', body });
      return result.data;
    },
    /**
     * Gọi một endpoint danh sách có phân trang.
     *
     * Đây là chỗ DUY NHẤT quyết định meta dự phòng trông thế nào. Trước đây 23 file mỗi file tự
     * lặp lại đúng khối `?? { page: 1, limit: X, total: res.data.length, hasNext: false }` — cùng
     * một quyết định viết ở 23 nơi là 23 dịp để chúng trôi khỏi nhau khi có ai sửa một chỗ.
     *
     * `signal` để `useInfiniteQuery` huỷ được request khi người dùng cuộn nhanh qua nhiều trang.
     */
    async fetchPage<T>(
      path: string,
      query: QueryParams,
      fallbackLimit: number,
      pageOptions?: { signal?: AbortSignalLike },
    ): Promise<Paged<T>> {
      const res = await request<T[]>(path, {
        query,
        ...(pageOptions?.signal ? { signal: pageOptions.signal } : {}),
      });
      return {
        items: res.data,
        meta:
          (res.meta as PaginationMeta | undefined) ??
          fullPageMeta(query, fallbackLimit, res.data.length),
      };
    },
  };
}

/*
 * ── Client mặc định ────────────────────────────────────────────────────────────────────────
 *
 * Giữ ĐÚNG hình dạng API cũ của `apps/web/src/services/api-client.ts` (`apiGet`, `apiPost`, …)
 * nên 36 file `api.ts` của feature không phải sửa một dòng nào.
 *
 * Trạng thái module ở đây chỉ có `baseUrl` + `transport` — cả hai là CẤU HÌNH của app, không phải
 * bí mật của một người dùng. Access token của native nằm trong closure `getAccessToken` mà app
 * truyền vào, và nó đọc từ Keychain/Keystore mỗi request.
 */
let defaultClient: ApiClient | null = null;

export function configureApiClient(options: ApiClientOptions): ApiClient {
  defaultClient = createApiClient(options);
  return defaultClient;
}

export function getApiClient(): ApiClient {
  if (!defaultClient) {
    throw new Error(
      '@xeprime/api-client: chưa cấu hình. Gọi configureApiClient({ baseUrl, transport }) ' +
        'một lần lúc khởi động app.',
    );
  }
  return defaultClient;
}

/** Gốc URL của client mặc định — cho vài chỗ phải tự gọi `fetch` (SSR `next/cache`, ảnh). */
export function getApiBaseUrl(): string {
  return getApiClient().baseUrl;
}

export function apiRequest<TData>(
  path: string,
  options?: ApiRequestOptions,
): Promise<ApiSuccess<TData>> {
  return getApiClient().request<TData>(path, options);
}

export function apiGet<TData>(path: string, query?: QueryParams): Promise<TData> {
  return getApiClient().get<TData>(path, query);
}

export function apiPost<TData>(path: string, body?: unknown): Promise<TData> {
  return getApiClient().post<TData>(path, body);
}

export function apiPatch<TData>(path: string, body?: unknown): Promise<TData> {
  return getApiClient().patch<TData>(path, body);
}

export function apiPut<TData>(path: string, body?: unknown): Promise<TData> {
  return getApiClient().put<TData>(path, body);
}

export function apiDelete<TData>(path: string, body?: unknown): Promise<TData> {
  return getApiClient().delete<TData>(path, body);
}

export function fetchPage<T>(
  path: string,
  query: QueryParams,
  fallbackLimit: number,
  options?: { signal?: AbortSignalLike },
): Promise<Paged<T>> {
  return getApiClient().fetchPage<T>(path, query, fallbackLimit, options);
}
