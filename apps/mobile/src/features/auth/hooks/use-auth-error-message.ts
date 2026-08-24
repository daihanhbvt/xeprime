import { useCallback } from 'react';
import { useTranslations } from 'use-intl';
import type { AppMessages } from '@/i18n/messages';
import { useErrorMessage } from '@/i18n/use-error-message';
import { getErrorCode } from '@/lib/api-client';

type AuthErrorKey = keyof AppMessages['Auth']['errors'];

/** Chỉ những mã màn đăng nhập cần nói khác lớp chung; còn lại rơi về `Errors.code.*`. */
export function useAuthErrorMessage(): (error: unknown) => string {
  const t = useTranslations('Auth.errors');
  const errorMessage = useErrorMessage();

  return useCallback(
    (error: unknown) => {
      const code = getErrorCode(error) as AuthErrorKey | null;
      return code && t.has(code) ? t(code) : errorMessage(error);
    },
    [t, errorMessage],
  );
}
