import { memo, useCallback } from 'react';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import {
  RECEIPT_STATUS,
  RECEIPT_STATUS_META,
  RECEIPT_TYPE,
  STATUS_COLOR,
} from '@xeprime/types';
import { LIST_SEPARATOR } from '@xeprime/domain';
import { metaColor } from '@/lib/status-meta';
import { Card } from '@/components/ui/Card';
import { LineIcon } from '@/components/icons/LineIcon';
import { Pill, pillToneOfStatusColor } from '@/components/ui/Pill';
import { useAppFormat } from '@/i18n/use-app-format';
import { useDomainLabel } from '@/i18n/domain';
import { useColors } from '@/theme/ThemeProvider';
import { FONT_FAMILY } from '@/theme/fonts';
import { iconSize, radius, space, typeScale } from '@/theme/tokens';
import type { Receipt } from '../api';

/**
 * Một phiếu thu/chi trên app native (Figma Partner-XePrime "Wallet Management / History"
 * `24512:126192`).
 *
 * MỘT thẻ cho MỌI bề mặt hiện phiếu — sổ Thu-Chi, khu "Thu chi" của hồ sơ khách, khối tiền của
 * hồ sơ xe: hai bản chép tay sẽ lệch nhau ở lần đổi đầu tiên.
 *
 * Bố cục: ô icon chiều tiền (xanh = vào, đỏ = ra) · danh mục + "nguồn · hình thức" · số tiền có
 * dấu; dải xám mã phiếu | ngày; dòng "Khách hàng" với tên + xe.
 *
 * Dấu +/− và MÀU do `type` quyết định, không do số tiền: `amount` của phiếu chi vẫn là số dương
 * trên dây (ADR 0007).
 *
 * Trạng thái: Figma không vẽ viên trạng thái (sổ đọc phiếu đã duyệt). Người dùng chốt 26/11/2026:
 * chỉ phiếu CHỜ DUYỆT / NHÁP / ĐÃ HUỶ mang một viên nhỏ — một phiếu chưa vào sổ mà trông y hệt
 * phiếu đã duyệt là đọc sai tiền. Phiếu đã huỷ thì icon + số tiền về trung tính.
 *
 * `onPress` mở chi tiết — chạm cả thẻ (không còn nút "Xem chi tiết", chốt 26/11/2026).
 */
function ReceiptCardImpl({
  receipt,
  onPress,
}: {
  receipt: Receipt;
  onPress?: (id: string) => void;
}) {
  const colors = useColors();
  const t = useTranslations('Finance.receipts');
  const tCommon = useTranslations('Common');
  const fmt = useAppFormat();
  const domainLabel = useDomainLabel();

  const income = receipt.type === RECEIPT_TYPE.INCOME;
  const cancelled = receipt.status === RECEIPT_STATUS.CANCELLED;
  const showStatus = receipt.status !== RECEIPT_STATUS.APPROVED;
  // Chỉ tên xe dưới tên khách (chốt 26/11/2026) - không biển số, không mã đơn.
  const vehicle = receipt.vehicleName;

  const open = useCallback(() => onPress?.(receipt.id), [onPress, receipt.id]);

  const tone = cancelled ? colors.placeholder : income ? colors.success : colors.danger;
  const tileBg = cancelled
    ? colors.surfaceMuted
    : income
      ? colors.successSurface
      : colors.dangerSurfaceStrong;
  const amountText = `${income ? '+' : '-'}${fmt.money(receipt.amount)}`;

  const subtitle = [
    domainLabel('receiptSource', receipt.source),
    domainLabel('paymentMethod', receipt.paymentMethod),
  ].join(LIST_SEPARATOR);

  const hasSubject = Boolean(receipt.customerName || vehicle);

  return (
    <Card
      radius={radius.card}
      borderColor={colors.border}
      {...(onPress
        ? {
            onPress: open,
            accessibilityLabel: [receipt.receiptNo, amountText].filter(Boolean).join(LIST_SEPARATOR),
          }
        : {})}
    >
      <YStack gap={space.md}>
        <XStack ai="flex-start" jc="space-between" gap={space.sm}>
          <XStack ai="center" gap={10} flex={1} minWidth={0}>
            <YStack p={space.sm} br={radius.control} bg={tileBg}>
              <LineIcon name={income ? 'down-circle' : 'up-circle'} size={iconSize.lg} color={tone} />
            </YStack>
            <YStack gap={2} flex={1} minWidth={0}>
              <Text
                col={colors.text}
                fos={typeScale.body.fontSize}
                lh={typeScale.body.lineHeight}
                fontFamily={FONT_FAMILY.semibold}
                numberOfLines={1}
              >
                {receipt.categoryName ?? t('uncategorized')}
              </Text>
              <Text
                col={colors.placeholder}
                fos={typeScale.label.fontSize}
                lh={typeScale.label.lineHeight}
                fontFamily={FONT_FAMILY.body}
                numberOfLines={1}
              >
                {subtitle}
              </Text>
            </YStack>
          </XStack>
          <YStack ai="flex-end" gap={space.xs} flexShrink={0}>
            <Text
              col={tone}
              fos={typeScale.body.fontSize}
              lh={typeScale.body.lineHeight}
              fontFamily={FONT_FAMILY.semibold}
              textDecorationLine={cancelled ? 'line-through' : 'none'}
              numberOfLines={1}
            >
              {amountText}
            </Text>
            {showStatus ? (
              <Pill
                size="sm"
                label={domainLabel('receiptStatus', receipt.status)}
                tone={pillToneOfStatusColor(
                  cancelled ? STATUS_COLOR.NEUTRAL : metaColor(RECEIPT_STATUS_META, receipt.status),
                )}
              />
            ) : null}
          </YStack>
        </XStack>

        <XStack
          ai="center"
          jc="space-between"
          gap={space.sm}
          bg={colors.background}
          br={radius.sm}
          px={space.md}
          py={6}
        >
          <Text
            col={colors.textMuted}
            fos={typeScale.label.fontSize}
            lh={typeScale.label.lineHeight}
            fontFamily={FONT_FAMILY.medium}
            numberOfLines={1}
            flexShrink={1}
          >
            {receipt.receiptNo ?? tCommon('labels.emptyValue')}
          </Text>
          <Text
            col={colors.placeholder}
            fos={typeScale.label.fontSize}
            lh={typeScale.label.lineHeight}
            fontFamily={FONT_FAMILY.body}
          >
            {fmt.date(receipt.occurredAt)}
          </Text>
        </XStack>

        {hasSubject ? (
          <XStack ai="flex-start" jc="space-between" gap={space.md}>
            <Text
              col={colors.textMuted}
              fos={typeScale.body.fontSize}
              lh={typeScale.body.lineHeight}
              fontFamily={FONT_FAMILY.body}
            >
              {t('detail.rows.customer')}
            </Text>
            <YStack ai="flex-end" gap={2} flex={1} minWidth={0}>
              <Text
                col={colors.text}
                fos={typeScale.body.fontSize}
                lh={typeScale.body.lineHeight}
                fontFamily={FONT_FAMILY.medium}
                numberOfLines={1}
                ta="right"
              >
                {receipt.customerName ?? tCommon('labels.emptyValue')}
              </Text>
              {vehicle ? (
                <Text
                  col={colors.textMuted}
                  fos={typeScale.body.fontSize}
                  lh={typeScale.body.lineHeight}
                  fontFamily={FONT_FAMILY.body}
                  numberOfLines={1}
                  ta="right"
                >
                  {vehicle}
                </Text>
              ) : null}
            </YStack>
          </XStack>
        ) : null}

      </YStack>
    </Card>
  );
}

export const ReceiptCard = memo(ReceiptCardImpl);
