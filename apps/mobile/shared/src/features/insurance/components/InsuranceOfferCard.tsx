import { useState } from 'react';
import { Linking, Pressable } from 'react-native';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { insuranceCoverageItems, sumMoney } from '@xeprime/domain';
import { INSURANCE_PRODUCT_KIND, type InsuranceProductKind } from '@xeprime/types';
import type { InsuranceOfferItem, PublicInsuranceProduct } from '@/api/insurance/api';
import { Ionicons } from '@/components/icons/Ionicons';
import { LineIcon } from '@/components/icons/LineIcon';
import { CheckMark } from '@/components/ui/CheckMark';
import { InsuranceFeeHint } from '@/components/ui/InsuranceFeeHint';
import { Pill } from '@/components/ui/Pill';
import { resolveWebBaseUrl } from '@/lib/web-base-url';
import { useAppFormat } from '@/i18n/use-app-format';
import { useDomainLabel } from '@/i18n/domain';
import { useLocalizedText } from '@/i18n/localized';
import { useColors } from '@/theme/ThemeProvider';
import { fontSize, fontWeight, iconSize, radius, space } from '@/theme/tokens';

/** Lùi phần dưới cho thẳng hàng với TÊN sản phẩm, không với ô chọn. */
const NAME_INDENT = 28;

/**
 * Số tiền khách thấy cho MỘT lựa chọn bảo hiểm — native port of web `insurance/present.ts`
 * `insuranceOfferPrice`: phí cả chuyến (GỘP phí thu hộ, ⓘ tách hai số - ADR 0091 điều 3) hoặc phí ngày.
 */
function insuranceOfferPrice(
  item: InsuranceOfferItem,
): { amount: string; basis: 'trip' | 'daily' } | null {
  if (item.tripAmount) {
    return {
      amount: item.serviceFeeAmount
        ? sumMoney([item.tripAmount, item.serviceFeeAmount])
        : item.tripAmount,
      basis: 'trip',
    };
  }
  if (item.dailyAmount) return { amount: item.dailyAmount, basis: 'daily' };
  return null;
}

/** Tổng đài (1900…) không phải SĐT di động - ghép `tel:` trực tiếp, bỏ khoảng trắng. */
function hotlineUrl(hotline: string): string {
  return `tel:${hotline.replace(/\s/g, '')}`;
}

/**
 * Thẻ "Bảo hiểm chuyến đi" (ADR 0064 · ADR 0091) — native port of web `InsuranceOfferCard` (#347,
 * Figma `22548:36923`): đầu thẻ (khiên · tiêu đề · nhãn hãng), mỗi sản phẩm một ô chọn (tên, mô tả
 * ngắn, giá, viên khấu trừ / hotline, "Xem quyền lợi" mở NGAY TRONG THẺ như web khổ điện thoại), ghi
 * chú tự nguyện ở chân. Phí đọc từ CHÍNH báo giá, tên/quyền lợi/khấu trừ/hotline từ danh mục sản phẩm.
 * Danh sách rỗng ⇒ không render gì.
 */
export function InsuranceOfferCard({
  items,
  selected,
  onChange,
}: {
  items: readonly InsuranceOfferItem[];
  selected: Readonly<Record<InsuranceProductKind, boolean>>;
  onChange: (kind: InsuranceProductKind, checked: boolean) => void;
}) {
  const colors = useColors();
  const t = useTranslations('Insurance');
  if (items.length === 0) return null;

  // Nhãn hãng ở đầu thẻ chỉ khi mọi sản phẩm cùng một hãng (hôm nay: MIC).
  const providers = new Set(items.map((item) => item.product?.provider).filter(Boolean));
  const provider = providers.size === 1 ? [...providers][0] : null;

  return (
    <YStack gap={space.sm} minWidth={0}>
      <XStack ai="center" gap={space.sm}>
        <YStack w={28} h={28} br={radius.pill} ai="center" jc="center" bg={colors.successSurface}>
          <LineIcon name="shield-tick" size={iconSize.md} color={colors.success} />
        </YStack>
        <Text f={1} col={colors.text} fos={fontSize.bodyLg} fow={fontWeight.semibold} accessibilityRole="header">
          {t('offer.title')}
        </Text>
        {provider ? <Pill tone="info" label={t(`provider.${provider}.short`)} /> : null}
      </XStack>

      {items.map((item) => (
        <InsuranceOption
          key={item.kind}
          item={item}
          checked={item.mandatory || selected[item.kind]}
          onChange={(checked) => onChange(item.kind, checked)}
        />
      ))}

      {/* "Tự nguyện" chỉ đúng với ô khách tự tích; dòng Bắt buộc (ADR 0091) có câu riêng. */}
      {items.some((item) => !item.mandatory) ? (
        <Text col={colors.placeholder} fos={fontSize.bodySm} fontStyle="italic">
          {t('offer.note')}
        </Text>
      ) : null}
    </YStack>
  );
}

function InsuranceOption({
  item,
  checked,
  onChange,
}: {
  item: InsuranceOfferItem;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  const colors = useColors();
  const t = useTranslations('Insurance');
  const fmt = useAppFormat();
  const domainLabel = useDomainLabel();
  const localized = useLocalizedText();
  const [expanded, setExpanded] = useState(false);

  const product = item.product;
  const name = product
    ? localized(product.nameVi, product.nameEn)
    : domainLabel('insuranceProductKind', item.kind);
  // Các mục phạm vi (mỗi dòng một mục) + mô tả ngắn: admin đặt riêng thì dùng, không thì ghép (web).
  const coverage = product ? insuranceCoverageItems(localized(product.coverageVi, product.coverageEn)) : [];
  const summary = product
    ? localized(product.summaryVi ?? null, product.summaryEn ?? null)?.trim() || coverage.join(', ')
    : null;
  const price = insuranceOfferPrice(item);
  const providerShort = product ? t(`provider.${product.provider}.short`) : null;

  return (
    <YStack
      gap={space.sm}
      p={space.md}
      bw={1}
      bc={checked ? colors.primary : colors.border}
      br={radius.md}
      bg={colors.surface}
      minWidth={0}
    >
      <XStack ai="flex-start" gap={space.sm}>
        {/* Chủ xe đặt Bắt buộc (ADR 0091): luôn tích, không bỏ được - server đã cộng phí. */}
        <Pressable
          onPress={() => onChange(!checked)}
          disabled={item.mandatory}
          accessibilityRole="checkbox"
          accessibilityState={{ checked, disabled: item.mandatory }}
          accessibilityLabel={name ?? undefined}
          style={{ flex: 1, minWidth: 0 }}
        >
          <XStack ai="flex-start" gap={space.sm} minWidth={0}>
            <YStack pt={2}>
              <CheckMark checked={checked} />
            </YStack>
            <YStack f={1} minWidth={0} gap={2}>
              <XStack ai="center" gap={space.xs} flexWrap="wrap">
                <Text col={colors.text} fos={fontSize.body} fow={fontWeight.semibold}>
                  {name}
                </Text>
                {item.mandatory ? <Pill tone="warning" label={t('option.mandatory')} /> : null}
              </XStack>
              {summary ? (
                <Text col={colors.textMuted} fos={fontSize.bodySm} numberOfLines={2}>
                  {summary}
                </Text>
              ) : null}
            </YStack>
          </XStack>
        </Pressable>
        {price ? (
          <YStack ai="flex-end">
            <XStack ai="center" gap={2}>
              <Text col={colors.primary} fos={fontSize.body} fow={fontWeight.semibold}>
                {t(price.basis === 'trip' ? 'option.tripRate' : 'option.dailyRate', {
                  price: fmt.money(price.amount),
                })}
              </Text>
              {item.tripAmount && item.serviceFeeAmount ? (
                <InsuranceFeeHint
                  size={fontSize.bodySm}
                  fee={{
                    premiumAmount: item.tripAmount,
                    serviceFeeAmount: item.serviceFeeAmount,
                    serviceFeePercent: null,
                  }}
                />
              ) : null}
            </XStack>
            <Text col={colors.textMuted} fos={fontSize.label}>
              {t(price.basis === 'daily' ? 'option.perDay' : 'option.perTrip')}
            </Text>
          </YStack>
        ) : null}
      </XStack>

      {item.mandatory ? (
        <Text marginLeft={NAME_INDENT} col={colors.textMuted} fos={fontSize.bodySm}>
          {t('option.mandatoryNote')}
        </Text>
      ) : null}

      {product ? (
        <>
          <YStack h={1} bg={colors.borderSubtle} />
          <XStack ai="center" jc="space-between" gap={space.sm} flexWrap="wrap">
            <XStack ai="center" gap={space.xs} flexWrap="wrap" f={1} minWidth={0}>
              <Pill
                tone="neutral"
                label={
                  product.deductibleAmount
                    ? t('option.deductiblePill', { amount: fmt.moneyCompact(product.deductibleAmount) })
                    : t('option.noDeductiblePill')
                }
              />
              {product.claimHotline ? (
                <Pressable
                  accessibilityRole="link"
                  accessibilityLabel={t('dialog.callHotline', { number: product.claimHotline })}
                  onPress={() => void Linking.openURL(hotlineUrl(product.claimHotline!))}
                >
                  <Pill tone="info" label={t('option.hotlinePill')} />
                </Pressable>
              ) : null}
            </XStack>
            <Pressable
              onPress={() => setExpanded((v) => !v)}
              accessibilityRole="button"
              accessibilityState={{ expanded }}
              hitSlop={space.xs}
            >
              <XStack ai="center" gap={space.xs}>
                <Text col={colors.brandLink} fos={fontSize.bodySm} fow={fontWeight.medium}>
                  {t(expanded ? 'option.hideBenefits' : 'option.showBenefits')}
                </Text>
                <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={iconSize.xs} color={colors.brandLink} />
              </XStack>
            </Pressable>
          </XStack>

          {expanded ? (
            <YStack gap={space.sm}>
              <InsuranceFacts product={product} />
              {coverage.length > 0 ? (
                <YStack gap={space.xs}>
                  <Text col={colors.text} fos={fontSize.bodySm} fow={fontWeight.semibold}>
                    {t('dialog.scopeTitle')}
                  </Text>
                  {coverage.map((entry, index) => (
                    <XStack key={`${index}-${entry}`} ai="flex-start" gap={space.xs}>
                      <YStack pt={3}>
                        <LineIcon name="check-xs" size={12} color={colors.success} />
                      </YStack>
                      <Text f={1} col={colors.textMuted} fos={fontSize.bodySm}>
                        {entry}
                      </Text>
                    </XStack>
                  ))}
                </YStack>
              ) : null}
              {product.claimHotline ? (
                <Text
                  col={colors.textMuted}
                  fos={fontSize.bodySm}
                  accessibilityRole="link"
                  onPress={() => void Linking.openURL(hotlineUrl(product.claimHotline!))}
                >
                  {t.rich('option.hotlineLine', {
                    provider: providerShort ?? '',
                    number: product.claimHotline,
                    b: (chunks) => (
                      <Text col={colors.text} fow={fontWeight.semibold}>
                        {chunks}
                      </Text>
                    ),
                  })}
                </Text>
              ) : null}
              {/* Trang quyền lợi đầy đủ + người chịu khấu trừ (ADR 0091 điều 8) - mở trên web. */}
              {item.kind === INSURANCE_PRODUCT_KIND.VEHICLE_TRIP ? (
                <Text
                  col={colors.brandLink}
                  fos={fontSize.bodySm}
                  fow={fontWeight.semibold}
                  accessibilityRole="link"
                  onPress={() => void Linking.openURL(`${resolveWebBaseUrl()}/insurance`)}
                >
                  {t('option.benefitsPage')}
                </Text>
              ) : null}
            </YStack>
          ) : null}
        </>
      ) : null}
    </YStack>
  );
}

/** Hai ô số: khấu trừ · bồi thường tối đa — web `InsuranceFacts` cỡ `sm`. */
function InsuranceFacts({ product }: { product: PublicInsuranceProduct }) {
  const colors = useColors();
  const t = useTranslations('Insurance');
  const fmt = useAppFormat();
  const localized = useLocalizedText();
  const note = localized(product.maxPayoutNoteVi ?? null, product.maxPayoutNoteEn ?? null) ?? null;
  // Có số tiền ⇒ số là giá trị; không có ⇒ ghi chú ("theo giá trị thực tế…") làm giá trị.
  const payoutValue = product.maxPayoutAmount ? fmt.money(product.maxPayoutAmount) : note;

  const fact = (label: string, value: string) => (
    <YStack f={1} minWidth={0} gap={2} p={space.sm} br={radius.sm} bg={colors.background}>
      <Text col={colors.textMuted} fos={fontSize.label}>
        {label}
      </Text>
      <Text col={colors.text} fos={fontSize.bodySm} fow={fontWeight.semibold}>
        {value}
      </Text>
    </YStack>
  );

  return (
    <XStack gap={space.sm}>
      {fact(
        t('benefits.deductible'),
        product.deductibleAmount
          ? t('benefits.deductiblePerIncident', { amount: fmt.money(product.deductibleAmount) })
          : t('benefits.noDeductible'),
      )}
      {payoutValue ? fact(t('benefits.maxPayout'), payoutValue) : null}
    </XStack>
  );
}
