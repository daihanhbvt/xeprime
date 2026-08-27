import { API_ERROR_CODE, isApiError, type ApiErrorCode } from '@xeprime/types';
import type { FetchResponse } from './http';

/**
 * Mã lỗi phát sinh ở CLIENT, cố ý KHÔNG nằm trong `API_ERROR_CODE`: backend không bao giờ phát
 * chúng vì request còn chưa tới nơi. Tiền tố `CLIENT_` để nhìn log là biết ngay lỗi ở phía nào.
 *
 * Cả hai mã đã có bản dịch ở `Errors.code` của gốc message dùng chung, nên `useErrorMessage()`
 * của web lẫn native đều hiện đúng chữ mà không phải thêm gì.
 */
export const CLIENT_ERROR_CODE = {
  NETWORK_ERROR: 'CLIENT_NETWORK_ERROR',
  TIMEOUT: 'CLIENT_TIMEOUT',
} as const;

export type ClientErrorCode = (typeof CLIENT_ERROR_CODE)[keyof typeof CLIENT_ERROR_CODE];

/**
 * Lỗi API đã chuẩn hoá — MỘT lớp cho cả web và native.
 *
 * `code` là thứ nơi gọi nhánh theo (ADR 0012: giao diện dịch từ MÃ, không hiện `message` của
 * backend). `message` giữ nguyên để ghi log và để các khu chưa i18n hoá còn dùng tạm.
 */
export class ApiClientError extends Error {
  readonly code: ApiErrorCode | ClientErrorCode | string;
  readonly status: number;
  readonly details: unknown;

  constructor(params: {
    code: ApiErrorCode | ClientErrorCode | string;
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

/** Response lỗi → `ApiClientError`, ưu tiên envelope `{ error: { code, message, details } }`. */
export function toApiClientError(response: FetchResponse, body: unknown): ApiClientError {
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
 * `fetch` ném (mất mạng, DNS hỏng, server không bắt máy) → `ApiClientError` như mọi lỗi khác.
 *
 * `status: 0` là dấu hiệu "chưa từng có response": `isRetriableError` dựa vào nó, và nơi gọi
 * không phải phân biệt `TypeError` của fetch với lỗi có mã.
 */
export function toNetworkError(path: string, cause: unknown): ApiClientError {
  return new ApiClientError({
    code: CLIENT_ERROR_CODE.NETWORK_ERROR,
    // Thông điệp cho log — giao diện dịch từ `code` (ADR 0012), nên nó ở tiếng Anh như mọi log.
    message: `Request to ${path} failed`,
    status: 0,
    details: cause,
  });
}

/**
 * Mã lỗi nếu là lỗi API, `null` với mọi thứ khác (lỗi lập trình).
 *
 * CỐ Ý không có `getErrorMessage` ở package này: câu chữ hiện cho người dùng là việc của tầng
 * giao diện và phải đi qua bộ dịch của nó (ADR 0012). Bản `getErrorMessage` cũ ở `apps/web` giữ
 * nguyên chỗ cũ cùng chuỗi dự phòng tiếng Việt của nó, để `pnpm i18n:audit` còn đếm được nó là
 * nợ chưa trả — chuyển nó vào đây là làm nợ đó tàng hình.
 */
export function getErrorCode(error: unknown): ApiErrorCode | ClientErrorCode | string | null {
  return error instanceof ApiClientError ? error.code : null;
}

/** Phiên không còn hiệu lực — nơi gọi nên đá về đăng nhập, không phải hiện lỗi đỏ. */
export function isUnauthenticated(error: unknown): boolean {
  const code = getErrorCode(error);
  return code === API_ERROR_CODE.UNAUTHENTICATED || code === API_ERROR_CODE.SESSION_EXPIRED;
}

/**
 * Lỗi đáng thử lại: mạng/timeout (`status: 0`) và 5xx. 4xx là sai từ phía client, gọi lại vẫn sai.
 *
 * Lỗi KHÔNG phải `ApiClientError` thì cứ thử lại: nó không đi qua tầng này nên ta không biết gì
 * về nó, và đoán "hỏng vĩnh viễn" sẽ biến một trục trặc thoáng qua thành màn lỗi.
 */
export function isRetriableError(error: unknown): boolean {
  if (!(error instanceof ApiClientError)) return true;
  return error.status === 0 || error.status >= 500;
}
