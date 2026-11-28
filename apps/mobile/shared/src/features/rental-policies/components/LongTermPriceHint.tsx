import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import {
  LONG_TERM_PACKAGE_MONTHS,
  LONG_TERM_PRICE_HINT_DAYS_PER_MONTH,
  LONG_TERM_SUGGEST_RATIO,
  longTermPackageAmounts,
  type DiscountTier,
} from '@xeprime/types';
import { Fragment, type ReactNode } from 'react';
import { Callout, CalloutBody } from '@/components/ui/Callout';
import { InfoHint } from '@/components/ui/InfoHint';
import { RowDivider } from '@/components/ui/SwitchRow';
import { useAppFormat } from '@/i18n/use-app-format';
import { useColors } from '@/theme/ThemeProvider';
import { fontSize, fontWeight, radius, space, typeScale } from '@/theme/tokens';

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
  preview = false,
  hideSuggestion = false,
}: {
  /** Bỏ dòng "Giá đề xuất" - khi khung "Công thức tính giá gói" của thẻ ưu đãi đã nói câu đó. */
  hideSuggestion?: boolean;
  /**
   * Màn sửa xe › Dịch vụ xe › Xe dài hạn (người dùng chốt 27/11/2026): theo thẻ tự lái - dòng "Giá
   * đề xuất" ngắn (câu giải thích vào ⓘ) + khối "KHÁCH SẼ THẤY TRÊN SÀN" nền vàng nhạt, bảng gói trắng.
   */
  preview?: boolean;
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
  const colors = useColors();
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

  if (preview) {
    const valid = monthly != null && Number.isFinite(monthly) && monthly > 0;
    const cheaper = valid && monthly < monthReference;
    return (
      <PreviewHint
        hideSuggestion={hideSuggestion}
        suggestedLine={t('suggestedLine', {
          min: fmt.money(String(roundSuggest(monthReference * LONG_TERM_SUGGEST_RATIO.min))),
          max: fmt.money(String(roundSuggest(monthReference * LONG_TERM_SUGGEST_RATIO.max))),
        })}
        suggestion={suggestion}
        {...(valid && !cheaper
          ? {
              warning: `${t('notCheaper', {
                monthly: fmt.money(String(monthly)),
                reference: fmt.money(String(monthReference)),
              })}. ${t('notCheaperBody')}`,
            }
          : {})}
        {...(cheaper
          ? {
              packages: LONG_TERM_PACKAGE_MONTHS.map((months) =>
                longTermPackageAmounts({
                  monthlyPrice: monthly,
                  packageMonths: months,
                  tiers: completeTiers(discountTiers),
                  ...(discountEnabled === undefined ? {} : { discountEnabled }),
                }),
              ),
            }
          : {})}
      />
    );
  }

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
  const tiers = completeTiers(discountTiers);

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

type LooseTiers = readonly (
  { minMonths?: number | null; percent?: number | null; note?: string } | undefined
)[];

/**
 * Chỉ lấy mốc đã nhập ĐỦ (gói + %) — mốc đang gõ dở không được làm preview nhảy số lung tung.
 * Cùng công thức và cùng cách chọn mốc với máy giá, nên con số này khớp cái khách sẽ thấy.
 */
function completeTiers(discountTiers: LooseTiers | undefined): DiscountTier[] {
  return (discountTiers ?? []).filter(
    (tier) => tier?.minMonths != null && tier?.percent != null,
  ) as DiscountTier[];
}

/** Đệm + khoảng cách của khối xem trước - cùng số với khối khuyến mãi tự lái (Figma "Discount Details"). */
const PREVIEW_PAD = 12;

function PreviewHint({
  hideSuggestion,
  suggestedLine,
  suggestion,
  warning,
  packages,
}: {
  hideSuggestion: boolean;
  suggestedLine: string;
  suggestion: string;
  warning?: string;
  packages?: readonly ReturnType<typeof longTermPackageAmounts>[];
}) {
  const colors = useColors();
  const t = useTranslations('Vehicles.pricing.longTermHint');
  const tDiscount = useTranslations('Vehicles.pricing.discount');
  const fmt = useAppFormat();
  return (
    <YStack gap={PREVIEW_PAD}>
      {hideSuggestion ? null : (
      <XStack ai="center" gap={space.xs}>
        <Text col={colors.placeholder} fos={typeScale.label.fontSize} lh={typeScale.label.lineHeight}>
          {suggestedLine}
        </Text>
        <InfoHint label={t('suggestTipLabel')} content={suggestion} size={typeScale.label.fontSize} />
      </XStack>
      )}
      {warning ? (
        <Text col={colors.warning} fos={typeScale.label.fontSize} lh={typeScale.label.lineHeight}>
          {warning}
        </Text>
      ) : null}
      {packages ? (
        <YStack bg={colors.brandLow} br={radius.control} px={space.md} py={PREVIEW_PAD} gap={PREVIEW_PAD}>
          <YStack gap={2}>
            {/* HOA là quyết định TRÌNH BÀY - message giữ chữ thường, viết hoa ở đây. */}
            <Text
              col={colors.brandLink}
              fos={typeScale.label.fontSize}
              lh={typeScale.label.lineHeight}
              fow={fontWeight.semibold}
            >
              {tDiscount('previewEyebrow').toUpperCase()}
            </Text>
            <Text col={colors.placeholder} fos={typeScale.body.fontSize} lh={typeScale.body.lineHeight}>
              {t('packagesLead')}
            </Text>
          </YStack>
          <YStack bg={colors.surface} br={radius.control} px={PREVIEW_PAD} py={space.xs}>
            {packages.map((pkg, index) => (
              <Fragment key={pkg.packageMonths}>
                {index > 0 ? <RowDivider tone="faint" /> : null}
                <XStack ai="center" gap={space.sm} py={space.sm}>
                  <YStack f={1} minWidth={0} gap={2}>
                    <Text
                      col={colors.text}
                      fos={typeScale.body.fontSize}
                      lh={typeScale.body.lineHeight}
                      fow={fontWeight.semibold}
                    >
                      {fmt.packageLabel(pkg.packageMonths)}
                    </Text>
                    {/* Giá HIỆU DỤNG mỗi tháng — thứ khách dùng để so giữa các gói. */}
                    <Text col={colors.placeholder} fos={typeScale.label.fontSize} lh={typeScale.label.lineHeight}>
                      {t('perMonth', { amount: fmt.money(pkg.effectiveMonthlyAmount) })}
                    </Text>
                  </YStack>
                  <YStack ai="flex-end" gap={2}>
                    <Text
                      col={colors.primary}
                      fos={typeScale.body.fontSize}
                      lh={typeScale.body.lineHeight}
                      fow={fontWeight.semibold}
                    >
                      {fmt.money(pkg.finalPackageAmount)}
                    </Text>
                    {pkg.durationDiscountPercent ? (
                      <YStack bg={colors.successSurface} br={radius.pill} px={space.sm}>
                        <Text
                          col={colors.success}
                          fos={typeScale.label.fontSize}
                          lh={typeScale.label.lineHeight}
                          fow={fontWeight.medium}
                        >
                          {tDiscount('savingBadge', { percent: pkg.durationDiscountPercent })}
                        </Text>
                      </YStack>
                    ) : null}
                  </YStack>
                </XStack>
              </Fragment>
            ))}
          </YStack>
        </YStack>
      ) : null}
    </YStack>
  );
}

/**
 * Khung "Công thức tính giá gói" cuối thẻ ưu đãi dài hạn (Figma `24789:85376`): nền
 * `status/information-low`, tiêu đề 14 đậm vừa, thân 14 có hai con số đậm. Có giá ngày thường
 * hay không đều hiện CÔNG THỨC CHỮ như cũ (người dùng 28/11/2026 bỏ câu đề xuất giá tháng).
 */
export function LongTermFormulaNotice({
  weekdayPrice,
}: {
  weekdayPrice?: number | string | null | undefined;
}) {
  const colors = useColors();
  const tDiscount = useTranslations('Vehicles.pricing.longTermDiscount');
  // `weekdayPrice` giữ trong chữ ký cho nơi gọi; khung luôn hiện công thức cũ (28/11/2026).
  void weekdayPrice;
  return (
    <YStack w="100%" bg={colors.infoLow} br={radius.control} p={PREVIEW_PAD} gap={space.xs}>
      <Text
        col={colors.textMuted}
        fos={typeScale.body.fontSize}
        lh={typeScale.body.lineHeight}
        fow={fontWeight.medium}
      >
        {tDiscount('formulaTitleShort')}
      </Text>
      <Text col={colors.textMuted} fos={typeScale.body.fontSize} lh={typeScale.body.lineHeight}>
        {/* Công thức cũ (người dùng 28/11/2026) - không còn câu "Đề xuất giá thuê tháng". */}
        {tDiscount('formula')}
      </Text>
    </YStack>
  );
}
