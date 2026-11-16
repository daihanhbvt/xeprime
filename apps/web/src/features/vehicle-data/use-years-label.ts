'use client';

import { useTranslations } from 'next-intl';
import { useCallback } from 'react';

/**
 * Đời xe → chữ hiển thị: "2023 - 2026", "2023 - nay", "đến 2022", "Mọi đời"; một năm thì in năm đó.
 */
export function useYearsLabel() {
  const t = useTranslations('AdminVehicleData.cells');
  return useCallback(
    (from: number | null, to: number | null): string => {
      if (from != null && to != null) return from === to ? String(from) : t('years', { from, to });
      if (from != null) return t('yearsOpen', { from });
      if (to != null) return t('yearsUntil', { to });
      return t('yearsAny');
    },
    [t],
  );
}
