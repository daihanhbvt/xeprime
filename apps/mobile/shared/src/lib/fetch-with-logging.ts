import { getErrorCode, type FetchLike } from '@xeprime/api-client';
import { logger } from './logger';

/**
 * Ghi lại MỖI request HTTP — chỉ ở bản dev (`logger` im ở bản phát hành).
 *
 * Dòng log quan trọng nhất là URL đầy đủ: app native suy host từ Expo dev server, nên khi request
 * treo, câu hỏi đầu tiên luôn là "nó gọi vào đâu". `localhost` trên máy thật nghĩa là chính máy
 * đó, không phải máy dev — và triệu chứng của việc gọi nhầm host y hệt triệu chứng server chết.
 *
 * CHỈ ghi metadata. Không header, không body, không response — `Authorization` mang access
 * token, body đăng nhập mang mật khẩu, và response đăng nhập mang refresh token. Cả ba đều
 * không được xuống logcat/Console.app (ADR 0017). Cần xem body thì dùng Flipper hoặc Postman,
 * đừng nới hàm này.
 */

export function withHttpLogging(inner: FetchLike): FetchLike {
  return async (url, init = {}) => {
    const method = init.method ?? 'GET';
    const startedAt = Date.now();
    logger.debug(`→ ${method} ${url}`);

    try {
      const response = await inner(url, init);
      logger.debug(`← ${response.status} ${method} ${url} (${Date.now() - startedAt}ms)`);
      return response;
    } catch (error) {
      // Lỗi ở đây là request KHÔNG tới được server. Kèm thời gian đã đợi vì nó tự phân loại:
      // đúng bằng trần thời gian ⇒ gói bị thả rơi (firewall, sai host); vài mili giây ⇒ bị từ
      // chối thẳng (server chưa chạy, sai cổng).
      logger.warn(`✕ ${method} ${url} (${Date.now() - startedAt}ms)`, {
        code: getErrorCode(error) ?? 'UNKNOWN',
      });
      throw error;
    }
  };
}
