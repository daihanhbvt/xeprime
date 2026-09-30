import { Fragment } from 'react';
import { useTranslations } from 'use-intl';
import { RECEIPT_STATUS_META, RECEIPT_TYPE } from '@xeprime/types';
import { LIST_SEPARATOR } from '@xeprime/domain';
import { Divider } from '@/components/ui/DataRow';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { useAppFormat } from '@/i18n/use-app-format';
import { useDomainLabel } from '@/i18n/domain';
import { colors } from '@/theme/tokens';
import type { Receipt } from '@/features/finance/api';
import { MiniListRow } from './MiniListRow';

/**
 * Vài phiếu thu/chi gần nhất trong khối "Thu Chi hôm nay" — cùng bốn mẩu với web: danh mục ·
 * mã phiếu + mã đơn + giờ · số tiền có dấu · trạng thái duyệt.
 *
 * Trạng thái là mẩu app từng bỏ mất, và nó không thay thế được bằng gì: một phiếu `pending` vẫn
 * hiện đủ số tiền, nên thiếu nhãn thì người đọc cộng luôn nó vào tiền đã vào két.
 *
 * Phiếu CHI mang dấu trừ và MÀU LỖI, phiếu thu mang màu giá — đúng cặp `.price` / `.amountOut`
 * của web. Hai dòng cùng in "500.000 ₫" mà một là tiền vào, một là tiền ra thì con số mất hết
 * nghĩa. Dấu trừ đi qua message (`Dashboard.receiptRow`) chứ không nối chuỗi ở đây: định dạng
 * tiền âm không giống nhau giữa hai ngôn ngữ.
 */
export function ReceiptMiniList({
  items,
  onSelect,
}: {
  items: readonly Receipt[];
  onSelect: (receipt: Receipt) => void;
}) {
  const t = useTranslations('Dashboard.receiptRow');
  const tCommon = useTranslations('Common.labels');
  const fmt = useAppFormat();
  const domainLabel = useDomainLabel();

  return (
    <>
      {items.map((receipt, index) => {
        const income = receipt.type === RECEIPT_TYPE.INCOME;
        const amount = fmt.money(receipt.amount);

        return (
          <Fragment key={receipt.id}>
            {index > 0 ? <Divider /> : null}
            <MiniListRow
              title={receipt.categoryName ?? receipt.description ?? tCommon('emptyValue')}
              meta={[receipt.receiptNo, receipt.bookingCode, fmt.time(receipt.occurredAt)]
                .filter(Boolean)
                .join(LIST_SEPARATOR)}
              amount={income ? amount : t('expenseAmount', { amount })}
              amountTone={income ? colors.price : colors.danger}
              accessibilityLabel={
                income ? t('incomeAria', { amount }) : t('expenseAria', { amount })
              }
              onPress={() => onSelect(receipt)}
              badge={
                <StatusBadge
                  label={domainLabel(
                    'receiptStatus',
                    receipt.status,
                    RECEIPT_STATUS_META[receipt.status]?.label,
                  )}
                  color={RECEIPT_STATUS_META[receipt.status]?.color ?? 'default'}
                  size="xs"
                />
              }
            />
          </Fragment>
        );
      })}
    </>
  );
}
