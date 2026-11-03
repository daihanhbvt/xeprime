'use client';

import { Switch } from 'antd';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useWatch, type Control, type UseFormSetValue } from 'react-hook-form';

import { DiscountTag } from '@/components/data-display/DiscountTag';
import { NumberField } from '@/components/form/NumberField';
import { discountedPriceVnd } from '@/features/vehicles/pricing';
import { useAppFormat } from '@/i18n/use-app-format';

import type { VehiclePricingFormValues } from '../schema';
import { LongTermPriceHint } from './LongTermPriceHint';
import { PolicyInfoTip } from './PolicyInfoTip';
import styles from './PricingParts.module.css';

/*
 * Mảnh dùng chung của form "Giá & chính sách" một xe — màn giá một trang và các tab của mục
 * "Dịch vụ xe" trên màn sửa xe bày cùng những mảnh này, cùng một bộ giá trị RHF.
 */

/** Lối sang lịch xe để đặt giá riêng theo ngày — một nguồn giá, không có bảng mùa vụ thứ hai. */
export function CalendarPriceLink({
  href,
  label,
  hint,
}: {
  href: string;
  label: string;
  hint: string;
}) {
  return (
    <div className={styles.calendarLink}>
      <Link href={href}>{label}</Link>
      <span className={styles.desc}>{hint}</span>
    </div>
  );
}

/**
 * Khuyến mãi trực tiếp là một thiết lập giá riêng của xe, không phải bậc ưu đãi
 * dài hạn. Preview dùng cùng công thức với card/chi tiết sàn để chủ xe không phải
 * tự nhẩm giá sau giảm.
 */
export function DirectDiscountEditor({
  control,
  setValue,
}: {
  control: Control<VehiclePricingFormValues>;
  setValue: UseFormSetValue<VehiclePricingFormValues>;
}) {
  const t = useTranslations('Vehicles.pricing.discount');
  const fmt = useAppFormat();

  const weekdayPrice = useWatch({ control, name: 'weekdayPrice' });
  const weekendPrice = useWatch({ control, name: 'weekendPrice' });
  const hourlyPrice = useWatch({ control, name: 'hourlyPrice' });
  const discountPercent = useWatch({ control, name: 'discountPercent' });
  const enabled = discountPercent != null && discountPercent > 0;
  const discountedWeekday = discountedPriceVnd(
    weekdayPrice == null ? null : String(weekdayPrice),
    discountPercent,
  );
  const discountedWeekend = discountedPriceVnd(
    weekendPrice == null ? null : String(weekendPrice),
    discountPercent,
  );
  const saving =
    weekdayPrice != null && discountedWeekday != null
      ? Math.max(0, Math.round(weekdayPrice) - Number(discountedWeekday))
      : null;

  return (
    <div className={styles.promoCard}>
      <div className={styles.promoSettings}>
        <div className={styles.promoHeadingRow}>
          <div>
            <div className={styles.promoTitleRow}>
              <h3 className={styles.promoTitle}>{t('title')}</h3>
              <PolicyInfoTip label={t('tipLabel')}>{t('info')}</PolicyInfoTip>
            </div>
          </div>
          <Switch
            aria-label={t('toggle')}
            checked={enabled}
            checkedChildren={t('on')}
            unCheckedChildren={t('off')}
            onChange={(checked) =>
              setValue('discountPercent', checked ? 10 : null, {
                shouldDirty: true,
                shouldValidate: true,
              })
            }
          />
        </div>

        {enabled ? (
          <div className={styles.promoInput}>
            <NumberField
              control={control}
              name="discountPercent"
              label={t('percent')}
              labelAccessory={
                <PolicyInfoTip label={t('percentTipLabel')}>{t('percentInfo')}</PolicyInfoTip>
              }
              percent
              min={1}
              max={100}
              required
            />
          </div>
        ) : (
          <p className={styles.promoOffHint}>{t('offHint')}</p>
        )}
      </div>

      <aside className={styles.pricePreview} aria-live="polite" aria-label={t('previewAria')}>
        <span className={styles.previewEyebrow}>{t('previewEyebrow')}</span>
        <span className={styles.previewLabel}>{t('previewLabel')}</span>
        {weekdayPrice != null ? (
          enabled && discountedWeekday ? (
            <>
              <div className={styles.previewPriceLine}>
                <span className={styles.previewOldPrice}>{fmt.money(String(weekdayPrice))}</span>
                <DiscountTag percent={discountPercent} />
              </div>
              <div className={styles.previewFinalPrice}>
                {fmt.money(discountedWeekday)} <small>{t('perDay')}</small>
              </div>
              {saving != null ? (
                <span className={styles.previewSaving}>
                  {t('saving', { amount: fmt.money(String(saving)) })}
                </span>
              ) : null}
            </>
          ) : (
            <div className={styles.previewFinalPrice}>
              {fmt.money(String(weekdayPrice))} <small>{t('perDay')}</small>
            </div>
          )
        ) : (
          <span className={styles.previewEmpty}>{t('previewEmpty')}</span>
        )}

        {enabled && discountedWeekend ? (
          <div className={styles.previewSecondary}>
            <span>{t('weekendAfter')}</span>
            <strong>
              {fmt.money(discountedWeekend)}
              {t('perDay')}
            </strong>
          </div>
        ) : null}
        {hourlyPrice != null ? (
          <div className={styles.previewSecondary}>
            <span>{t('hourlyNoDiscount')}</span>
            <strong>
              {fmt.money(String(hourlyPrice))}
              {t('perHour')}
            </strong>
          </div>
        ) : null}
      </aside>
    </div>
  );
}

/**
 * Cầu useWatch → LongTermPriceHint: gợi ý VÀ bảng giá gói đổi ngay khi chủ xe gõ giá hoặc sửa
 * mốc ưu đãi, không đợi lưu — thấy ngay khách sẽ trả bao nhiêu cho từng gói.
 */
export function LongTermPriceHintLive({ control }: { control: Control<VehiclePricingFormValues> }) {
  const weekdayPrice = useWatch({ control, name: 'weekdayPrice' });
  const monthlyPrice = useWatch({ control, name: 'monthlyPrice' });
  const discountTiers = useWatch({ control, name: 'discountTiers' });
  const discountEnabled = useWatch({ control, name: 'discountEnabled' });
  return (
    <LongTermPriceHint
      weekdayPrice={weekdayPrice}
      monthlyPrice={monthlyPrice}
      discountTiers={discountTiers}
      discountEnabled={discountEnabled}
    />
  );
}
