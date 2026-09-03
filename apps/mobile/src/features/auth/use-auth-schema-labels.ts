import { useMemo } from 'react';
import { useTranslations } from 'use-intl';
import { PASSWORD_MIN, type AuthSchemaLabels } from '@xeprime/validators';

/**
 * Bộ câu lỗi ĐÃ DỊCH cho các schema xác thực dùng chung.
 *
 * `@xeprime/validators` giữ LUẬT (mật khẩu 8 ký tự có chữ có số, SĐT Việt Nam, xác nhận khớp) và
 * nhận CHỮ từ ngoài vào. Bản mặc định trong package là tiếng Việt, đúng cho web — nơi lớp
 * validate chưa i18n hoá. App native thì đổi ngôn ngữ được, nên nó phải tự cấp chữ.
 *
 * Gom vào một hook thay vì lặp ở sáu form: cả sáu cần cùng một bộ, và sáu bản chép tay sẽ thiếu
 * khoá khác nhau ngay lần thêm luật tiếp theo.
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
      nameRequired: t('nameRequired'),
      confirmRequired: t('confirmRequired'),
      confirmMismatch: t('confirmMismatch'),
    }),
    [t],
  );
}
