import { memo, useCallback } from 'react';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import {
  RECEIPT_STATUS,
  RECEIPT_STATUS_META,
  RECEIPT_TYPE,
  RECEIPT_TYPE_META,
  STATUS_COLOR,
} from '@xeprime/types';
import { LIST_SEPARATOR, vehicleLabel } from '@xeprime/domain';
import { metaColor } from '@/lib/status-meta';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { FactRow } from '@/components/ui/FactRow';
import { Pill, pillToneOfStatusColor } from '@/components/ui/Pill';
import { useAppFormat } from '@/i18n/use-app-format';
import { useDomainLabel } from '@/i18n/domain';
import { useColors } from '@/theme/ThemeProvider';
import { fontSize, fontWeight, space, typeScale } from '@/theme/tokens';
import type { Receipt } from '../api';

/**
 * Một phiếu thu/chi trên app native.
 *
 * MỘT thẻ cho MỌI bề mặt hiện phiếu — sổ Thu-Chi, khu "Thu chi" của hồ sơ khách, khối tiền của
 * hồ sơ xe. Hai bản chép tay sẽ lệch nhau ở lần đổi đầu tiên, mà đây là chỗ người dùng đối chiếu
 * tiền: một bên hiện nguồn phiếu còn bên kia quên là đủ để họ đọc ra hai con số khác nhau.
 *
 * Dấu +/− và MÀU do `type` quyết định, không do số tiền: `amount` của phiếu chi vẫn là số dương
 * trên dây (ADR 0007), chiều tiền nằm ở `type`.
 *
 * `onPress` mở CHI TIẾT — cùng một implementation ở mọi lối vào (`ReceiptDetailSheet`). Thiếu nó
 * thì thẻ vẫn là một khối đọc, không có mũi tên và không bắt chạm: một thẻ bấm được mà không mở
 * ra gì tệ hơn hẳn một thẻ chỉ để đọc.
 *
 * **Vạch mép trái mang CHIỀU TIỀN, không mang trạng thái** — khác các thẻ danh sách khác, và có
 * lý do: câu hỏi người ta lướt một cuốn sổ để hỏi là "khoản này vào hay ra", chứ không phải "nó
 * đã duyệt chưa". Một dải xanh/đỏ chạy dọc trang cho thấy ngay tỉ lệ thu/chi của cả trang mà
 * không phải đọc một dấu trừ nào.
 *
 * Ngoại lệ duy nhất là phiếu ĐÃ HUỶ: nó không còn tính vào sổ, nên vạch về trung tính — nếu
 * không, một phiếu chi đã huỷ vẫn đọc ra như một khoản chi thật khi lướt.
 */
function ReceiptCardImpl({
  receipt,
  showDescription = false,
  onPress,
}: {
  receipt: Receipt;
  /** Sổ Thu-Chi hiện thêm diễn giải; khu tiền của hồ sơ khách thì không (chỗ hẹp hơn). */
  showDescription?: boolean;
  onPress?: (id: string) => void;
}) {
  const colors = useColors();
  const t = useTranslations('Finance.receipts');
  const tCommon = useTranslations('Common');
  const fmt = useAppFormat();
  const domainLabel = useDomainLabel();

  const income = receipt.type === RECEIPT_TYPE.INCOME;
  const vehicle = vehicleLabel(receipt.vehicleName, receipt.plateNumber);

  /**
   * Khách · xe (biển số) · mã đơn — đúng cột "Đối tượng" của bảng web, gộp thành một dòng.
   *
   * Thiếu dòng này thì "đối tượng" của một dòng sổ là ba id 26 ký tự: sổ có số nhưng không trả
   * lời được tiền của ai, xe nào.
   */
  const subject = [receipt.customerName, vehicle, receipt.bookingCode]
    .filter(Boolean)
    .join(LIST_SEPARATOR);

  const open = useCallback(() => onPress?.(receipt.id), [onPress, receipt.id]);

  const cancelled = receipt.status === RECEIPT_STATUS.CANCELLED;
  const accent = cancelled ? STATUS_COLOR.NEUTRAL : metaColor(RECEIPT_TYPE_META, receipt.type);

  return (
    // Khuôn thẻ danh sách chuẩn (Đơn thuê): mã phiếu + viên trạng thái, các dòng FactRow, nút vàng.
    <Card
      {...(onPress
        ? {
            onPress: open,
            accessibilityLabel: [
              receipt.receiptNo,
              `${income ? '+' : '−'} ${fmt.money(receipt.amount)}`,
            ]
              .filter(Boolean)
              .join(LIST_SEPARATOR),
          }
        : {})}
    >
      <YStack gap={space.sm}>
        <XStack ai="center" jc="space-between" gap={space.sm}>
          <Text col={colors.text} fos={typeScale.body.fontSize} lh={typeScale.body.lineHeight} fow={fontWeight.medium} numberOfLines={1} flexShrink={1}>
            {receipt.receiptNo ? `#${receipt.receiptNo}` : tCommon('labels.emptyValue')}
          </Text>
          <Pill
            label={domainLabel('receiptStatus', receipt.status)}
            tone={pillToneOfStatusColor(
              cancelled ? STATUS_COLOR.NEUTRAL : metaColor(RECEIPT_STATUS_META, receipt.status),
            )}
          />
        </XStack>

        {/* Số tiền: tiền vào xanh, tiền ra đỏ - vẫn là con số nổi nhất thẻ. */}
        <XStack ai="center" jc="space-between" gap={space.sm}>
          <Pill
            label={domainLabel('receiptType', receipt.type)}
            tone={pillToneOfStatusColor(accent)}
          />
          <Text col={income ? colors.success : colors.danger} fos={fontSize.h4} fow={fontWeight.bold} numberOfLines={1} flexShrink={1}>
            {income ? '+' : '−'} {fmt.money(receipt.amount)}
          </Text>
        </XStack>

        <FactRow label={t('detail.rows.source')}>{domainLabel('receiptSource', receipt.source)}</FactRow>
        <FactRow label={t('detail.rows.occurredAt')}>{fmt.date(receipt.occurredAt)}</FactRow>
        <FactRow label={t('detail.rows.category')}>{receipt.categoryName ?? t('uncategorized')}</FactRow>
        {subject ? <FactRow label={t('detail.rows.customer')}>{subject}</FactRow> : null}
        <FactRow label={t('detail.rows.method')}>{domainLabel('paymentMethod', receipt.paymentMethod)}</FactRow>
        {showDescription && receipt.description ? (
          <Text col={colors.textMuted} fos={fontSize.label} numberOfLines={2}>
            {receipt.description}
          </Text>
        ) : null}

        {onPress ? (
          <YStack pt={space.xs}>
            <Button label={tCommon('actions.viewDetail')} variant="gradient" size="compact" onPress={open} />
          </YStack>
        ) : null}
      </YStack>
    </Card>
  );
}

export const ReceiptCard = memo(ReceiptCardImpl);
