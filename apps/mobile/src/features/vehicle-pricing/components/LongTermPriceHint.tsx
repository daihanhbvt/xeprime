import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import {
  LONG_TERM_PACKAGE_MONTHS,
  LONG_TERM_PRICE_HINT_DAYS_PER_MONTH,
  LONG_TERM_SUGGEST_RATIO,
  longTermPackageAmounts,
  type DiscountTier,
} from '@xeprime/types';
import { Callout, CalloutBody } from '@/components/ui/Callout';
import { useAppFormat } from '@/i18n/use-app-format';
import { colors, fontSize, fontWeight, space } from '@/theme/tokens';

/** Làm tròn gợi ý về trăm nghìn cho dễ đọc — gợi ý là con số tham khảo, không phải để khớp lẻ. */
const SUGGEST_ROUNDING = 100_000;

function roundSuggest(value: number): number {
  return Math.round(value / SUGGEST_ROUNDING) * SUGGEST_ROUNDING;
}

/**
 * Công cụ ĐỊNH GIÁ cho chủ xe ở màn "Giá & chính sách" — bản native của `LongTermPriceHint`.
 *
 * Hai việc, và chỉ hai việc:
 *   1. gợi ý khoảng giá tháng nên đặt (65–80% × giá ngày × 30 — vùng chiết khấu 20–35% phổ biến
 *      của thuê dài hạn), cảnh báo khi giá tháng KHÔNG rẻ hơn thuê ngày cả tháng;
 *   2. xem trước khách sẽ trả bao nhiêu cho từng GÓI với giá tháng và mốc ưu đãi đang nhập.
 *
 * Con số "so với thuê theo ngày" là thông tin ĐỊNH GIÁ của chủ xe, KHÔNG phải khuyến mãi hiển
 * thị cho khách: khách chỉ thấy giá gói thật và ưu đãi cam kết thời hạn (ADR 0011). Preview cũng
 * chỉ để tham khảo — giá chốt luôn do `PricingService` trả về.
 *
 * Toàn bộ phép tính đi qua `longTermPackageAmounts` của `@xeprime/types`, đúng hàm web gọi và
 * đúng hàm máy giá gọi: ba nơi lệch nhau một công thức là chủ xe thấy một con số, khách thấy một
 * con số khác.
 *
 * Chữ lấy từ `Vehicles.pricing.longTermHint`. Bên web trước đây viết thẳng tiếng Việt trong
 * component; đã bê ra bó message dùng chung để hai bên không thể lệch câu.
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
  const suggestion = t('suggestion', {
    min: fmt.money(String(roundSuggest(monthReference * LONG_TERM_SUGGEST_RATIO.min))),
    max: fmt.money(String(roundSuggest(monthReference * LONG_TERM_SUGGEST_RATIO.max))),
    reference: fmt.money(String(monthReference)),
  });

  const monthly = monthlyPrice == null ? null : Number(monthlyPrice);

  if (monthly == null || !Number.isFinite(monthly) || monthly <= 0) {
    return (
      <Callout tone="info" title={t('noMonthly', { weekday: fmt.money(String(weekday)) })}>
        <CalloutBody>{suggestion}</CalloutBody>
      </Callout>
    );
  }

  if (monthly >= monthReference) {
    return (
      <Callout
        tone="warning"
        title={t('notCheaper', {
          monthly: fmt.money(String(monthly)),
          reference: fmt.money(String(monthReference)),
        })}
      >
        <CalloutBody>{`${t('notCheaperBody')} ${suggestion}`}</CalloutBody>
      </Callout>
    );
  }

  /*
   * Chỉ lấy mốc đã nhập ĐỦ (gói + %) — mốc đang gõ dở không được làm preview nhảy số lung tung.
   * Cùng công thức và cùng cách chọn mốc với máy giá, nên con số này khớp cái khách sẽ thấy.
   */
  const tiers = (discountTiers ?? []).filter(
    (tier) => tier?.minMonths != null && tier?.percent != null,
  ) as DiscountTier[];

  const packages = LONG_TERM_PACKAGE_MONTHS.map((months) =>
    longTermPackageAmounts({
      monthlyPrice: monthly,
      packageMonths: months,
      tiers,
      ...(discountEnabled === undefined ? {} : { discountEnabled }),
    }),
  );

  return (
    <Callout tone="success" title={t('base', { monthly: fmt.money(String(monthly)) })}>
      <CalloutBody>{suggestion}</CalloutBody>
      <CalloutBody>{t('packagesLead')}</CalloutBody>

      <YStack gap={space.sm}>
        {packages.map((pkg) => (
          <YStack key={pkg.packageMonths} gap={1}>
            {/*
              Tên gói và tổng tiền ĐI LIỀN nhau, không dạt về hai mép.

              `space-between` kéo số tiền ra sát mép phải, và ở bề ngang điện thoại khoảng trống
              giữa "1 tháng" với "6.480.000 đ" rộng bằng nửa hàng — mắt phải bắc cầu qua chỗ trống
              đó ở từng dòng trong sáu dòng. Web đặt chúng cạnh nhau, đọc thành một cụm.
            */}
            <XStack ai="baseline" gap={space.sm}>
              <Text col={colors.text} fos={fontSize.bodySm} fow={fontWeight.semibold}>
                {fmt.packageLabel(pkg.packageMonths)}
              </Text>
              <Text col={colors.primaryActive} fos={fontSize.bodySm} fow={fontWeight.bold}>
                {fmt.money(pkg.finalPackageAmount)}
              </Text>
            </XStack>
            {/* Dòng phụ: giá HIỆU DỤNG mỗi tháng — thứ khách dùng để so giữa các gói. */}
            <Text col={colors.textMuted} fos={fontSize.bodySm}>
              {t('perMonth', { amount: fmt.money(pkg.effectiveMonthlyAmount) })}
              {pkg.durationDiscountPercent ? ` · −${pkg.durationDiscountPercent}%` : ''}
            </Text>
          </YStack>
        ))}
      </YStack>
    </Callout>
  );
}
