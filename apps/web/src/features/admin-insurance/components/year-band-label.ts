'use client';

import { useTranslations } from 'next-intl';
import { useCallback } from 'react';

/**
 * Nhãn một nhóm năm sản xuất (ADR 0106): "Từ 2024" · "2021 - 2023" · "Tới 2017" · "2019" · "Mọi
 * năm". Một hook cho cả hai bảng (form sửa + thẻ đồng bộ) để chúng nói giống nhau.
 */
export function useYearBandLabel(): (yearFrom: number | null, yearTo: number | null) => string {
  const t = useTranslations('AdminInsurance.bands');
  return useCallback(
    (yearFrom, yearTo) => {
      if (yearFrom === null && yearTo === null) return t('allYears');
      if (yearTo === null) return t('yearFromOpen', { year: yearFrom ?? 0 });
      if (yearFrom === null) return t('yearToOpen', { year: yearTo });
      if (yearFrom === yearTo) return String(yearFrom);
      return t('yearRange', { from: yearFrom, to: yearTo });
    },
    [t],
  );
}
