'use client';

import { Alert } from 'antd';
import { useMemo, type ReactNode } from 'react';
import { useController, useWatch, type Control } from 'react-hook-form';
import { useTranslations } from 'next-intl';
import * as yup from 'yup';
import { DRIVER_WAGE_REASON_MAX_LENGTH, MONEY_STEP_VND } from '@xeprime/types';
import { NumberField } from '@/components/form/NumberField';
import { RadioGroupField } from '@/components/form/RadioGroupField';
import { useAppFormat } from '@/i18n/use-app-format';
import { cx } from '@/lib/cx';
import type { DriverWageQuote } from '../types';
import styles from './DriverWageDialogs.module.css';

/**
 * Phạm vi của một con số tiền công vừa nhập (ADR 0075): chỉ chuyến này — mức chung của gian hàng
 * giữ nguyên — hay chuyến này VÀ các lượt gán sau (đổi mức chung). Chuyến đã gán không bao giờ bị
 * viết lại. Giá trị chỉ sống trong form, không đi lên dây.
 */
export const WAGE_SCOPE = { TRIP: 'trip', DEFAULT: 'default' } as const;
export type WageScope = (typeof WAGE_SCOPE)[keyof typeof WAGE_SCOPE];

/**
 * Schema chung của hộp gán và hộp sửa: mức/ngày trong khoảng nền tảng, bội 1.000đ. Dựng trong
 * component để câu lỗi theo ngôn ngữ của request.
 */
export function useDailyWageSchema(quote: DriverWageQuote) {
  const t = useTranslations('Drivers.wage.form');
  const fmt = useAppFormat();
  const min = Number(quote.wageDaily.min);
  const max = Number(quote.wageDaily.max);
  return useMemo(() => {
    const range = { min: fmt.money(String(min)), max: fmt.money(String(max)) };
    return yup.object({
      daily: yup
        .number()
        .typeError(t('errors.required'))
        .required(t('errors.required'))
        .min(min, t('errors.range', range))
        .max(max, t('errors.range', range))
        .test('step', t('errors.step'), (v) => v == null || v % MONEY_STEP_VND === 0),
      scope: yup.mixed<WageScope>().oneOf(Object.values(WAGE_SCOPE)).required(),
      reason: yup.string().trim().max(DRIVER_WAGE_REASON_MAX_LENGTH).default(''),
    });
  }, [t, fmt, min, max]);
}

export type DailyWageValues = yup.InferType<ReturnType<typeof useDailyWageSchema>>;

/**
 * Mức chọn nhanh dưới ô tiền công (Figma `24145:47780`): mức chung của gian hàng, mức gợi ý của
 * nền tảng, rồi hai bậc trên gợi ý — chỉ những số nằm trong khoảng hợp lệ, không trùng nhau.
 */
export function quickDailyWages(quote: DriverWageQuote): number[] {
  const min = Number(quote.wageDaily.min);
  const max = Number(quote.wageDaily.max);
  const suggested = Number(quote.suggestedDaily);
  const candidates = [
    quote.dailyWage === null ? null : Number(quote.dailyWage),
    suggested,
    suggested * 1.25,
    suggested * 1.5,
  ];
  const seen = new Set<number>();
  for (const value of candidates) {
    if (value === null || !Number.isFinite(value)) continue;
    const rounded = Math.round(value / MONEY_STEP_VND) * MONEY_STEP_VND;
    if (rounded >= min && rounded <= max) seen.add(rounded);
  }
  return [...seen].slice(0, 3);
}

/**
 * Ô "Tiền công/ngày" (ADR 0075 — nhập theo NGÀY, chốt 25/11/2026 dù design ghi "đ/chuyến") + chip
 * chọn nhanh + khung tổng (× số ngày của đơn) + lựa chọn phạm vi áp dụng.
 *
 * Mức chung của gian hàng (`quote.dailyWage`) là con số DUY NHẤT tự điền; chưa đặt thì ô để trống
 * và mức gợi ý của nền tảng chỉ hiện làm lời nhắc. Lựa chọn phạm vi chỉ hiện khi người dùng được
 * quản lý tài xế và số vừa nhập khác mức chung — nhập đúng mức chung thì không có gì để quyết.
 *
 * `currentTotal` (hộp SỬA) đổi khung tổng thành "Tổng thu nhập" kèm chênh lệch so với số đang ghi.
 */
export function DriverDailyWageFields({
  control,
  quote,
  canSetDefault,
  label,
  currentTotal = null,
  showQuick = true,
  afterField,
  beforeTotal,
}: {
  control: Control<DailyWageValues>;
  quote: DriverWageQuote;
  canSetDefault: boolean;
  label?: string;
  currentTotal?: number | null;
  showQuick?: boolean;
  /** Dòng ngay dưới ô số (hộp sửa: "Hiện tại: …"). */
  afterField?: ReactNode;
  /** Ô chèn trước khung tổng (hộp sửa: lý do) — đúng thứ tự của design. */
  beforeTotal?: ReactNode;
}) {
  const t = useTranslations('Drivers.wage.form');
  const tPicker = useTranslations('Drivers.booking.picker');
  const tEdit = useTranslations('Drivers.booking.wageDialog');
  const fmt = useAppFormat();
  const daily = useWatch({ control, name: 'daily' });
  const { field } = useController({ control, name: 'daily' });
  const valid =
    typeof daily === 'number' &&
    daily >= Number(quote.wageDaily.min) &&
    daily <= Number(quote.wageDaily.max) &&
    daily % MONEY_STEP_VND === 0;
  const total = valid ? daily * quote.days : null;
  const shopDefault = quote.dailyWage === null ? null : Number(quote.dailyWage);
  const showScope = canSetDefault && valid && daily !== shopDefault;
  const range = { min: fmt.money(quote.wageDaily.min), max: fmt.money(quote.wageDaily.max) };
  const quick = showQuick ? quickDailyWages(quote) : [];
  const diff = total !== null && currentTotal !== null ? total - currentTotal : null;

  return (
    <>
      <NumberField
        control={control}
        name="daily"
        label={label ?? t('daily')}
        money
        min={0}
        required
        addonAfter={tPicker('wageSuffix')}
        placeholder={t('placeholder', { amount: fmt.count(Number(quote.suggestedDaily)) })}
        help={
          shopDefault === null
            ? t('helpNoDefault', range)
            : t('help', { ...range, current: fmt.money(quote.dailyWage) })
        }
      />
      {afterField}
      {quick.length > 0 ? (
        <div className={styles.quick} role="group" aria-label={tPicker('wageQuick')}>
          {quick.map((value) => (
            <button
              key={value}
              type="button"
              className={cx(styles.quickChip, daily === value && styles.quickChipActive)}
              aria-pressed={daily === value}
              onClick={() => field.onChange(value)}
            >
              {fmt.count(value)}
            </button>
          ))}
        </div>
      ) : null}
      {beforeTotal}
      <div className={styles.totalBox}>
        <span>
          {currentTotal === null ? tPicker('wageTotal', { days: quote.days }) : tEdit('total')}
        </span>
        <span className={styles.totalValue}>
          {diff !== null && diff !== 0 ? (
            <span className={diff > 0 ? styles.diffUp : styles.diffDown}>
              {diff > 0 ? '+' : '-'}
              {fmt.count(Math.abs(diff))}
            </span>
          ) : null}
          <b>{total === null ? '-' : fmt.money(String(total))}</b>
        </span>
      </div>
      {total !== null && total > Number(quote.rentAmount) ? (
        <Alert type="warning" showIcon title={t('aboveRent', { rent: fmt.money(quote.rentAmount) })} />
      ) : null}
      {showScope ? (
        <RadioGroupField
          control={control}
          name="scope"
          label={t('scope.label')}
          options={[
            {
              value: WAGE_SCOPE.TRIP,
              label: t('scope.trip'),
              description:
                shopDefault === null
                  ? t('scope.tripNoDefault')
                  : t('scope.tripHint', { current: fmt.money(quote.dailyWage) }),
            },
            {
              value: WAGE_SCOPE.DEFAULT,
              label: t('scope.default'),
              description: t('scope.defaultHint', { daily: fmt.money(String(daily)) }),
            },
          ]}
        />
      ) : null}
    </>
  );
}

/** Mức/ngày đọc lại từ một tổng đã ghi — chỉ khi chia hết thành bội 1.000đ, không thì để trống. */
export function dailyFromTotal(amount: string | null, days: number | null): number | undefined {
  if (amount === null || !days) return undefined;
  const daily = Number(amount) / days;
  return Number.isInteger(daily) && daily % MONEY_STEP_VND === 0 ? daily : undefined;
}
