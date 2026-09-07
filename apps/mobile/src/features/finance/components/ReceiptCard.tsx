import { memo } from 'react';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import {
  RECEIPT_SOURCE_META,
  RECEIPT_STATUS_META,
  RECEIPT_TYPE,
  type ReceiptSource,
  type ReceiptStatus,
} from '@xeprime/types';
import { Card } from '@/components/ui/Card';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { useAppFormat } from '@/i18n/use-app-format';
import { useDomainLabel } from '@/i18n/domain';
import { colors, fontSize, fontWeight, space } from '@/theme/tokens';
import type { Receipt } from '../api';

/**
 * Một phiếu thu/chi trên app native.
 *
 * MỘT thẻ cho cả hai bề mặt đang hiện nó — khu "Thu chi" của hồ sơ khách và sổ Thu-Chi đã lọc.
 * Hai bản chép tay sẽ lệch nhau ở lần đổi đầu tiên, mà đây là chỗ người dùng đối chiếu tiền:
 * một bên hiện nguồn phiếu còn bên kia quên là đủ để họ đọc ra hai con số khác nhau.
 *
 * Dấu +/− và MÀU do `type` quyết định, không do số tiền: `amount` của phiếu chi vẫn là số dương
 * trên dây (ADR 0007), chiều tiền nằm ở `type`.
 */
function ReceiptCardImpl({
  receipt,
  showDescription = false,
}: {
  receipt: Receipt;
  /** Sổ Thu-Chi hiện thêm diễn giải; khu tiền của hồ sơ khách thì không (chỗ hẹp hơn). */
  showDescription?: boolean;
}) {
  const t = useTranslations('Finance.receipts');
  const fmt = useAppFormat();
  const domainLabel = useDomainLabel();

  const income = receipt.type === RECEIPT_TYPE.INCOME;

  return (
    <Card>
      <YStack gap={space.xs}>
        <XStack ai="center" gap={space.xs}>
          <Text
            f={1}
            minWidth={0}
            col={income ? colors.success : colors.danger}
            fos={fontSize.body}
            fow={fontWeight.semibold}
            numberOfLines={1}
          >
            {income ? '+' : '−'} {fmt.money(receipt.amount)}
          </Text>
          <StatusBadge
            label={domainLabel('receiptStatus', receipt.status)}
            color={RECEIPT_STATUS_META[receipt.status as ReceiptStatus].color}
            size="sm"
          />
        </XStack>

        <Text col={colors.textMuted} fos={fontSize.label} numberOfLines={2}>
          {fmt.date(receipt.occurredAt)} · {receipt.categoryName ?? t('uncategorized')}
          {receipt.bookingCode ? ` · ${receipt.bookingCode}` : ''}
        </Text>

        {showDescription && receipt.description ? (
          <Text col={colors.text} fos={fontSize.bodySm} numberOfLines={2}>
            {receipt.description}
          </Text>
        ) : null}

        {/* Nguồn phiếu: `manual` mới sửa/huỷ tay được — người đọc sổ cần biết ngay. */}
        <XStack>
          <StatusBadge
            label={domainLabel('receiptSource', receipt.source)}
            color={RECEIPT_SOURCE_META[receipt.source as ReceiptSource].color}
            size="sm"
          />
        </XStack>
      </YStack>
    </Card>
  );
}

export const ReceiptCard = memo(ReceiptCardImpl);
