'use client';

import { useTranslations } from 'next-intl';
import { useCallback } from 'react';
import type { UploadRejection } from '@/services/upload';

/**
 * Lý do một tệp bị từ chối → câu tiếng người theo ngôn ngữ đang dùng.
 *
 * `validateImageFile` / `validateDocumentFile` là hàm THUẦN — chúng chạy cả ngoài cây React
 * (ví dụ trong một hàm `api.ts`), nên chúng nêu LÝ DO chứ không nêu câu. Chỗ này là nơi duy
 * nhất đổi lý do thành chữ, để bảy chỗ tải tệp không mỗi chỗ tự viết một câu.
 */
export function useUploadRejectionMessage(): (rejection: UploadRejection) => string {
  const t = useTranslations('Errors.upload');

  return useCallback(
    (rejection: UploadRejection) => t(rejection.reason, { maxMb: rejection.maxMb ?? 0 }),
    [t],
  );
}
