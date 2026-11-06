'use client';

import { useTranslations } from 'next-intl';
import { useId } from 'react';
import {
  LONG_TERM_PACKAGE_MONTHS,
  longTermPackageAmounts,
  type DiscountTier,
} from '@xeprime/types';

import { DiscountTag } from '@/components/data-display/DiscountTag';
import { MoneyInput } from '@/components/form/MoneyInput';
import { useAppFormat } from '@/i18n/use-app-format';

import styles from './LongTermPackagePreview.module.css';

/** Mốc đang gõ trong form — shape LỎNG, chưa qua schema. */
type LooseTier = { minMonths?: number | null; percent?: number | null } | undefined;

/**
 * "Khách sẽ thấy trên sàn" của ưu đãi thuê dài hạn — cùng khuôn với khuyến mãi trực tiếp: mốc đang
 * nhập áp lên một giá tháng, bằng ĐÚNG phép tính xem trước của máy giá (`longTermPackageAmounts`:
 * mốc cao nhất gói đạt tới, giảm làm tròn LÊN 1.000đ — ADR 0069). Số hiển thị, không phải giá chốt.
 *
 * Hai nơi dùng:
 *  - **Trang Chính sách thuê** (gian hàng không có một giá chung) — `onMonthlyChange` có mặt ⇒ ô giá
 *    tháng VÍ DỤ sửa được ngay trong khung, kèm dòng nhắc "chỉ là ví dụ".
 *  - **Màn sửa xe › Dài hạn** — giá tháng thật của xe đang nhập, chỉ đọc.
 */
export function LongTermPackagePreview({
  monthly,
  onMonthlyChange,
  tiers,
  discountEnabled,
}: {
  monthly: number | null | undefined;
  onMonthlyChange?: (value: number | null) => void;
  tiers: readonly LooseTier[] | null | undefined;
  /** `false` = ưu đãi đang tắt ⇒ giá gói nguyên. Bỏ trống = theo mốc có trong danh sách. */
  discountEnabled?: boolean;
}) {
  const t = useTranslations('Vehicles.pricing.longTermPreview');
  const tUnits = useTranslations('Common.units');
  const fmt = useAppFormat();
  const inputId = useId();
  const example = onMonthlyChange != null;

  // Chỉ mốc đã đủ gói + % — mốc đang gõ dở không làm số nhảy lung tung.
  const ready = (tiers ?? []).filter(
    (tier): tier is DiscountTier =>
      tier?.minMonths != null && tier?.percent != null && tier.percent > 0,
  );
  const price = monthly == null ? null : Number(monthly);
  const packages =
    price != null && Number.isFinite(price) && price > 0
      ? LONG_TERM_PACKAGE_MONTHS.map((months) =>
          longTermPackageAmounts({
            monthlyPrice: price,
            packageMonths: months,
            tiers: ready,
            discountEnabled,
          }),
        )
      : [];
  // Gói nổi bật = gói giảm sâu nhất (gói ngắn nhất nếu bằng nhau); chưa có mốc thì gói 1 tháng.
  const featured = packages.reduce<(typeof packages)[number] | null>(
    (best, pkg) =>
      !best || (pkg.durationDiscountPercent ?? 0) > (best.durationDiscountPercent ?? 0)
        ? pkg
        : best,
    null,
  );

  return (
    <aside className={styles.preview} aria-live="polite" aria-label={t('aria')}>
      <span className={styles.eyebrow}>{t('eyebrow')}</span>
      {example ? (
        <div className={styles.inputRow}>
          <label htmlFor={inputId} className={styles.label}>
            {t('exampleLabel')}
          </label>
          <div className={styles.input}>
            <MoneyInput
              id={inputId}
              value={monthly ?? null}
              min={0}
              onChange={(value) => onMonthlyChange(typeof value === 'number' ? value : null)}
            />
          </div>
        </div>
      ) : featured ? (
        <span className={styles.label}>
          {t('monthlyLabel', { amount: fmt.money(featured.baseMonthlyPrice) })}
        </span>
      ) : null}

      {featured ? (
        <>
          <span className={styles.label}>
            {t('featured', { months: tUnits('month', { count: featured.packageMonths }) })}
          </span>
          {featured.durationDiscountPercent ? (
            <div className={styles.priceLine}>
              <span className={styles.oldPrice}>{fmt.money(featured.basePackageAmount)}</span>
              <DiscountTag percent={featured.durationDiscountPercent} />
            </div>
          ) : null}
          <div className={styles.finalPrice}>{fmt.money(featured.finalPackageAmount)}</div>
          {featured.durationDiscountPercent ? (
            <span className={styles.saving}>
              {t('saving', { amount: fmt.money(featured.durationDiscountAmount) })}
            </span>
          ) : (
            <span className={styles.label}>{t('noTiers')}</span>
          )}
          <dl className={styles.packages}>
            {packages.map((pkg) => (
              <div key={pkg.packageMonths} className={styles.package}>
                <dt>{tUnits('month', { count: pkg.packageMonths })}</dt>
                <dd>
                  {fmt.money(pkg.finalPackageAmount)}
                  {pkg.durationDiscountPercent ? (
                    <span className={styles.percent}>−{pkg.durationDiscountPercent}%</span>
                  ) : null}
                </dd>
              </div>
            ))}
          </dl>
        </>
      ) : (
        <span className={styles.label}>{example ? t('exampleEmpty') : t('monthlyEmpty')}</span>
      )}
      {example ? <span className={styles.note}>{t('exampleNote')}</span> : null}
    </aside>
  );
}
