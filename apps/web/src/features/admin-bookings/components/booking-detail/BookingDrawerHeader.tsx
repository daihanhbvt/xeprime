'use client';

import { useTranslations } from 'next-intl';
import { BOOKING_STATUS_META, type BookingStatus } from '@xeprime/types';
import { StatusTag } from '@/components/data-display/StatusTag';
import { useAppFormat } from '@/i18n/use-app-format';
import type { AdminBookingDetail } from '../../types';
import styles from './BookingDetail.module.css';

/**
 * Tiêu đề panel: mã đơn + trạng thái cạnh nhau, dòng phụ là giờ tạo.
 *
 * Trạng thái đứng CẠNH mã chứ không ở góc phải: đó là cặp thông tin người dùng đọc cùng lúc
 * ("đơn này đang ở đâu"), và góc phải để dành cho hành động. Header của AntD Drawer vốn nằm
 * ngoài vùng cuộn nên nó luôn dính trên cùng.
 */
export function BookingDrawerHeader({ booking }: { booking: AdminBookingDetail }) {
  const t = useTranslations('AdminBookings.drawer');
  const fmt = useAppFormat();

  return (
    <div className={styles.header}>
      <div className={styles.headerTitleRow}>
        <span className={styles.headerTitle}>{t('title', { code: booking.code })}</span>
        <StatusTag
          value={booking.status as BookingStatus}
          meta={BOOKING_STATUS_META}
          group="bookingStatus"
        />
      </div>
      <div className={styles.headerMeta}>
        {t('createdAt', { time: fmt.time(booking.createdAt), date: fmt.date(booking.createdAt) })}
      </div>
    </div>
  );
}
