import { useCallback } from 'react';
import { useTranslations } from 'use-intl';
import { getErrorCode } from '@/lib/api-client';
import { logger } from '@/lib/logger';
import type { AppMessages } from './messages';

type ErrorCodeKey = keyof AppMessages['Errors']['code'];

/**
 * Lỗi từ API → câu tiếng người theo ngôn ngữ đang dùng — bản native của `useErrorMessage` bên web
 * (`apps/web/src/i18n/use-error-message.ts`), CÙNG thứ tự.
 *
 * ## Nguồn chữ là MÃ, không phải `message` của backend (ADR 0012)
 *
 * Backend trả `{ code, message }`, và `message` của nó là **tiếng Việt**. Hiện thẳng nó thì giao
 * diện tiếng Anh nhận một câu tiếng Việt đúng vào lúc người dùng đang gặp sự cố — và ngay cả ở
 * tiếng Việt, câu đó KHÁC câu web đã soạn cho cùng mã trong `Errors.code.*` (web có test canh mọi
 * mã đều có câu ở cả hai ngôn ngữ: `apps/web/src/i18n/error-codes.test.ts`).
 *
 * Tới 25/09/2026 bản native còn đi ngược: ưu tiên `message` của backend, với lý do câu đó mang dữ
 * liệu ("đợi 38s"). Web đã chọn bỏ dữ liệu đó để giữ đúng ngôn ngữ (`OTP_COOLDOWN` → câu chung),
 * nên app theo cùng lựa chọn — hai bề mặt, một câu cho một sự cố.
 *
 * `message` kỹ thuật của backend vẫn hữu ích để lần dấu, nên nó đi vào log chứ không lên màn hình.
 *
 * ## Lỗi không có response
 *
 * `toNetworkError` của client native dựng `ApiClientError` với mã `CLIENT_NETWORK_ERROR` /
 * `CLIENT_TIMEOUT` (đều có câu dịch), nên nhánh MÃ ở trên đã bắt chúng. `TypeError` trần (fetch hỏng
 * ngoài client) rơi về `Errors.network`, đúng như web.
 *
 * Mã lạ (backend mới hơn app) rơi về câu chung — không bao giờ in mã thô cho người dùng đọc.
 */
export function useErrorMessage(): (error: unknown) => string {
  const t = useTranslations('Errors');

  return useCallback(
    (error: unknown) => {
      const code = getErrorCode(error);
      if (code) {
        // Mã lỗi đến từ mạng nên chỉ là `string`; `t.has` mới là bộ chặn thật, ép kiểu ở đây
        // chỉ để nói với TypeScript rằng khoá nằm trong nhánh `code.*`.
        const key = `code.${code}` as `code.${ErrorCodeKey}`;
        if (t.has(key)) return t(key);
      }

      if (error instanceof TypeError) return t('network');

      logger.warn('Lỗi chưa có câu dịch', {
        code,
        message: error instanceof Error ? error.message : null,
      });
      return t('fallback');
    },
    [t],
  );
}
