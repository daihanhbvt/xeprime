import { API_ERROR_CODE, type AuthProvider } from '@xeprime/types';
import type { VerifiedIdentity } from './identity';
import { SocialAuthFailure } from './social-auth.error';

/** Tham số dựng URL màn đồng ý của provider. */
export interface AuthorizeParams {
  state: string;
  /** PKCE S256 — bản băm của `codeVerifier` đang nằm trong `oauth_states`. */
  codeChallenge: string;
  nonce: string;
  redirectUri: string;
  /** `vi` | `en` — màn đồng ý do PROVIDER render, nên ngôn ngữ phải nói ra ở đây (ADR 0012). */
  locale: string;
}

/** Tham số đổi `code` lấy danh tính. Chạy SERVER↔SERVER, client không thấy gì trong này. */
export interface ExchangeParams {
  code: string;
  codeVerifier: string;
  nonce: string;
  redirectUri: string;
}

/**
 * Một nhà cung cấp đăng nhập — ADR 0019.
 *
 * Hai phương thức là hai chặng của cùng một lần bấm nút: `authorizeUrl` đưa người dùng ĐI,
 * `exchange` nhận họ VỀ. Provider không biết gì về `users`, session, hay cookie — nó chỉ trả lời
 * đúng một câu: "người vừa đồng ý là ai".
 *
 * Thêm Apple Sign In (bắt buộc khi app iOS lên store) = thêm một lớp ở đây, không sửa gì khác.
 */
export abstract class SocialProvider {
  abstract readonly key: AuthProvider;
  abstract authorizeUrl(params: AuthorizeParams): string;
  abstract exchange(params: ExchangeParams): Promise<VerifiedIdentity>;
}

/**
 * Bao lâu thì bỏ cuộc khi gọi sang Google/Facebook.
 *
 * Có timeout vì người dùng đang ĐỨNG ĐỢI trong một lần điều hướng trình duyệt: một request treo
 * là một tab trắng không có gì để bấm. 10 giây đủ rộng cho một lần đổi token bình thường và đủ
 * ngắn để còn kịp redirect về kèm thông báo.
 */
const PROVIDER_TIMEOUT_MS = 10_000;

/**
 * Gọi HTTP sang provider rồi parse JSON, quy MỌI kiểu hỏng về `SOCIAL_EXCHANGE_FAILED`.
 *
 * Gom vào một chỗ vì ba kiểu hỏng dưới đây trông rất khác nhau trong code nhưng giống hệt nhau
 * với người dùng: mạng chết, provider trả 4xx/5xx, và provider trả 200 kèm một body không phải
 * JSON. Xử lý riêng lẻ ở từng provider là cách một trong ba lọt lưới rồi thành lỗi 500.
 */
export async function fetchProviderJson(
  url: string,
  init: RequestInit,
  context: string,
): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(url, { ...init, signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS) });
  } catch (err) {
    const reason = err instanceof Error ? err.message : 'không rõ';
    throw new SocialAuthFailure(
      API_ERROR_CODE.SOCIAL_EXCHANGE_FAILED,
      `${context}: không gọi được provider (${reason})`,
    );
  }

  const body: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    throw new SocialAuthFailure(
      API_ERROR_CODE.SOCIAL_EXCHANGE_FAILED,
      `${context}: provider trả HTTP ${response.status}`,
    );
  }
  if (body === null || typeof body !== 'object') {
    throw new SocialAuthFailure(
      API_ERROR_CODE.SOCIAL_EXCHANGE_FAILED,
      `${context}: body không phải JSON object`,
    );
  }

  return body;
}

/** Đọc một trường chuỗi bắt buộc, không tin hình dạng response của provider. */
export function requireString(body: unknown, field: string, context: string): string {
  const value = (body as Record<string, unknown>)[field];
  if (typeof value !== 'string' || value.length === 0) {
    throw new SocialAuthFailure(
      API_ERROR_CODE.SOCIAL_EXCHANGE_FAILED,
      `${context}: thiếu trường "${field}"`,
    );
  }
  return value;
}

/** Đọc một trường chuỗi tuỳ chọn; giá trị rỗng/không phải chuỗi coi như vắng mặt. */
export function optionalString(body: unknown, field: string): string | null {
  const value = (body as Record<string, unknown>)[field];
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}
