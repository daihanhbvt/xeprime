/**
 * HTTP status mà CHÍNH web (Next.js — `proxy.ts`, Route Handler) tự trả. Bản web của `HttpStatus`
 * bên NestJS: không import `@nestjs/common` vào bundle Next.js. Chỉ liệt kê mã đang dùng.
 *
 * Đây là HTTP status, KHÔNG phải mã lỗi nghiệp vụ — lỗi của API đọc bằng `API_ERROR_CODE` trong body.
 */
export const HTTP_STATUS = {
  /** Chuyển hướng tạm, không giữ phương thức/body — đủ cho deep link về app. */
  FOUND: 302,
  /** Chuyển hướng tạm, GIỮ phương thức và body — URL cũ có thể nhận POST. */
  TEMPORARY_REDIRECT: 307,
} as const;
