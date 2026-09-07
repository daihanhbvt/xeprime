'use client';

import { Alert } from 'antd';
import {
  LONG_TERM_PACKAGE_MONTHS, LONG_TERM_PRICE_HINT_DAYS_PER_MONTH, LONG_TERM_SUGGEST_RATIO, longTermPackageAmounts, longTermPackageLabel, type DiscountTier, } from '@xeprime/types';
import { useTranslations } from 'next-intl';
import styles from './LongTermPriceHint.module.css';
import { useAppFormat } from '@/i18n/use-app-format';

/** Làm tròn gợi ý về trăm nghìn cho dễ đọc — gợi ý là con số tham khảo, không phải để khớp lẻ. */
function roundSuggest(value: number): number {
  return Math.round(value / 100_000) * 100_000;
}

/**
 * Công cụ ĐỊNH GIÁ cho chủ xe ở màn "Giá & chính sách".
 *
 * Hai việc, và chỉ hai việc:
 *   1. gợi ý khoảng giá tháng nên đặt (65–80% × giá ngày × 30 — vùng chiết khấu 20–35% phổ
 *      biến của thuê dài hạn), cảnh báo khi giá tháng KHÔNG rẻ hơn thuê ngày cả tháng;
 *   2. xem trước khách sẽ trả bao nhiêu cho từng GÓI với giá tháng và mốc ưu đãi đang nhập.
 *
 * Con số "so với thuê theo ngày" ở đây là thông tin ĐỊNH GIÁ của chủ xe, KHÔNG phải khuyến mãi
 * hiển thị cho khách: khách chỉ thấy giá gói thật và ưu đãi cam kết thời hạn (ADR 0011).
 * Preview cũng chỉ để tham khảo — giá chốt luôn do PricingService trả về.
 */
export function LongTermPriceHint({
  weekdayPrice,
  monthlyPrice,
  discountTiers,
  discountEnabled,
}: {
  /** Giá ngày thường đang nhập/đang có (VND, number từ form hoặc string từ API). */
  weekdayPrice: number | string | null | undefined;
  monthlyPrice: number | string | null | undefined;
  /**
   * Mốc ưu đãi đang nhập trong cùng form — để preview đúng số khách sẽ trả. Nhận shape LỎNG
   * (`number | null`) vì đây là giá trị form đang gõ dở, chưa qua schema.
   */
  discountTiers?: readonly (
    { minMonths?: number | null; percent?: number | null; note?: string } | undefined
  )[];
  discountEnabled?: boolean;
}) {
  const t = useTranslations('Vehicles.pricing.longTermHint');
  const fmt = useAppFormat();

  const weekday = weekdayPrice == null ? null : Number(weekdayPrice);
  if (weekday == null || !Number.isFinite(weekday) || weekday <= 0) return null;

  const monthReference = weekday * LONG_TERM_PRICE_HINT_DAYS_PER_MONTH;
  const suggestMin = roundSuggest(monthReference * LONG_TERM_SUGGEST_RATIO.min);
  const suggestMax = roundSuggest(monthReference * LONG_TERM_SUGGEST_RATIO.max);
  const suggestion = t('suggestion', {
    min: fmt.money(String(suggestMin)),
    max: fmt.money(String(suggestMax)),
    reference: fmt.money(String(monthReference)),
  });

  const monthly = monthlyPrice == null ? null : Number(monthlyPrice);
  if (monthly == null || !Number.isFinite(monthly) || monthly <= 0) {
    return (
      <Alert
        type="info"
        showIcon
        title={t('noMonthly', { weekday: fmt.money(String(weekday)) })}
        description={suggestion}
      />
    );
  }

  if (monthly >= monthReference) {
    return (
      <Alert
        type="warning"
        showIcon
        title={t('notCheaper', {
          monthly: fmt.money(String(monthly)),
          reference: fmt.money(String(monthReference)),
        })}
        description={`${t('notCheaperBody')} ${suggestion}`}
      />
    );
  }

  /*
   * Chỉ lấy mốc đã nhập đủ (gói + %) — mốc đang gõ dở không được làm preview nhảy số lung tung.
   * Cùng công thức và cùng cách chọn mốc với máy giá, nên con số này khớp cái khách sẽ thấy.
   */
  const tiers = (discountTiers ?? []).filter(
    (t) => t?.minMonths != null && t?.percent != null,
  ) as DiscountTier[];
  const packages = LONG_TERM_PACKAGE_MONTHS.map((months) =>
    longTermPackageAmounts({
      monthlyPrice: monthly,
      packageMonths: months,
      tiers,
      discountEnabled,
    }),
  );

  return (
    <Alert
      type="success"
      showIcon
      title={t('base', { monthly: fmt.money(String(monthly)) })}
      description={
        <>
          <p className={styles.lead}>{suggestion}</p>
          <p className={styles.lead}>{t('packagesLead')}</p>
          <ul className={styles.packages}>
            {packages.map((pkg) => (
              <li key={pkg.packageMonths}>
                <span className={styles.pkgName}>{longTermPackageLabel(pkg.packageMonths)}</span>
                <span className={styles.pkgTotal}>{fmt.money(pkg.finalPackageAmount)}</span>
                <span className={styles.pkgUnit}>
                  {t('perMonth', { amount: fmt.money(pkg.effectiveMonthlyAmount) })}
                  {pkg.durationDiscountPercent ? ` · −${pkg.durationDiscountPercent}%` : ''}
                </span>
              </li>
            ))}
          </ul>
        </>
      }
    />
  );
}
