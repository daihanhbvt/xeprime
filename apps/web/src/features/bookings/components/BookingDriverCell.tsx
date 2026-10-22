'use client';

import { Tag } from 'antd';
import { useTranslations } from 'next-intl';
import { DRIVER_ASSIGNMENT_STATUS_META, DRIVER_SOURCE, SERVICE_TYPE } from '@xeprime/types';
import { StatusTag } from '@/components/data-display/StatusTag';
import type { BookingListItem } from '../types';
import styles from './BookingDriverCell.module.css';

/**
 * Ô "Tài xế" của mọi bảng đơn thuê ở site partner (ADR 0063 · ADR 0067).
 *
 * - đơn không phải `with_driver` và không có tài xế cũ ⇒ "—" (không áp dụng);
 * - đơn `with_driver` chưa có ai ⇒ "Chưa phân công" tông cảnh báo — đơn chưa chạy được;
 * - tài xế liên kết ⇒ tên + nhãn lượt gán (chờ nhận / đã nhận);
 * - tài xế ngoài hệ thống ⇒ tên + nhãn "Ngoài hệ thống" (đã phủ chuyến, không có lượt chờ).
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
        {driver.source === DRIVER_SOURCE.EXTERNAL ? (
          <Tag>{t('external')}</Tag>
        ) : (
          <StatusTag
            value={driver.assignmentStatus}
            meta={DRIVER_ASSIGNMENT_STATUS_META}
            group="driverAssignmentStatus"
          />
        )}
      </span>
    );
  }
  if (booking.serviceType === SERVICE_TYPE.WITH_DRIVER) {
    return <span className={styles.missing}>{t('none')}</span>;
  }
  return <span className={styles.muted}>—</span>;
}
