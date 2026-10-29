import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable } from 'react-native';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import type { InsuranceProductKind } from '@xeprime/types';
import type { InsuranceOfferItem, PublicInsuranceProduct } from '@/api/insurance/api';
import { CheckMark } from '@/components/ui/CheckMark';
import { useAppFormat } from '@/i18n/use-app-format';
import { useDomainLabel } from '@/i18n/domain';
import { useLocalizedText } from '@/i18n/localized';
import { useColors } from '@/theme/ThemeProvider';
import { fontSize, fontWeight, iconSize, radius, space } from '@/theme/tokens';

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

  return (
    <YStack
      gap={space.xs}
      py={space.sm}
      px={space.md}
      bw={1}
      bc={checked ? colors.primary : colors.border}
      br={radius.md}
      bg={colors.surface}
      minWidth={0}
    >
      <Pressable
        onPress={() => onChange(!checked)}
        accessibilityRole="checkbox"
        accessibilityState={{ checked }}
        accessibilityLabel={name ?? undefined}
      >
        <XStack ai="center" gap={space.sm} minWidth={0}>
          <CheckMark checked={checked} />
          <Text f={1} minWidth={0} col={colors.text} fos={fontSize.body} fow={fontWeight.medium}>
            {name}
          </Text>
          <Text col={colors.primary} fos={fontSize.bodySm} fow={fontWeight.semibold}>
            {t('option.dailyRate', { price: fmt.pricePerDay(item.dailyAmount) })}
          </Text>
        </XStack>
      </Pressable>
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
            <YStack marginLeft={NAME_INDENT}>
              <InsuranceBenefits product={item.product} />
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
    </YStack>
  );
}
