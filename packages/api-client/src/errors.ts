import { API_ERROR_CODE, isApiError, type ApiErrorCode } from '@xeprime/types';
import type { FetchResponse } from './http';

/**
 * Lỗi API đã chuẩn hoá — MỘT lớp cho cả web và native.
 *
 * `code` là thứ nơi gọi nhánh theo (ADR 0012: giao diện dịch từ MÃ, không hiện `message` của
 * backend). `message` giữ nguyên để ghi log và để các khu chưa i18n hoá còn dùng tạm.
 */
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
 * Mã lỗi nếu là lỗi API, `null` với mọi thứ khác (lỗi mạng, lỗi lập trình).
 *
 * CỐ Ý không có `getErrorMessage` ở package này: câu chữ hiện cho người dùng là việc của tầng
 * giao diện và phải đi qua bộ dịch của nó (ADR 0012). Bản `getErrorMessage` cũ ở `apps/web` giữ
 * nguyên chỗ cũ cùng chuỗi dự phòng tiếng Việt của nó, để `pnpm i18n:audit` còn đếm được nó là
 * nợ chưa trả — chuyển nó vào đây là làm nợ đó tàng hình.
 */
export function getErrorCode(error: unknown): ApiErrorCode | string | null {
  return error instanceof ApiClientError ? error.code : null;
}

/** Phiên không còn hiệu lực — nơi gọi nên đá về đăng nhập, không phải hiện lỗi đỏ. */
export function isUnauthenticated(error: unknown): boolean {
  const code = getErrorCode(error);
  return code === API_ERROR_CODE.UNAUTHENTICATED || code === API_ERROR_CODE.SESSION_EXPIRED;
}
