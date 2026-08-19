'use client';

import { Alert, Button, List, Skeleton } from 'antd';
import Link from 'next/link';
import {
  RECEIPT_SOURCE_META,
  RECEIPT_STATUS_META,
  type ReceiptSource,
  type ReceiptStatus,
} from '@xeprime/types';
import { StatusTag } from '@/components/data-display/StatusTag';
import { EmptyState } from '@/components/feedback/EmptyState';
import { receiptsPath } from '@/constants/routes';
import { ReceiptAmount } from '@/features/finance/components/ReceiptAmount';
import { useReceipts } from '@/features/finance/hooks/use-receipts';
import { useAppFormat } from '@/i18n/use-app-format';
import styles from './CustomerReceiptsPanel.module.css';

/** Vài phiếu gần nhất là đủ để trả lời "khách này đã đưa/nhận bao nhiêu"; xem đủ thì sang sổ. */
const PREVIEW_LIMIT = 10;

/**
 * Thu chi của MỘT khách — tab thật, không phải một đường dẫn.
 *
 * Khác chi tiết đơn và hồ sơ xe (đã có bề mặt tiền riêng nên chỉ cần link), sổ khách trước nay
 * **không có chỗ nào** nói về tiền của khách đó ngoài các con số tổng. Cột `receipts.tenant_customer_id`
 * và index của nó có từ S-01 mà không đường ghi nào điền — epic nối tiền điền, và đây là nơi nó
 * trả lại giá trị.
 *
 * Gác quyền `finance.view` ở nơi gọi: tiền là quyền RIÊNG trong sổ khách (luật của S-01).
 */
export function CustomerReceiptsPanel({ customerId }: { customerId: string }) {
  const fmt = useAppFormat();
  const { data, isLoading, isError, refetch } = useReceipts({
    tenantCustomerId: customerId,
    limit: PREVIEW_LIMIT,
  });

  if (isLoading) return <Skeleton active paragraph={{ rows: 4 }} title={false} />;

  if (isError) {
    return (
      <Alert
        type="error"
        showIcon
        message="Không tải được phiếu thu chi của khách"
        action={
          <Button size="small" onClick={() => void refetch()}>
            Thử lại
          </Button>
        }
      />
    );
  }

  const items = data?.items ?? [];
  const total = data?.meta.total ?? 0;

  if (items.length === 0) {
    return (
      <EmptyState
        variant="empty"
        title="Chưa có phiếu thu chi nào gắn với khách này"
        description="Phiếu sẽ tự xuất hiện ở đây khi bạn thu tiền, thu cọc hoặc hoàn cọc cho đơn của khách."
      />
    );
  }

  return (
    <div className={styles.panel}>
      <List
        size="small"
        dataSource={items}
        renderItem={(row) => (
          <List.Item>
            <div className={styles.row}>
              <ReceiptAmount type={row.type} amount={row.amount} />
              <span className={styles.meta}>
                {fmt.date(row.occurredAt)} · {row.categoryName ?? 'Chưa phân loại'}
                {row.bookingCode ? ` · ${row.bookingCode}` : ''}
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
      {total > items.length ? (
        <Link href={receiptsPath.filtered({ tenantCustomerId: customerId })}>
          <Button type="link">Xem tất cả {total} phiếu</Button>
        </Link>
      ) : null}
    </div>
  );
}
