import { ApiClientError } from '@/services/api-client';

/**
 * Mã HTTP của một lỗi gọi API — `null` khi lỗi không đến từ API (mạng, lỗi code).
 *
 * Một chỗ đọc, để các màn không mỗi nơi tự ép kiểu `(error as { status })` rồi lệch nhau khi lớp
 * lỗi đổi hình dạng.
 */
export function httpStatusOf(error: unknown): number | null {
  return error instanceof ApiClientError ? error.status : null;
}

/** 403 — người xem thiếu quyền: hiện trạng thái "không có quyền", không có nút thử lại. */
export function isForbiddenError(error: unknown): boolean {
  return httpStatusOf(error) === 403;
}

/** 404 — bản ghi không tồn tại (link cũ, đã xoá): thử lại không bao giờ thành công. */
export function isNotFoundError(error: unknown): boolean {
  return httpStatusOf(error) === 404;
}

/** Lỗi 4xx là câu trả lời cuối của server — thử lại chỉ làm chậm màn báo lỗi. */
export function isClientError(error: unknown): boolean {
  const status = httpStatusOf(error);
  return status !== null && status >= 400 && status < 500;
}
