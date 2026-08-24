import { ApiClientError, configureApiClient, webAuthTransport } from '@xeprime/api-client';

/**
 * Lối vào API của WEB — lớp vỏ mỏng quanh `@xeprime/api-client`.
 *
 * Toàn bộ phần chạy đã chuyển sang package dùng chung để app native dùng lại được cùng một
 * client (`docs/mobile-readiness-audit.md` §14.1). File này giữ lại đúng ba việc mà chỉ web có:
 *
 *  1. đọc `NEXT_PUBLIC_API_URL` — biến này chỉ tồn tại trong bundle Next, package dùng chung
 *     không được biết tới nó;
 *  2. cắm web transport — ADR 0002: session là httpOnly cookie, nên `credentials: 'include'`;
 *  3. `getErrorMessage` (xem docblock của nó ở dưới).
 *
 * 143 chỗ `import … from '@/services/api-client'` không phải sửa: mọi ký hiệu cũ vẫn xuất ra từ
 * đây với đúng chữ ký cũ.
 */
const DEFAULT_API_URL = 'http://localhost:4000';

/*
 * Cấu hình ở MODULE SCOPE, không lười.
 *
 * Mọi `api.ts` của feature đều import từ file này, nên module này luôn được nạp trước lời gọi
 * API đầu tiên — cả ở bundle client lẫn khi Server Component gọi API. Để lười (cấu hình trong
 * hàm gọi đầu tiên) là mở ra một trạng thái "chưa cấu hình" mà không có gì bắt buộc phải đi qua.
 */
configureApiClient({
  baseUrl: process.env.NEXT_PUBLIC_API_URL ?? DEFAULT_API_URL,
  transport: webAuthTransport(),
});

export {
  ApiClientError,
  apiDelete,
  apiGet,
  apiPatch,
  apiPost,
  apiPut,
  apiRequest,
  fetchPage,
  getApiBaseUrl,
  getErrorCode,
  isUnauthenticated,
  type ApiRequestOptions,
  type Paged,
  type QueryParams,
  type QueryParamValue,
} from '@xeprime/api-client';

/**
 * @deprecated Dùng `useErrorMessage()` (`@/i18n/use-error-message`).
 *
 * Hàm này trả `message` do BACKEND sinh ra, và message đó là TIẾNG VIỆT — ở giao diện
 * tiếng Anh nó hiện một câu tiếng Việt ngay lúc người dùng đang gặp sự cố (ADR 0012 §4).
 * Bản dịch đúng đi từ MÃ lỗi. Giữ lại vì các khu chưa i18n hoá còn gọi; xoá khi
 * `pnpm i18n:audit` về 0.
 *
 * CỐ Ý ở lại `apps/web` chứ không theo phần còn lại vào package dùng chung: chuỗi dự phòng dưới
 * đây là chữ hiện cho người dùng, và `pnpm i18n:audit` chỉ quét `apps/web/src`. Chuyển nó đi là
 * làm một khoản nợ i18n biến mất khỏi bản kiểm kê mà không hề được trả.
 */
const FALLBACK_ERROR_MESSAGE = 'Không kết nối được máy chủ. Thử lại sau.';

export function getErrorMessage(error: unknown): string {
  if (error instanceof ApiClientError) return error.message;
  if (error instanceof Error) return error.message || FALLBACK_ERROR_MESSAGE;
  return FALLBACK_ERROR_MESSAGE;
}
