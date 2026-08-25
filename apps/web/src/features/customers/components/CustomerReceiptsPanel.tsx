'use client';

import { Alert, Button, List, Skeleton } from 'antd';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import {
  RECEIPT_SOURCE_META,
  RECEIPT_STATUS_META,
  type ReceiptSource,
  type ReceiptStatus,
} from '@xeprime/types';
import { StatusTag } from '@/components/data-display/StatusTag';
import { EmptyState } from '@/components/feedback/EmptyState';
import { receiptsPath } from '@/constants/routes';
import { FinanceEntityPanel } from '@/features/finance/components/FinanceEntityPanel';
import { ReceiptAmount } from '@/features/finance/components/ReceiptAmount';
import { useReceipts } from '@/features/finance/hooks/use-receipts';
import { useAppFormat } from '@/i18n/use-app-format';
import styles from './CustomerReceiptsPanel.module.css';

/** Vài phiếu gần nhất là đủ để trả lời "khách này đã đưa/nhận bao nhiêu"; xem đủ thì sang sổ. */
const PREVIEW_LIMIT = 10;

/**
 * Tiền của MỘT khách — tab thật, không phải một đường dẫn.
 *
 * Hai tầng, cố ý xếp theo thứ tự này:
 *  1. **Doanh thu theo kỳ** (`FinanceEntityPanel`) — "khách này mang lại bao nhiêu tiền THẬT
 *     trong kỳ", cộng trên phiếu đã duyệt, cùng phép tính với màn Tổng quan doanh thu.
 *  2. **Danh sách phiếu gần nhất** — bằng chứng đằng sau con số đó.
 *
 * Con số ở đây KHÁC ba thẻ "Tổng giá trị thuê / Đã thu / Còn nợ" phía trên hồ sơ, và khác một
 * cách có chủ đích: ba thẻ đó tính trên ĐƠN (luỹ kế, để đi đòi nợ), còn khối này tính trên TIỀN
 * THẬT ĐÃ VÀO theo kỳ. Hai câu hỏi khác nhau nên hai con số — nhãn của từng khối nói rõ điều đó.
 *
 * Gác quyền `finance.view` ở nơi gọi: tiền là quyền RIÊNG trong sổ khách (luật của S-01).
 */
export function CustomerReceiptsPanel({ customerId }: { customerId: string }) {
  const t = useTranslations('Customers.finance');
  const fmt = useAppFormat();
  const { data, isLoading, isError, refetch } = useReceipts({
    tenantCustomerId: customerId,
    limit: PREVIEW_LIMIT,
  });

  const items = data?.items ?? [];
  const total = data?.meta.total ?? 0;

  return (
    <div className={styles.panel}>
      <FinanceEntityPanel scope={{ tenantCustomerId: customerId }} kind="customer" />

      <section className={styles.receipts} aria-label={t('list.title')}>
        <h3 className={styles.listTitle}>{t('list.title')}</h3>

        {isLoading ? (
          <Skeleton active paragraph={{ rows: 4 }} title={false} />
        ) : isError ? (
          <Alert
            type="error"
            showIcon
            message={t('list.error')}
            action={
              <Button size="small" onClick={() => void refetch()}>
                {t('list.retry')}
              </Button>
            }
          />
        ) : items.length === 0 ? (
          <EmptyState
            variant="empty"
            title={t('list.emptyTitle')}
            description={t('list.emptyHint')}
          />
        ) : (
          <>
            <List
              size="small"
              dataSource={items}
              renderItem={(row) => (
                <List.Item>
                  <div className={styles.row}>
                    <ReceiptAmount type={row.type} amount={row.amount} />
                    <span className={styles.meta}>
                      {fmt.date(row.occurredAt)} · {row.categoryName ?? t('list.uncategorized')}
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
                <Button type="link">{t('list.viewAll', { count: total })}</Button>
              </Link>
            ) : null}
          </>
        )}
      </section>
    </div>
  );
}
