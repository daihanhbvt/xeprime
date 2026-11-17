import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import {
  LONG_TERM_PACKAGE_MONTHS,
  longTermPackageAmounts,
  type DiscountTier,
} from '@xeprime/types';
import { DiscountTag } from '@/components/ui/DiscountTag';
import { MoneyControl } from '@/components/ui/MoneyControl';
import { useAppFormat } from '@/i18n/use-app-format';
import { useColors } from '@/theme/ThemeProvider';
import { fontSize, fontWeight, radius, space } from '@/theme/tokens';

/** Mốc đang gõ trong form — shape LỎNG, chưa qua schema. */
type LooseTier = { minMonths?: number | null; percent?: number | null } | undefined;

/**
 * "Khách sẽ thấy trên sàn" của ưu đãi thuê dài hạn — bản native của `LongTermPackagePreview` web
 * (PR #280). Mốc đang nhập áp lên một giá tháng bằng ĐÚNG phép tính xem trước của máy giá
 * (`longTermPackageAmounts`: mốc cao nhất gói đạt tới, giảm làm tròn LÊN 1.000đ — ADR 0069). Số hiển
 * thị, không phải giá chốt.
 *
 * `onMonthlyChange` có mặt ⇒ ô giá tháng VÍ DỤ sửa được ngay trong khung (màn chính sách gian hàng,
 * nơi không có một giá chung), kèm dòng nhắc "chỉ là ví dụ".
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
  const colors = useColors();
  const t = useTranslations('Vehicles.pricing.longTermPreview');
  const tUnits = useTranslations('Common.units');
  const fmt = useAppFormat();
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
            ...(discountEnabled === undefined ? {} : { discountEnabled }),
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
    <YStack
      gap={space.sm}
      p={space.md}
      br={radius.md}
      bg={colors.surfaceMuted}
      accessibilityLabel={t('aria')}
      accessibilityLiveRegion="polite"
    >
      <Text col={colors.placeholder} fos={fontSize.label} fow={fontWeight.semibold}>
        {t('eyebrow')}
      </Text>

      {example ? (
        <MoneyControl
          label={t('exampleLabel')}
          value={monthly ?? null}
          onChange={onMonthlyChange}
        />
      ) : featured ? (
        <Text col={colors.textMuted} fos={fontSize.bodySm}>
          {t('monthlyLabel', { amount: fmt.money(featured.baseMonthlyPrice) })}
        </Text>
      ) : null}

      {featured ? (
        <YStack gap={space.xs}>
          <Text col={colors.textMuted} fos={fontSize.bodySm}>
            {t('featured', { months: tUnits('month', { count: featured.packageMonths }) })}
          </Text>
          {featured.durationDiscountPercent ? (
            <XStack ai="center" gap={space.sm}>
              <Text col={colors.textMuted} fos={fontSize.bodySm} textDecorationLine="line-through">
                {fmt.money(featured.basePackageAmount)}
              </Text>
              <DiscountTag percent={featured.durationDiscountPercent} size="sm" />
            </XStack>
          ) : null}
          <Text col={colors.primaryActive} fos={fontSize.lead} fow={fontWeight.bold}>
            {fmt.money(featured.finalPackageAmount)}
          </Text>
          <Text
            col={featured.durationDiscountPercent ? colors.success : colors.textMuted}
            fos={fontSize.bodySm}
          >
            {featured.durationDiscountPercent
              ? t('saving', { amount: fmt.money(featured.durationDiscountAmount) })
              : t('noTiers')}
          </Text>

          <YStack gap={2} pt={space.xs}>
            {packages.map((pkg) => (
              <XStack key={pkg.packageMonths} ai="baseline" gap={space.sm}>
                <Text col={colors.text} fos={fontSize.bodySm} fow={fontWeight.semibold}>
                  {tUnits('month', { count: pkg.packageMonths })}
                </Text>
                <Text col={colors.text} fos={fontSize.bodySm}>
                  {fmt.money(pkg.finalPackageAmount)}
                </Text>
                {pkg.durationDiscountPercent ? (
                  <Text col={colors.success} fos={fontSize.label}>
                    {`−${pkg.durationDiscountPercent}%`}
                  </Text>
                ) : null}
              </XStack>
            ))}
          </YStack>
        </YStack>
      ) : (
        <Text col={colors.textMuted} fos={fontSize.bodySm}>
          {example ? t('exampleEmpty') : t('monthlyEmpty')}
        </Text>
      )}

      {example ? (
        <Text col={colors.textMuted} fos={fontSize.label}>
          {t('exampleNote')}
        </Text>
      ) : null}
    </YStack>
  );
}
