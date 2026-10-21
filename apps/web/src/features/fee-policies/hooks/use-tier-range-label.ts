'use client';

import { useTranslations } from 'next-intl';
import { useCallback } from 'react';

/**
 * Nhãn một khoảng ngày thuê của nấc hoa hồng: `Ngày 1–2` · `Ngày 5` · `Từ ngày 31`.
 * `toDay = null` là nấc cuối, kéo dài vô hạn.
 */
export function useTierRangeLabel(): (range: { fromDay: number; toDay: number | null }) => string {
  const t = useTranslations('FeePolicies.tiers');
  return useCallback(
    ({ fromDay, toDay }) => {
      if (toDay == null) return t('dayFrom', { from: fromDay });
      if (toDay === fromDay) return t('dayOne', { from: fromDay });
      return t('dayRange', { from: fromDay, to: toDay });
    },
    [t],
  );
}
