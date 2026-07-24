'use client';

import { Spin } from 'antd';
import { BOOKING_STATUS_META, type BookingStatus } from '@xeprime/types';
import { StatusTag } from '@/components/data-display/StatusTag';
import { formatDateTimeRange } from '@/lib/datetime';
import { formatMoneyVnd } from '@/lib/money';
import type { BookingListItem } from '@/features/bookings/types';
import styles from './BookingMiniList.module.css';

/**
 * Danh sách đơn rút gọn cho panel dashboard. Tự lo loading/empty để panel luôn có hình hài.
 * Click một dòng → mở đơn ở trang Đơn thuê (onSelect).
 */
export function BookingMiniList({
  items,
  loading,
  empty,
  onSelect,
}: {
  items: BookingListItem[];
  loading: boolean;
  empty: string;
  onSelect: (id: string) => void;
}) {
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
      {items.map((b) => (
        <li key={b.id} className={styles.row}>
          <button type="button" className={styles.rowBtn} onClick={() => onSelect(b.id)}>
            <div className={styles.info}>
              <div className={styles.name}>{b.customerName}</div>
              <div className={styles.meta}>
                {b.vehicleName} · {formatDateTimeRange(b.pickupAt, b.returnAt)}
              </div>
            </div>
            <div className={styles.right}>
              <span className={styles.price}>{formatMoneyVnd(b.totalAmount)}</span>
              <StatusTag value={b.status as BookingStatus} meta={BOOKING_STATUS_META} />
            </div>
          </button>
        </li>
      ))}
    </ul>
  );
}
