'use client';

import { Alert } from 'antd';
import { useMemo } from 'react';
import { useWatch, type Control } from 'react-hook-form';
import { useTranslations } from 'next-intl';
import * as yup from 'yup';
import { DRIVER_WAGE_REASON_MAX_LENGTH, MONEY_STEP_VND } from '@xeprime/types';
import { NumberField } from '@/components/form/NumberField';
import { RadioGroupField } from '@/components/form/RadioGroupField';
import { useAppFormat } from '@/i18n/use-app-format';
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
 * Ô "Tiền công/ngày" + tổng của chuyến (× số ngày của đơn) + lựa chọn phạm vi áp dụng.
 *
 * Mức chung của gian hàng (`quote.dailyWage`) là con số DUY NHẤT tự điền; chưa đặt thì ô để trống
 * và mức gợi ý của nền tảng chỉ hiện làm lời nhắc. Lựa chọn phạm vi chỉ hiện khi người dùng được
 * quản lý tài xế và số vừa nhập khác mức chung — nhập đúng mức chung thì không có gì để quyết.
 */
export function DriverDailyWageFields({
  control,
  quote,
  canSetDefault,
}: {
  control: Control<DailyWageValues>;
  quote: DriverWageQuote;
  canSetDefault: boolean;
}) {
  const t = useTranslations('Drivers.wage.form');
  const fmt = useAppFormat();
  const daily = useWatch({ control, name: 'daily' });
  const valid =
    typeof daily === 'number' &&
    daily >= Number(quote.wageDaily.min) &&
    daily <= Number(quote.wageDaily.max) &&
    daily % MONEY_STEP_VND === 0;
  const total = valid ? daily * quote.days : null;
  const shopDefault = quote.dailyWage === null ? null : Number(quote.dailyWage);
  const showScope = canSetDefault && valid && daily !== shopDefault;
  const range = { min: fmt.money(quote.wageDaily.min), max: fmt.money(quote.wageDaily.max) };

  return (
    <>
      <NumberField
        control={control}
        name="daily"
        label={t('daily')}
        money
        min={0}
        required
        placeholder={t('placeholder', { amount: fmt.count(Number(quote.suggestedDaily)) })}
        help={
          shopDefault === null
            ? t('helpNoDefault', range)
            : t('help', { ...range, current: fmt.money(quote.dailyWage) })
        }
      />
      <div className={styles.facts}>
        <span>
          {t('total', {
            daily: valid ? fmt.money(String(daily)) : '—',
            days: quote.days,
          })}
        </span>
        <b>{total === null ? '—' : fmt.money(String(total))}</b>
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
