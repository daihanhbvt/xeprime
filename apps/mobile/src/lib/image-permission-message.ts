import { useTranslations } from 'use-intl';
import { useCallback } from 'react';
import { IMAGE_SOURCE, ImagePermissionDeniedError } from './r2-image-upload';

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

  return useCallback(
    (error: unknown) => {
      if (error instanceof ImagePermissionDeniedError) {
        return error.source === IMAGE_SOURCE.CAMERA ? t('cameraDenied') : t('libraryDenied');
      }
      return fallback(error);
    },
    [fallback, t],
  );
}
