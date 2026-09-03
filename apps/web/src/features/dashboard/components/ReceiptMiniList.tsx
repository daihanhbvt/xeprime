'use client';

import { Spin } from 'antd';
import { useTranslations } from 'next-intl';
import { RECEIPT_STATUS_META, RECEIPT_TYPE, type ReceiptStatus } from '@xeprime/types';
import { StatusTag } from '@/components/data-display/StatusTag';
import type { Receipt } from '@/features/finance/types';
import { useAppFormat } from '@/i18n/use-app-format';
import { cx } from '@/lib/cx';
import styles from './MiniList.module.css';

/**
 * Sổ quỹ hôm nay ở dạng rút gọn cho panel dashboard — cùng khuôn với `BookingMiniList`
 * (loading/empty tự lo, một dòng là một nút mở sổ đầy đủ).
 *
 * Dòng CHI hiện dấu trừ và màu lỗi: trên một danh sách trộn thu lẫn chi, chiều của tiền là
 * thông tin quan trọng nhất và nó phải đọc được mà không cần bấm vào.
 */
export function ReceiptMiniList({
  items,
  loading,
  empty,
  onSelect,
}: {
  items: Receipt[];
  loading: boolean;
  empty: string;
  onSelect: () => void;
}) {
  const fmt = useAppFormat();
  const t = useTranslations('Dashboard.receiptRow');
  const tCommon = useTranslations('Common.labels');

  if (loading && items.length === 0) {
    return (
      <div className={styles.center}>
        <Spin />
      </div>
    );
  }
  if (items.length === 0) {
    return <div className={styles.empty}>{empty}</div>;
  }

  return (
    <ul className={styles.list}>
      {items.map((r) => {
        const isExpense = r.type === RECEIPT_TYPE.EXPENSE;
        const amount = fmt.money(r.amount);
        return (
          <li key={r.id} className={styles.row}>
            <button
              type="button"
              className={styles.rowBtn}
              onClick={onSelect}
              // Số tiền của một dòng CHI đọc lên phải là "chi", không phải một số dương trôi nổi.
              aria-label={t(isExpense ? 'expenseAria' : 'incomeAria', { amount })}
            >
              <div className={styles.info}>
                <div className={styles.name}>
                  {r.categoryName ?? r.description ?? tCommon('emptyValue')}
                </div>
                <div className={styles.meta}>
                  {[r.receiptNo, r.bookingCode, fmt.time(r.occurredAt)].filter(Boolean).join(' · ')}
                </div>
              </div>
              <div className={styles.right}>
                <span className={cx(styles.price, isExpense && styles.amountOut)}>
                  {isExpense ? t('expenseAmount', { amount }) : amount}
                </span>
                <StatusTag
                  value={r.status as ReceiptStatus}
                  meta={RECEIPT_STATUS_META}
                  group="receiptStatus"
                />
              </div>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
