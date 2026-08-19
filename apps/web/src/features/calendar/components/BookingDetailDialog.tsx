'use client';

import Link from 'next/link';
import { BOOKING_STATUS_META, PERMISSION, type BookingStatus } from '@xeprime/types';
import { StatusTag } from '@/components/data-display/StatusTag';
import { ResponsiveDialog } from '@/components/overlay/ResponsiveDialog';
import { bookingPath } from '@/constants/routes';
import { BookingDetailContent } from '@/features/bookings/components/BookingDetailContent';
import { useBooking } from '@/features/bookings/hooks/use-booking';
import { usePermissions } from '@/hooks/use-permissions';
import styles from './BookingDetailDialog.module.css';

/**
 * Chi tiết đơn NGAY TRÊN LỊCH — cùng `BookingDetailContent` (và do đó cùng mutation, cùng
 * quyền) với trang `/manage/bookings/[id]`; sau mỗi thao tác, invalidation của booking mutations
 * đã phủ nhánh `calendar` nên lưới phía sau tự làm mới mà không mất khoảng/bộ lọc đang xem.
 *
 * "Mở trang chi tiết" là lối phụ để lấy link chia sẻ — click event KHÔNG điều hướng nữa.
 */
export function BookingDetailDialog({
  bookingId,
  open,
  onClose,
}: {
  bookingId: string;
  open: boolean;
  onClose: () => void;
}) {
  const { has } = usePermissions();
  const canView = has(PERMISSION.BOOKING_VIEW);
  const { data } = useBooking(open && canView ? bookingId : null);

  return (
    <ResponsiveDialog
      open={open}
      onClose={onClose}
      size="xl"
      mobileMode="fullscreen"
      footer={null}
      title={
        <span className={styles.titleRow}>
          <span>{data ? `Đơn hàng ${data.code}` : 'Đơn thuê'}</span>
          {data ? (
            <StatusTag value={data.status as BookingStatus} meta={BOOKING_STATUS_META} group="bookingStatus" />
          ) : null}
          <Link href={bookingPath.detail(bookingId)} className={styles.pageLink}>
            Mở trang chi tiết
          </Link>
        </span>
      }
    >
      <BookingDetailContent
        bookingId={bookingId}
        onNotFoundAction={{ label: 'Đóng', onClick: onClose }}
      />
    </ResponsiveDialog>
  );
}
