'use client';

import { useTranslations } from 'next-intl';
import { useCallback } from 'react';
import { getErrorCode } from '@/services/api-client';

/** Kiểu khoá hợp lệ của bảng mã lỗi — xem ghi chú ở `keys.ts` về việc không dùng generic. */
type ErrorKey = Parameters<ReturnType<typeof useTranslations<'Errors'>>>[0];

/**
 * Lỗi từ API → câu tiếng người theo ngôn ngữ đang dùng.
 *
 * Backend trả `{ code, message }`, và `message` của nó là **tiếng Việt**. Trước đây web hiện
 * thẳng `message` đó; ở giao diện tiếng Anh việc này sinh ra đúng thứ tệ nhất — một alert
 * tiếng Việt nằm giữa một trang tiếng Anh, đúng vào lúc người dùng đang gặp sự cố.
 *
 * Nên nguồn chữ là MÃ, không phải câu: mã là hợp đồng ổn định giữa hai phía (`API_ERROR_CODE`),
 * còn câu thì mỗi ngôn ngữ tự viết. `message` kỹ thuật của backend vẫn hữu ích để lần dấu, nên
 * nó đi vào console chứ không đi lên màn hình.
 *
 * Mã lạ (backend mới hơn web) rơi về câu chung — không bao giờ in mã thô như `PLAN_LIMIT_REACHED`
 * ra cho người dùng đọc.
 */
export function useErrorMessage(): (error: unknown) => string {
  const t = useTranslations('Errors');

  return useCallback(
    (error: unknown) => {
      const code = getErrorCode(error);
      if (code) {
        const key = `code.${code}` as ErrorKey;
        if (t.has(key)) return t(key);
      }

      // Không có mã ⇒ hỏng ở tầng mạng (fetch ném TypeError), không phải lỗi nghiệp vụ.
      if (error instanceof TypeError) return t('network');

      if (process.env.NODE_ENV !== 'production' && error instanceof Error) {
        console.warn('[api] lỗi chưa có message dịch:', code, error.message);
      }
      return t('fallback');
    },
    [t],
  );
}
