import { useCallback } from 'react';
import { useLocale, useTranslations } from 'use-intl';
import { PRICE_ROW } from '@xeprime/types';
import { useDomainLabel } from '@/i18n/domain';

interface PriceRowLike {
  key: string;
  label: string;
  sublabel?: string | null;
}

/**
 * Nhãn dòng tiền thuê theo NGÔN NGỮ — bản native của phép map trong `use-customer-cost-view.ts`
 * web (#212). Server viết sẵn câu TIẾNG VIỆT ("Tiền thuê gốc", "2 ngày × 650.000đ/ngày"): bản
 * tiếng Việt giữ nguyên; bản tiếng Anh dịch nhãn theo MÃ dòng (`Domain.priceRow`) và bỏ dòng phụ
 * (chưa có dữ kiện có cấu trúc để dựng lại). Dòng giảm của gói dài hạn ⇒ `price.durationDiscount`.
 */
export function useLocalizePriceRows(): <T extends PriceRowLike>(
  rows: readonly T[],
  isLongTerm: boolean,
) => T[] {
  const locale = useLocale();
  const t = useTranslations('BookingRequests.flow');
  const dl = useDomainLabel();
  return useCallback(
    <T extends PriceRowLike>(rows: readonly T[], isLongTerm: boolean): T[] =>
      locale === 'vi'
        ? [...rows]
        : rows.map((row) => ({
            ...row,
            label:
              row.key === PRICE_ROW.DISCOUNT && isLongTerm
                ? t('price.durationDiscount')
                : dl('priceRow', row.key, row.label),
            sublabel: null,
          })),
    [locale, t, dl],
  );
}
