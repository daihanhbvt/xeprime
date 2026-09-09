import { memo, useCallback } from 'react';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import {
  RECEIPT_SOURCE_META,
  RECEIPT_STATUS,
  RECEIPT_STATUS_META,
  RECEIPT_TYPE,
  RECEIPT_TYPE_META,
  STATUS_COLOR,
  type ReceiptSource,
  type ReceiptStatus,
  type ReceiptType,
} from '@xeprime/types';
import { LIST_SEPARATOR, vehicleLabel } from '@xeprime/domain';
import { Card } from '@/components/ui/Card';
import { CardAccent } from '@/components/ui/CardAccent';
import { DetailChevron } from '@/components/ui/DetailArrow';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { useAppFormat } from '@/i18n/use-app-format';
import { useDomainLabel } from '@/i18n/domain';
import { colors, fontSize, fontWeight, space } from '@/theme/tokens';
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
  const accent = cancelled
    ? STATUS_COLOR.NEUTRAL
    : RECEIPT_TYPE_META[receipt.type as ReceiptType].color;

  return (
    <Card
      padded={false}
      {...(onPress
        ? {
            onPress: open,
            /*
             * Nhãn khả truy cập = MÃ PHIẾU + số tiền có dấu. Chỉ số tiền thì một danh sách hai
             * mươi phiếu đọc ra là hai mươi con số không phân biệt được với nhau.
             */
            accessibilityLabel: [
              receipt.receiptNo,
              `${income ? '+' : '−'} ${fmt.money(receipt.amount)}`,
            ]
              .filter(Boolean)
              .join(LIST_SEPARATOR),
          }
        : {})}
    >
      <XStack>
        <CardAccent color={accent} />

        <YStack f={1} minWidth={0} p={space.md} gap={space.xs}>
          {/* Tầng 1 — SỐ TIỀN là thứ to nhất của thẻ, nhãn trạng thái đối diện. */}
          <XStack ai="center" gap={space.xs}>
            <Text
              f={1}
              minWidth={0}
              col={income ? colors.success : colors.danger}
              fos={fontSize.h4}
              fow={fontWeight.bold}
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

          {/*
            Tầng 2 — hai nhãn ĐI CÙNG NHAU: loại phiếu và nguồn sinh ra nó.

            Loại phiếu lặp lại điều dấu +/− đã nói, và đó là chủ ý của thẻ web: dấu trừ là một nét
            ngang dễ trượt mắt trong danh sách dài, còn "Phiếu chi" thì không đọc nhầm được. Nguồn
            đứng ngay cạnh vì hai câu hỏi đi liền nhau — tiền vào hay ra, và ai sinh ra phiếu này:
            chỉ `manual` mới sửa/huỷ tay được.
          */}
          <XStack ai="center" gap={space.xs} flexWrap="wrap">
            <StatusBadge
              label={domainLabel('receiptType', receipt.type)}
              color={RECEIPT_TYPE_META[receipt.type as ReceiptType].color}
              size="sm"
            />
            <StatusBadge
              label={domainLabel('receiptSource', receipt.source)}
              color={RECEIPT_SOURCE_META[receipt.source as ReceiptSource].color}
              size="sm"
            />
          </XStack>

          {/* Tầng 3 — NGÀY và DANH MỤC: khoản này xảy ra lúc nào, thuộc nhóm nào. */}
          <Text col={colors.textMuted} fos={fontSize.label} numberOfLines={1}>
            {fmt.date(receipt.occurredAt)} · {receipt.categoryName ?? t('uncategorized')}
          </Text>

          {/* Tầng 4 — ĐỐI TƯỢNG, ăn mực đen: dòng trả lời "tiền của ai, xe nào". */}
          {subject ? (
            <Text col={colors.text} fos={fontSize.bodySm} numberOfLines={1}>
              {subject}
            </Text>
          ) : null}

          {/* Tầng 5 — diễn giải người ghi tự nhập. */}
          {showDescription && receipt.description ? (
            <Text col={colors.textMuted} fos={fontSize.label} numberOfLines={2}>
              {receipt.description}
            </Text>
          ) : null}

          {/*
            Tầng 6 — MÃ PHIẾU và phương thức, mờ nhất thẻ.

            Chúng là thứ TRA CỨU chứ không phải thứ đọc lướt: mã phiếu chỉ dùng khi đối chiếu với
            một chứng từ ngoài, phương thức chỉ dùng khi soát quỹ. Ở tầng chữ mờ nhất thì chúng
            luôn có mặt mà không tranh chỗ với bốn tầng trên.
          */}
          <XStack ai="center" gap={space.xs}>
            <Text
              f={1}
              minWidth={0}
              col={colors.placeholder}
              fos={fontSize.label}
              numberOfLines={1}
            >
              {receipt.receiptNo ?? tCommon('labels.emptyValue')} ·{' '}
              {domainLabel('paymentMethod', receipt.paymentMethod)}
            </Text>
            {onPress ? <DetailChevron /> : null}
          </XStack>
        </YStack>
      </XStack>
    </Card>
  );
}

export const ReceiptCard = memo(ReceiptCardImpl);
