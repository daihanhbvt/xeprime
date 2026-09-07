'use client';

import { useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { PASSWORD_MIN, type AuthSchemaLabels } from '@xeprime/validators';

/**
 * Bộ câu lỗi ĐÃ DỊCH cho các schema xác thực dùng chung.
 *
 * `@xeprime/validators` giữ LUẬT (mật khẩu 8 ký tự có chữ có số, SĐT Việt Nam, email hoặc SĐT ở ô
 * đăng nhập) và nhận CHỮ từ ngoài vào. Bản mặc định trong package là tiếng Việt — dùng nó ở web
 * nghĩa là người đang đọc giao diện tiếng Anh vẫn ăn câu lỗi tiếng Việt ngay khi bấm Đăng nhập.
 *
 * Khoá nằm ở `Auth.validation` trong `@xeprime/domain/messages` — CÙNG bộ khoá app native đang
 * dùng (`apps/mobile/src/features/auth/use-auth-schema-labels.ts`), vì một luật thì chỉ nên có
 * một câu chữ cho mỗi ngôn ngữ.
 */
export function useAuthSchemaLabels(): AuthSchemaLabels {
  const t = useTranslations('Auth.validation');

  return useMemo(
    () => ({
      invalid: t('phoneInvalid'),
      required: t('phoneRequired'),
      passwordRequired: t('passwordRequired'),
      passwordTooShort: t('passwordTooShort', { min: PASSWORD_MIN }),
      passwordNeedsLetter: t('passwordNeedsLetter'),
      passwordNeedsDigit: t('passwordNeedsDigit'),
      emailInvalid: t('emailInvalid'),
      emailRequired: t('emailRequired'),
      identifierRequired: t('identifierRequired'),
      identifierInvalid: t('identifierInvalid'),
      nameRequired: t('nameRequired'),
      confirmRequired: t('confirmRequired'),
      confirmMismatch: t('confirmMismatch'),
    }),
    [t],
  );
}
