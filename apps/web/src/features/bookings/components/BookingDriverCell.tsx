'use client';

import { useTranslations } from 'next-intl';
import { DRIVER_ASSIGNMENT_STATUS_META, SERVICE_TYPE } from '@xeprime/types';
import { StatusTag } from '@/components/data-display/StatusTag';
import type { BookingListItem } from '../types';
import styles from './BookingDriverCell.module.css';

/**
 * Ô "Tài xế" của mọi bảng đơn thuê ở site partner (ADR 0063).
 *
 * - đơn không phải `with_driver` và không có tài xế cũ ⇒ "—" (không áp dụng);
 * - đơn `with_driver` chưa có ai ⇒ "Chưa phân công" tông cảnh báo — đơn chưa chạy được;
 * - có tài xế ⇒ tên + nhãn lượt gán (chờ nhận / đã nhận).
 */
export function BookingDriverCell({
  booking,
}: {
  booking: { serviceType: string; driver?: BookingListItem['driver'] };
}) {
  const t = useTranslations('Bookings.driver');
  const driver = booking.driver ?? null;
  if (driver) {
    return (
      <span className={styles.cell}>
        <span className={styles.name}>{driver.name}</span>
        <StatusTag
          value={driver.assignmentStatus}
          meta={DRIVER_ASSIGNMENT_STATUS_META}
          group="driverAssignmentStatus"
        />
      </span>
    );
  }
  if (booking.serviceType === SERVICE_TYPE.WITH_DRIVER) {
    return <span className={styles.missing}>{t('none')}</span>;
  }
  return <span className={styles.muted}>—</span>;
}
