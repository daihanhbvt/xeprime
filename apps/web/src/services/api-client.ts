import {
  ApiClientError,
  configureApiClient,
  webAuthTransport,
  type AuthTransport,
} from '@xeprime/api-client';
import { SUPPORT_CONTEXT_HEADER } from '@xeprime/types';
import { tenantSupportContextIdFromPath } from '@/constants/routes';
import { activeSupportContextId } from './active-support-context';

/**
 * Lối vào API của WEB — lớp vỏ mỏng quanh `@xeprime/api-client`.
 *
 * Toàn bộ phần chạy đã chuyển sang package dùng chung để app native dùng lại được cùng một
 * client (`docs/mobile-readiness-audit.md` §14.1). File này giữ lại đúng ba việc mà chỉ web có:
 *
 *  1. đọc `NEXT_PUBLIC_API_URL` — biến này chỉ tồn tại trong bundle Next, package dùng chung
 *     không được biết tới nó;
 *  2. cắm web transport — ADR 0002: session là httpOnly cookie, nên `credentials: 'include'`;
 *     cộng header phiên hỗ trợ gian hàng khi trang đang mở là một phiên (ADR 0050);
 *  3. `getErrorMessage` (xem docblock của nó ở dưới).
 *
 * 143 chỗ `import … from '@/services/api-client'` không phải sửa: mọi ký hiệu cũ vẫn xuất ra từ
 * đây với đúng chữ ký cũ.
 */
const DEFAULT_API_URL = 'http://localhost:4000';

/**
 * Cookie phiên như mọi request web (ADR 0002), cộng header `x-support-context` khi tab đang ở
 * trong một phiên hỗ trợ gian hàng của nhân sự nền tảng (ADR 0050).
 *
 * Nguồn id: phiên ĐANG MOUNT (`activeSupportContextId`, `SupportSessionBoundary` đăng ký trong
 * layout effect — trước mọi fetch của cây con) — đúng cả trong lúc điều hướng client, khi thanh địa
 * chỉ còn là trang cũ. Chưa có đăng ký (request đầu tiên sau F5, trước khi ranh giới commit) thì
 * suy từ URL. Id sai dạng không bao giờ được gắn.
 *
 * Header chỉ mang ID PHIÊN; tenant do server tra từ bản ghi phiên sau khi kiểm người + phiên đăng
 * nhập. Trên server (SSR) không bao giờ gắn — trang hỗ trợ là client.
 */
export function supportAwareWebTransport(
  pathname: () => string | null = () =>
    typeof window === 'undefined' ? null : window.location.pathname,
  registered: () => string | null = activeSupportContextId,
): AuthTransport {
  const base = webAuthTransport();
  return {
    credentials: async () => {
      const auth = await base.credentials();
      const path = pathname();
      const contextId =
        registered() ?? (path ? tenantSupportContextIdFromPath(path) : null);
      if (!contextId) return auth;
      return { ...auth, headers: { ...auth.headers, [SUPPORT_CONTEXT_HEADER]: contextId } };
    },
  };
}

/*
 * Cấu hình ở MODULE SCOPE, không lười.
 *
 * Mọi `api.ts` của feature đều import từ file này, nên module này luôn được nạp trước lời gọi
 * API đầu tiên — cả ở bundle client lẫn khi Server Component gọi API. Để lười (cấu hình trong
 * hàm gọi đầu tiên) là mở ra một trạng thái "chưa cấu hình" mà không có gì bắt buộc phải đi qua.
 */
configureApiClient({
  baseUrl: process.env.NEXT_PUBLIC_API_URL ?? DEFAULT_API_URL,
  transport: supportAwareWebTransport(),
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
  getErrorDetails,
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
