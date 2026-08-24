'use client';

import { useCallback, useMemo } from 'react';
import { useTranslations } from 'next-intl';
import type { VehiclePublicStatus } from '@xeprime/types';
import {
  publicStatusPresentation,
  type PublishRequirementKey,
} from '../publication';
import type { SensitiveChangeLabels } from '../sensitive-changes';

export interface PublicStatusCopy {
  type: 'success' | 'info' | 'warning' | 'error';
  message: string;
  description: string;
}

export interface PublicationLabels {
  /** Nhãn một điều kiện lên chợ: `'mainImage'` → "Ảnh đại diện" / "Cover photo". */
  requirement: (key: PublishRequirementKey) => string;
  /**
   * Câu trình bày trạng thái public. `reason` là lời người duyệt viết — với hai trạng thái cần
   * lý do, nó THAY câu mặc định; các trạng thái khác bỏ qua nó.
   */
  statusCopy: (status: VehiclePublicStatus, reason?: string | null) => PublicStatusCopy;
}

/**
 * Chữ cho phần "lên chợ" của một xe — dùng chung cho `VehiclePublicReviewPanel` (checklist +
 * banner) và Hồ sơ 360 (banner).
 *
 * Phần QUYẾT ĐỊNH (điều kiện nào áp dụng, trạng thái nào màu gì) vẫn ở `publication.ts` và vẫn
 * thuần; hook này chỉ khoác chữ. Hai bề mặt vì thế không thể lệch nhau một điều kiện hay một
 * câu — đúng lý do `publication.ts` được tách ra từ đầu.
 */
export function usePublicationLabels(): PublicationLabels {
  const t = useTranslations('Vehicles.publish');

  const requirement = useCallback(
    (key: PublishRequirementKey) => t(`requirements.${key}`),
    [t],
  );

  const statusCopy = useCallback(
    (status: VehiclePublicStatus, reason?: string | null): PublicStatusCopy => {
      const presentation = publicStatusPresentation(status);
      return {
        type: presentation.type,
        message: t(`status.${presentation.key}.message`),
        description:
          presentation.useReason && reason
            ? reason
            : t(`status.${presentation.key}.description`),
      };
    },
    [t],
  );

  return useMemo(() => ({ requirement, statusCopy }), [requirement, statusCopy]);
}

/**
 * Chữ cho hộp xác nhận "thay đổi cần duyệt lại" (`sensitiveChanges`).
 *
 * Tách khỏi `usePublicationLabels` vì chỉ workspace chỉnh sửa dùng — banner và checklist không
 * cần nó, và nạp một namespace con chỉ ở nơi thật sự dùng.
 */
export function useSensitiveChangeLabels(): SensitiveChangeLabels {
  const t = useTranslations('Vehicles.publish.sensitive');

  return useMemo(
    () => ({
      field: (field) => t(`fields.${field}`),
      empty: t('empty'),
      imageSet: t('imageSet'),
      percent: (value) => t('percent', { value }),
    }),
    [t],
  );
}
