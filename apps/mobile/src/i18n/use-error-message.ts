import { useCallback } from 'react';
import { useTranslations } from 'use-intl';
import { ApiClientError, getErrorCode } from '@/lib/api-client';
import { logger } from '@/lib/logger';
import type { AppMessages } from './messages';

type ErrorCodeKey = keyof AppMessages['Errors']['code'];

/**
 * Chữ hiện cho người dùng khi một lời gọi API hỏng.
 *
 * ## Ưu tiên `message` của backend — giống hệt `apps/web`
 *
 * `getErrorMessage` của web (`services/api-client.ts`) trả thẳng `error.message`, và app phải
 * nói cùng một câu với web cho cùng một sự cố. Quan trọng hơn: câu của backend mang DỮ LIỆU mà
 * bảng dịch không thể có — "Vui lòng đợi 38s trước khi gửi lại mã", "Thử lại sau 1 giờ". Dịch
 * theo MÃ sẽ biến cả hai thành một câu chung chung, và người dùng mất đúng thông tin họ cần để
 * biết phải làm gì tiếp.
 *
 * ## Nhưng chỉ khi backend THỰC SỰ nói
 *
 * `status > 0` nghĩa là đã có response từ server, tức `message` là câu backend soạn cho người
 * dùng. `status === 0` là lỗi do CHÍNH client dựng ra khi request không tới nơi
 * (`toNetworkError`), và `message` của nó là chuỗi log tiếng Anh — "Request to /auth/me failed".
 * Đưa câu đó lên màn hình là rò chi tiết kỹ thuật cho người dùng, nên nhánh này dịch từ mã
 * (`CLIENT_NETWORK_ERROR`, `CLIENT_TIMEOUT` đều đã có bản dịch).
 *
 * Đây là chỗ app **tốt hơn** web một chút: web hiện luôn cả chuỗi log đó.
 *
 * ## Hệ quả còn nợ
 *
 * Câu của backend hiện chỉ có tiếng Việt, nên giao diện tiếng Anh vẫn nhận câu tiếng Việt cho
 * lỗi có response — đúng thứ ADR 0012 muốn tránh. Trả nợ này cần backend trả về `details` có
 * cấu trúc (ví dụ `{ waitSec }`) để bảng dịch tự ghép số; tới lúc đó, bảng `Errors.code.*` bên
 * dưới vẫn giữ nguyên và trở thành nhánh chính.
 */
export function useErrorMessage(): (error: unknown) => string {
  const t = useTranslations('Errors');

  return useCallback(
    (error: unknown) => {
      if (error instanceof ApiClientError && error.status > 0 && error.message) {
        return error.message;
      }

      const code = getErrorCode(error);
      if (!code) {
        return t('fallback');
      }

      // Mã lỗi đến từ mạng nên chỉ là `string`; `t.has` mới là bộ chặn thật, ép kiểu ở đây
      // chỉ để nói với TypeScript rằng khoá nằm trong nhánh `code.*`.
      const key = `code.${code}` as `code.${ErrorCodeKey}`;
      if (t.has(key)) return t(key);

      logger.warn(`Mã lỗi chưa có bản dịch: ${code}`);
      return t('fallback');
    },
    [t],
  );
}
