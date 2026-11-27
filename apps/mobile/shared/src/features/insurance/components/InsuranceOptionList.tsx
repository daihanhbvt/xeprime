import { Ionicons } from '@/components/icons/Ionicons';
import { useState } from 'react';
import { Linking, Pressable } from 'react-native';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { sumMoney } from '@xeprime/domain';
import { INSURANCE_PRODUCT_KIND, type InsuranceProductKind } from '@xeprime/types';
import type { InsuranceOfferItem, PublicInsuranceProduct } from '@/api/insurance/api';
import { CheckMark } from '@/components/ui/CheckMark';
import { InsuranceFeeHint } from '@/components/ui/InsuranceFeeHint';
import { Pill } from '@/components/ui/Pill';
import { resolveWebBaseUrl } from '@/lib/web-base-url';
import { useAppFormat } from '@/i18n/use-app-format';
import { useDomainLabel } from '@/i18n/domain';
import { useLocalizedText } from '@/i18n/localized';
import { useColors } from '@/theme/ThemeProvider';
import { fontSize, fontWeight, iconSize, radius, space } from '@/theme/tokens';
import { layout } from '@/theme/layout';

/** Lùi phần dưới cho thẳng hàng với TÊN sản phẩm, không với ô chọn — `margin-left: 24px` của web. */
const NAME_INDENT = 24;

/**
 * Hai ô chọn bảo hiểm chuyến (ADR 0064) — bản native của `InsuranceOptionList` web, dùng chung cho
 * thẻ đặt xe và bước Chuyến đi của luồng gửi yêu cầu.
 *
 * Phí ngày đọc từ CHÍNH báo giá, tên/quyền lợi/khấu trừ đọc từ danh mục sản phẩm — không có con số
 * nào viết cứng ở đây hay trong bản dịch. Danh sách rỗng ⇒ không render gì (người gọi ẩn cả khối).
 */
export function InsuranceOptionList({
  items,
  selected,
  onChange,
}: {
  items: readonly InsuranceOfferItem[];
  selected: Readonly<Record<InsuranceProductKind, boolean>>;
  onChange: (kind: InsuranceProductKind, checked: boolean) => void;
}) {
  if (items.length === 0) return null;
  return (
    <YStack gap={space.xs} minWidth={0}>
      {items.map((item) => (
        <InsuranceOption
          key={item.kind}
          item={item}
          checked={selected[item.kind]}
          onChange={(checked) => onChange(item.kind, checked)}
        />
      ))}
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
  const [open, setOpen] = useState(false);

  const name = item.product
    ? localized(item.product.nameVi, item.product.nameEn)
    : domainLabel('insuranceProductKind', item.kind);
  // Chủ xe đặt Bắt buộc (ADR 0091): luôn tích, không bỏ được - server đã cộng phí vào báo giá.
  const isChecked = item.mandatory || checked;
  const rate = item.tripAmount
    ? t('option.tripRate', {
        // Phí thu hộ GỘP vào giá bảo hiểm khách thấy, ⓘ tách hai số (ADR 0091 điều 3).
        price: fmt.money(
          item.serviceFeeAmount ? sumMoney([item.tripAmount, item.serviceFeeAmount]) : item.tripAmount,
        ),
      })
    : item.dailyAmount
      ? t('option.dailyRate', { price: fmt.pricePerDay(item.dailyAmount) })
      : null;

  return (
    <YStack
      gap={space.xs}
      py={space.sm}
      px={layout.padX}
      bw={1}
      bc={isChecked ? colors.primary : colors.border}
      br={radius.md}
      bg={colors.surface}
      minWidth={0}
    >
      <Pressable
        onPress={() => onChange(!checked)}
        disabled={item.mandatory}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: isChecked, disabled: item.mandatory }}
        accessibilityLabel={name ?? undefined}
      >
        <XStack ai="center" gap={space.sm} minWidth={0}>
          <CheckMark checked={isChecked} />
          <XStack f={1} minWidth={0} ai="center" gap={space.xs} flexWrap="wrap">
            <Text col={colors.text} fos={fontSize.body} fow={fontWeight.medium}>
              {name}
            </Text>
            {item.mandatory ? <Pill tone="warning" label={t('option.mandatory')} /> : null}
          </XStack>
          {rate ? (
            <Text col={colors.primary} fos={fontSize.bodySm} fow={fontWeight.semibold}>
              {rate}
            </Text>
          ) : null}
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
      </Pressable>
      {item.mandatory ? (
        <Text marginLeft={NAME_INDENT} col={colors.textMuted} fos={fontSize.bodySm}>
          {t('option.mandatoryNote')}
        </Text>
      ) : null}
      {item.product ? (
        <>
          <Pressable
            onPress={() => setOpen((v) => !v)}
            accessibilityRole="button"
            accessibilityState={{ expanded: open }}
            hitSlop={space.xs}
            style={{ alignSelf: 'flex-start', marginLeft: NAME_INDENT }}
          >
            <XStack ai="center" gap={space.xs}>
              <Text col={colors.textMuted} fos={fontSize.bodySm}>
                {t('option.benefits')}
              </Text>
              <Ionicons
                name={open ? 'chevron-up' : 'chevron-down'}
                size={iconSize.xs}
                color={colors.textMuted}
              />
            </XStack>
          </Pressable>
          {open ? (
            <YStack marginLeft={NAME_INDENT} gap={space.xs}>
              <InsuranceBenefits product={item.product} />
              {/* Trang quyền lợi đầy đủ + người chịu khấu trừ (ADR 0091 điều 8) - mở trên web. */}
              {item.kind === INSURANCE_PRODUCT_KIND.VEHICLE_TRIP ? (
                <Text
                  col={colors.primaryActive}
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

/** Quyền lợi + khấu trừ + bồi thường tối đa cho đúng loại xe đang xem. */
function InsuranceBenefits({ product }: { product: PublicInsuranceProduct }) {
  const colors = useColors();
  const t = useTranslations('Insurance');
  const fmt = useAppFormat();
  const localized = useLocalizedText();
  const coverage = localized(product.coverageVi, product.coverageEn);
  const note = localized(product.maxPayoutNoteVi, product.maxPayoutNoteEn) ?? null;

  const maxPayout = product.maxPayoutAmount
    ? note
      ? t('benefits.maxPayoutWithNote', { amount: fmt.money(product.maxPayoutAmount), note })
      : fmt.money(product.maxPayoutAmount)
    : (note ?? null);

  const fact = (label: string, value: string | null | undefined) => (
    <YStack>
      <Text col={colors.text} fos={fontSize.bodySm} fow={fontWeight.semibold}>
        {label}
      </Text>
      <Text col={colors.textMuted} fos={fontSize.bodySm}>
        {value}
      </Text>
    </YStack>
  );

  return (
    <YStack gap={space.xs}>
      {fact(t('benefits.coverage'), coverage)}
      {/*
        Khấu trừ chỉ có nghĩa với VẬT CHẤT XE. Với tai nạn người, "không áp dụng khấu trừ" là thông
        tin khách cần — nói ra thay vì để trống.
      */}
      {fact(
        t('benefits.deductible'),
        product.deductibleAmount
          ? t('benefits.deductiblePerIncident', { amount: fmt.money(product.deductibleAmount) })
          : t('benefits.noDeductible'),
      )}
      {maxPayout ? fact(t('benefits.maxPayout'), maxPayout) : null}
      {product.claimHotline ? (
        <YStack>
          <Text col={colors.text} fos={fontSize.bodySm} fow={fontWeight.semibold}>
            {t('benefits.claimHotline')}
          </Text>
          <Text
            col={colors.primaryActive}
            fos={fontSize.bodySm}
            accessibilityRole="link"
            // Tổng đài (1900…) không phải SĐT di động - ghép `tel:` như web, không qua `telHref`.
            onPress={() => void Linking.openURL(`tel:${product.claimHotline!.replace(/\s/g, '')}`)}
          >
            {product.claimHotline}
          </Text>
        </YStack>
      ) : null}
    </YStack>
  );
}
