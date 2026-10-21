'use client';

import { useTranslations } from 'next-intl';
import { useCallback } from 'react';
import { useAppFormat } from '@/i18n/use-app-format';
import type { PriceBand } from '../constants';

/**
 * Nhãn của một mốc giá (`PRICE_BANDS`): "Dưới 150k" · "800k – 1,5tr" · "Trên 2,5tr" (vi),
 * "Under 150K" · "800K – 1.5M" · "Over 2.5M" (en).
 *
 * Số đi qua `moneyCompact({ price: true })` — hai chữ số lẻ ở bậc triệu, đúng quy tắc cho GIÁ
 * khách dùng để so lựa chọn — còn câu ghép bằng ICU vì trật tự từ hai ngôn ngữ khác nhau.
 */
export function usePriceBandLabel(): (band: PriceBand) => string {
  const t = useTranslations('Marketplace.filterPanel');
  const format = useAppFormat();

  return useCallback(
    (band: PriceBand) => {
      const money = (value: number) => format.moneyCompact(String(value), { price: true });
      if (band.min != null && band.max != null) {
        return t('priceRangeValue', { from: money(band.min), to: money(band.max) });
      }
      if (band.max != null) return t('priceUnder', { max: money(band.max) });
      if (band.min != null) return t('priceOver', { min: money(band.min) });
      return t('any');
    },
    [format, t],
  );
}
