'use client';

import { useTranslations } from 'next-intl';
import { useCallback } from 'react';
import { getErrorCode, getRetryAfterSeconds } from '@/services/api-client';
import { useAppFormat } from './use-app-format';

/** Kiểu khoá hợp lệ của bảng mã lỗi — xem ghi chú ở `keys.ts` về việc không dùng generic. */
type ErrorKey = Parameters<ReturnType<typeof useTranslations<'Errors'>>>[0];

/**
 * "42 giây", "15 phút", "1 giờ 5 phút" — thời gian còn phải chờ của một lỗi "chờ rồi thử lại".
 * Dưới một phút thì đếm giây; từ một phút trở lên làm tròn LÊN tới phút (nói "15 phút" khi còn
 * 14 phút 10 giây là để người dùng quay lại đúng lúc đã mở, không sớm hơn).
 */
function useWaitDuration(): (seconds: number) => string {
  const t = useTranslations('Errors');
  const format = useAppFormat();
  return useCallback(
    (seconds: number) =>
      seconds < 60
        ? t('wait.seconds', { count: seconds })
        : format.minutesDuration(Math.ceil(seconds / 60)),
    [t, format],
  );
}

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
 *
 * Lỗi "chờ rồi thử lại" (`RATE_LIMITED`, `LOGIN_TEMPORARILY_LOCKED`, `OTP_COOLDOWN`,
 * `OTP_TOO_MANY`) mang `details.retryAfterSeconds` ⇒ dùng câu ở `codeWithWait`, nói ĐÚNG bao lâu
 * nữa — "thử lại sau ít giây" khi thật ra phải chờ cả phút là cách chắc nhất để người dùng bấm lại
 * và bị chặn tiếp. Không có con số thì rơi về câu thường ở `code`.
 */
export function useErrorMessage(): (error: unknown) => string {
  const t = useTranslations('Errors');
  const waitDuration = useWaitDuration();

  return useCallback(
    (error: unknown) => {
      const code = getErrorCode(error);
      if (code) {
        const retryAfter = getRetryAfterSeconds(error);
        const waitKey = `codeWithWait.${code}` as ErrorKey;
        if (retryAfter !== null && t.has(waitKey)) {
          return t(waitKey, { wait: waitDuration(retryAfter) });
        }
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
    [t, waitDuration],
  );
}

/**
 * Cùng bảng chữ, nhưng vào bằng MÃ TRẦN thay vì một đối tượng lỗi.
 *
 * Cần thiết vì không phải mã nào cũng đến từ một lời gọi `fetch`: đăng nhập mạng xã hội là một
 * lần rời trang, nên lỗi của nó quay về trong `?authError=<mã>` chứ không phải trong một
 * `ApiClientError` (ADR 0019). Vẫn đọc đúng namespace `Errors` — hai đường vào, một bảng chữ.
 */
export function useErrorCodeMessage(): (code: string | null | undefined) => string {
  const t = useTranslations('Errors');

  return useCallback(
    (code: string | null | undefined) => {
      if (code) {
        const key = `code.${code}` as ErrorKey;
        if (t.has(key)) return t(key);
      }
      return t('fallback');
    },
    [t],
  );
}
