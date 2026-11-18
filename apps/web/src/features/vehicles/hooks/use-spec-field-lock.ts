'use client';

import { useTranslations } from 'next-intl';
import { useCallback } from 'react';

import type { FieldLock } from '@/components/form/field-lock';

import type { SpecLock } from './use-catalog-spec-lock';

/**
 * Khoá theo dữ liệu mẫu xe (ADR 0102) → khoá TẠI CHỖ của ô nhập (`FieldLock`): cùng ô số / ô chọn ở
 * cả hai trạng thái, chỉ đổi chỉ đọc + bút trong ô — đổi mẫu xe không gỡ rồi dựng lại ô (18/11/2026).
 *
 * `active = false` (ô bị khoá vì lý do KHÁC, vd xe đã lên chợ) ⇒ không khoá theo mẫu: bút không hứa
 * một lần sửa mà ô không cho.
 */
export function useSpecFieldLock(): (lock: SpecLock, label: string, active?: boolean) => FieldLock {
  const t = useTranslations('Vehicles.form.catalog');
  return useCallback(
    (lock, label, active = true) => ({
      locked: active && lock.locked,
      editLabel: t('unlockSpecAria', { field: label }),
      onUnlock: lock.unlock,
    }),
    [t],
  );
}
