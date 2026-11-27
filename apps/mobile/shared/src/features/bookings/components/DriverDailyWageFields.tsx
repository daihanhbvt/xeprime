import { useMemo, type ReactNode } from 'react';
import { useController, useWatch, type Control } from 'react-hook-form';
import { Text, XStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import * as yup from 'yup';
import { DRIVER_WAGE_REASON_MAX_LENGTH, MONEY_STEP_VND } from '@xeprime/types';
import { Callout } from '@/components/ui/Callout';
import { Chip } from '@/components/ui/Chip';
import { MoneyField } from '@/components/ui/MoneyField';
import { RadioField } from '@/components/ui/RadioField';
import { useAppFormat } from '@/i18n/use-app-format';
import { useColors } from '@/theme/ThemeProvider';
import { fontSize, fontWeight, space } from '@/theme/tokens';
import type { DriverWageQuote } from '../api';

/**
 * Phạm vi của một con số tiền công vừa nhập (ADR 0075) — gương `WAGE_SCOPE` của web
 * `DriverDailyWageFields`: chỉ chuyến này, hay chuyến này VÀ các lượt gán sau (đổi mức chung).
 * Chuyến đã gán không bao giờ bị viết lại. Giá trị chỉ sống trong form, không đi lên dây.
 */
export const WAGE_SCOPE = { TRIP: 'trip', DEFAULT: 'default' } as const;
export type WageScope = (typeof WAGE_SCOPE)[keyof typeof WAGE_SCOPE];

/** Schema chung của tấm gán và tấm sửa: mức/ngày trong khoảng nền tảng, bội 1.000đ (như web). */
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
 * Ô "Tiền công/ngày" + tổng của chuyến (× số ngày của đơn) + lựa chọn phạm vi áp dụng — bản native
 * của web `DriverDailyWageFields`. Mức chung (`quote.dailyWage`) là con số DUY NHẤT tự điền; lựa
 * chọn phạm vi chỉ hiện khi được quản lý tài xế và số vừa nhập khác mức chung.
 */
/**
 * Ba mức "chọn nhanh" tiền công/ngày — native port of web `quickDailyWages` (25/11/2026): mức
 * mặc định của bên thuê (nếu có), gợi ý nền tảng, ×1,25 và ×1,5 — làm tròn bước tiền, nằm trong
 * khoảng hợp lệ, khử trùng, lấy ba mức đầu.
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

export function DriverDailyWageFields({
  control,
  quote,
  canSetDefault,
  label,
  currentTotal = null,
  showQuick = true,
  afterField,
}: {
  control: Control<DailyWageValues>;
  quote: DriverWageQuote;
  canSetDefault: boolean;
  /** Nhãn ô số (hộp sửa: "Tiền công mới/ngày"). */
  label?: string;
  /** Tổng hiện tại của lượt gán (hộp sửa) — khung tổng hiện "Tổng thu nhập" kèm chênh lệch. */
  currentTotal?: number | null;
  /** Hàng "chọn nhanh" (hộp gán); hộp sửa tắt. */
  showQuick?: boolean;
  /** Dòng ngay dưới ô số (hộp sửa: "Hiện tại: …"). */
  afterField?: ReactNode;
}) {
  const colors = useColors();
  const t = useTranslations('Drivers.wage.form');
  const tPicker = useTranslations('Drivers.booking.picker');
  const tEdit = useTranslations('Drivers.booking.wageDialog');
  const fmt = useAppFormat();
  const daily = useWatch({ control, name: 'daily' });
  const { field } = useController({ control, name: 'daily' });
  const quick = showQuick ? quickDailyWages(quote) : [];
  const valid =
    typeof daily === 'number' &&
    daily >= Number(quote.wageDaily.min) &&
    daily <= Number(quote.wageDaily.max) &&
    daily % MONEY_STEP_VND === 0;
  const total = valid ? daily * quote.days : null;
  const shopDefault = quote.dailyWage === null ? null : Number(quote.dailyWage);
  const showScope = canSetDefault && valid && daily !== shopDefault;
  const range = { min: fmt.money(quote.wageDaily.min), max: fmt.money(quote.wageDaily.max) };
  const diff = total !== null && currentTotal !== null ? total - currentTotal : null;

  return (
    <>
      <MoneyField
        control={control}
        name="daily"
        label={label ?? t('daily')}
        required
        placeholder={t('placeholder', { amount: fmt.count(Number(quote.suggestedDaily)) })}
        hint={
          shopDefault === null
            ? t('helpNoDefault', range)
            : t('help', { ...range, current: fmt.money(quote.dailyWage) })
        }
      />
      {afterField}
      {quick.length > 0 ? (
        <XStack gap={space.xs} flexWrap="wrap" accessibilityLabel={tPicker('wageQuick')}>
          {quick.map((value) => (
            <Chip
              key={value}
              size="sm"
              selected={daily === value}
              label={fmt.count(value)}
              onPress={() => field.onChange(value)}
            />
          ))}
        </XStack>
      ) : null}
      <XStack ai="center" jc="space-between" gap={space.sm}>
        <Text f={1} col={colors.textMuted} fos={fontSize.bodySm}>
          {currentTotal === null ? tPicker('wageTotal', { days: quote.days }) : tEdit('total')}
        </Text>
        {diff !== null && diff !== 0 ? (
          <Text col={diff > 0 ? colors.success : colors.danger} fos={fontSize.bodySm} fow={fontWeight.medium}>
            {`${diff > 0 ? '+' : '-'}${fmt.count(Math.abs(diff))}`}
          </Text>
        ) : null}
        <Text col={colors.text} fos={fontSize.body} fow={fontWeight.semibold}>
          {total === null ? '-' : fmt.money(String(total))}
        </Text>
      </XStack>
      {total !== null && total > Number(quote.rentAmount) ? (
        <Callout tone="warning" title={t('aboveRent', { rent: fmt.money(quote.rentAmount) })} />
      ) : null}
      {showScope ? (
        <RadioField
          control={control}
          name="scope"
          label={t('scope.label')}
          options={[
            {
              value: WAGE_SCOPE.TRIP,
              label: t('scope.trip'),
              hint:
                shopDefault === null
                  ? t('scope.tripNoDefault')
                  : t('scope.tripHint', { current: fmt.money(quote.dailyWage) }),
            },
            {
              value: WAGE_SCOPE.DEFAULT,
              label: t('scope.default'),
              hint: t('scope.defaultHint', { daily: fmt.money(String(daily)) }),
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
  const value = Number(amount) / days;
  return Number.isInteger(value) && value % MONEY_STEP_VND === 0 ? value : undefined;
}
