import type { ApiClientError } from './api-client';

export type HttpMethod = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';

/**
 * Request đã dựng xong, TRƯỚC khi `fetch` chạy. Interceptor được phép sửa `url`/`headers`/
 * `body` tại chỗ hoặc trả về object mới.
 *
 * `path` giữ nguyên dạng gọi (`/auth/me`) chứ không phải URL đầy đủ — interceptor nào cần
 * nhánh theo endpoint thì so trên `path`, đừng parse ngược `url`.
 */
export interface HttpRequestContext {
  readonly path: string;
  readonly method: HttpMethod;
  url: string;
  headers: Record<string, string>;
  body?: unknown;
}

export type RequestInterceptor = (
  request: HttpRequestContext,
) => HttpRequestContext | Promise<HttpRequestContext>;

export type ResponseInterceptor = (
  response: Response,
  request: HttpRequestContext,
) => void | Promise<void>;

export type ErrorInterceptor = (
  error: ApiClientError,
  request: HttpRequestContext,
) => void | Promise<void>;

const requestInterceptors: RequestInterceptor[] = [];
const responseInterceptors: ResponseInterceptor[] = [];
const errorInterceptors: ErrorInterceptor[] = [];

function register<T>(list: T[], fn: T): () => void {
  list.push(fn);
  return () => {
    const index = list.indexOf(fn);
    if (index >= 0) list.splice(index, 1);
  };
}

/**
 * Chỗ cắm cho phiên đăng nhập, request-id, app version… Trả về hàm gỡ đăng ký để test
 * không rò rỉ interceptor sang nhau.
 */
export function addRequestInterceptor(fn: RequestInterceptor): () => void {
  return register(requestInterceptors, fn);
}

export function addResponseInterceptor(fn: ResponseInterceptor): () => void {
  return register(responseInterceptors, fn);
}

/** Chạy cho MỌI lỗi API — chỗ cắm cho logout-on-401, log, báo cáo crash. */
export function addErrorInterceptor(fn: ErrorInterceptor): () => void {
  return register(errorInterceptors, fn);
}

/** Chỉ dùng trong test: registry là state toàn cục, rò một interceptor là hỏng file test khác. */
export function resetInterceptors(): void {
  requestInterceptors.length = 0;
  responseInterceptors.length = 0;
  errorInterceptors.length = 0;
}

export async function applyRequestInterceptors(
  request: HttpRequestContext,
): Promise<HttpRequestContext> {
  let current = request;
  for (const intercept of requestInterceptors) {
    current = await intercept(current);
  }
  return current;
}

export async function applyResponseInterceptors(
  response: Response,
  request: HttpRequestContext,
): Promise<void> {
  for (const intercept of responseInterceptors) {
    await intercept(response, request);
  }
}

/**
 * Lỗi của một interceptor KHÔNG được nuốt mất lỗi gốc — chỗ gọi cần thấy `ApiClientError`
 * thật, không phải lỗi phụ của bộ ghi log.
 */
export async function applyErrorInterceptors(
  error: ApiClientError,
  request: HttpRequestContext,
): Promise<void> {
  for (const intercept of errorInterceptors) {
    try {
      await intercept(error, request);
    } catch {
      // bỏ qua có chủ đích
    }
  }
}
