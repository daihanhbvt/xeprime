import { useTranslations } from 'use-intl';
import type { UploadRejection } from '@xeprime/types';
import { useCallback } from 'react';
import { IMAGE_SOURCE, ImagePermissionDeniedError, UploadRejectedError } from './r2-image-upload';

/**
 * Câu báo cho lỗi CHỌN ẢNH — thiếu quyền thì nói rõ phải bật gì, còn lại rơi về câu lỗi chung.
 *
 * Ở đây chứ không lặp ở từng màn: ba màn cùng gọi `pickImages` (ảnh xe, giấy tờ, bảo dưỡng), và
 * một màn quên nhánh thiếu quyền là một màn im lặng khi người dùng chạm nút.
 */
export function useImageErrorMessage(
  fallback: (error: unknown) => string,
): (error: unknown) => string {
  const t = useTranslations('Common.permissions');
  const uploadRejection = useUploadRejectionMessage();

  return useCallback(
    (error: unknown) => {
      if (error instanceof ImagePermissionDeniedError) {
        return error.source === IMAGE_SOURCE.CAMERA ? t('cameraDenied') : t('libraryDenied');
      }
      if (error instanceof UploadRejectedError) {
        return uploadRejection(error.rejection);
      }
      return fallback(error);
    },
    [fallback, t, uploadRejection],
  );
}

/**
 * Lý do TỪ CHỐI TỆP → chữ. Bốn mã, bốn khoá ở `Errors.upload.*`; hai mã "quá lớn" mang `maxMb`
 * để câu nói ra đúng con số trần thay vì một câu chung chung.
 */
export function useUploadRejectionMessage(): (rejection: UploadRejection) => string {
  const t = useTranslations('Errors.upload');

  return useCallback(
    (rejection: UploadRejection) => {
      switch (rejection.reason) {
        case 'imageType':
          return t('imageType');
        case 'imageTooLarge':
          return t('imageTooLarge', { maxMb: rejection.maxMb ?? 0 });
        case 'documentType':
          return t('documentType');
        default:
          return t('documentTooLarge', { maxMb: rejection.maxMb ?? 0 });
      }
    },
    [t],
  );
}
