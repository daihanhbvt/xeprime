'use client';

import { Alert, List, Skeleton, Typography } from 'antd';
import {
  RECEIPT_SOURCE,
  RECEIPT_SOURCE_META,
  RECEIPT_STATUS_META,
  type ReceiptSource,
  type ReceiptStatus,
} from '@xeprime/types';
import { StatusTag } from '@/components/data-display/StatusTag';
import { useAppFormat } from '@/i18n/use-app-format';
import { useReceipts } from '../hooks/use-receipts';
import { ReceiptAmount } from './ReceiptAmount';
import styles from './BookingReceiptList.module.css';

/** Đủ để thấy các khoản ghi thẳng ở sổ; nhiều hơn thì sang `/manage/receipts?bookingId=`. */
const PREVIEW_LIMIT = 20;

/**
 * Các khoản của đơn được ghi THẲNG ở sổ Thu-Chi — thứ `PaymentHistory` không biết.
 *
 * `PaymentHistory` liệt kê `payments`, tức chỉ tiền đi qua nút "Thu tiền". Một khoản quá giờ
 * 200k nhập bằng phiếu tay ở `/manage/receipts` không nằm trong đó, nên trước đây màn đơn im
 * lặng trong khi sổ đã có tiền — đúng thứ khiến hai con số lệch nhau mà không ai giải thích được.
 *
 * Chỉ hiện phiếu KHÔNG sinh từ payment: phiếu `source = payment` đã là dòng của `PaymentHistory`,
 * liệt kê lại là kể hai lần một khoản.
 */
export function BookingReceiptList({ bookingId }: { bookingId: string }) {
  const fmt = useAppFormat();
  const { data, isLoading, isError } = useReceipts({ bookingId, limit: PREVIEW_LIMIT });

  const items = (data?.items ?? []).filter((r) => r.source !== RECEIPT_SOURCE.PAYMENT);

  if (isLoading) return <Skeleton active paragraph={{ rows: 2 }} title={false} />;
  if (isError) {
    return <Alert type="warning" showIcon message="Không tải được phiếu thu chi của đơn" />;
  }
  if (items.length === 0) return null;

  return (
    <section className={styles.section}>
      <Typography.Text type="secondary" className={styles.title}>
        Khoản ghi ở sổ Thu-Chi
      </Typography.Text>
      <List
        size="small"
        dataSource={items}
        renderItem={(row) => (
          <List.Item>
            <div className={styles.row}>
              <ReceiptAmount type={row.type} amount={row.amount} />
              <span className={styles.meta}>
                {fmt.date(row.occurredAt)} · {row.categoryName ?? 'Chưa phân loại'}
              </span>
              <StatusTag
                value={row.source as ReceiptSource}
                meta={RECEIPT_SOURCE_META}
                group="receiptSource"
              />
              <StatusTag
                value={row.status as ReceiptStatus}
                meta={RECEIPT_STATUS_META}
                group="receiptStatus"
              />
            </div>
          </List.Item>
        )}
      />
    </section>
  );
}
