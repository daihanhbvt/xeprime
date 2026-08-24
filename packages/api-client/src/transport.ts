import type { FetchCredentials } from './http';

/**
 * Phần của mỗi request nói "tôi là ai" — điểm DUY NHẤT mà web và native khác nhau.
 *
 * ADR 0002 đã nêu đúng hình này: *"App native sau này: cho AuthGuard chấp nhận thêm nguồn
 * `Authorization: Bearer`. Cùng một session, khác cách vận chuyển."* Một client, hai adapter.
 */
export interface AuthCredentials {
  /** Header thêm vào request. Web: rỗng. Native: `Authorization: Bearer <accessToken>`. */
  readonly headers?: Readonly<Record<string, string>>;
  /** Cờ cookie. Web: `include`. Native: bỏ trống (RN không có cookie jar đáng tin). */
  readonly credentials?: FetchCredentials;
}

export interface AuthTransport {
  /**
   * Gọi TRƯỚC MỖI request, và được `await`.
   *
   * Bất đồng bộ là bắt buộc, không phải để cho sang: native phải đọc access token từ bộ nhớ an
   * toàn (Keychain/Keystore) và có thể phải refresh nó trước khi đi tiếp. Một API đồng bộ sẽ
   * buộc app native tự cache token vào biến toàn cục — đúng thứ cần tránh.
   */
  credentials(): Promise<AuthCredentials> | AuthCredentials;
}

/**
 * Web — ADR 0002: session là httpOnly cookie do NestJS phát.
 *
 * Không có token nào trong tầm với của JS, nên transport này KHÔNG có trạng thái và dùng chung
 * được cho mọi request, mọi người dùng.
 */
export function webAuthTransport(): AuthTransport {
  return { credentials: () => ({ credentials: 'include' }) };
}

/**
 * Native — `Authorization: Bearer <accessToken>`.
 *
 * Nhận HÀM lấy token, không nhận token. Đây là điều kiện để package dùng chung không bao giờ giữ
 * bí mật của một người dùng cụ thể ở trạng thái module: token sống trong Keychain/Keystore của
 * app, và app quyết định khi nào refresh. Trả chuỗi rỗng/`null` = đi request không kèm danh tính
 * (endpoint `@Public()` vẫn phục vụ khách chưa đăng nhập).
 */
export function bearerAuthTransport(
  getAccessToken: () => Promise<string | null> | string | null,
): AuthTransport {
  return {
    async credentials(): Promise<AuthCredentials> {
      const token = await getAccessToken();
      if (!token) return {};
      return { headers: { Authorization: `Bearer ${token}` } };
    },
  };
}

/** Không kèm danh tính — cho script/test chỉ gọi endpoint công khai. */
export function anonymousAuthTransport(): AuthTransport {
  return { credentials: () => ({}) };
}
