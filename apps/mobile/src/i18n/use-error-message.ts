import { useCallback } from 'react';
import { useTranslations } from 'use-intl';
import { getErrorCode } from '@/lib/api-client';
import type { AppMessages } from './messages';

type ErrorCodeKey = keyof AppMessages['Errors']['code'];

/**
 * ADR 0012: chọn chữ theo MÃ lỗi, không theo `message` của backend — `message` là tiếng Việt
 * cố định, không dịch được, và đổi bất cứ lúc nào mà không ai báo.
 */
export function useErrorMessage(): (error: unknown) => string {
  const t = useTranslations('Errors');

  return useCallback(
    (error: unknown) => {
      const code = getErrorCode(error);
      if (!code) return t('fallback');

      // Mã lỗi đến từ mạng nên chỉ là `string`; `t.has` mới là bộ chặn thật, ép kiểu ở đây
      // chỉ để nói với TypeScript rằng khoá nằm trong nhánh `code.*`.
      const key = `code.${code}` as `code.${ErrorCodeKey}`;
      return t.has(key) ? t(key) : t('fallback');
    },
    [t],
  );
}
