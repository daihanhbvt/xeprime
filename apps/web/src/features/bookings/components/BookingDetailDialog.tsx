'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { BOOKING_STATUS_META, PERMISSION, type BookingStatus } from '@xeprime/types';
import { StatusTag } from '@/components/data-display/StatusTag';
import { ResponsiveDialog } from '@/components/overlay/ResponsiveDialog';
import { bookingPath } from '@/constants/routes';
import { usePermissions } from '@/hooks/use-permissions';
import { BookingDetailContent } from './BookingDetailContent';
import { useBooking } from '../hooks/use-booking';
import styles from './BookingDetailDialog.module.css';

/**
 * Chi tiết một đơn thuê dưới dạng MODAL — cùng `BookingDetailContent` (và do đó cùng mutation,
 * cùng quyền) với trang `/manage/bookings/[id]`; sau mỗi thao tác, invalidation của booking
 * mutations phủ luôn các nhánh liên quan nên danh sách phía sau tự làm mới mà không mất bộ lọc
 * đang xem.
 *
 * "Mở trang chi tiết" là lối phụ để lấy link chia sẻ — bấm vào đơn KHÔNG điều hướng nữa.
 *
 * Sống ở `features/bookings` chứ không ở `features/calendar`: nó bọc `BookingDetailContent` của
 * chính feature này, và từ đợt 19/08 có consumer thứ hai (hộp thư yêu cầu thuê). Để nó nằm
 * trong calendar sẽ biến "xem chi tiết một đơn" thành thứ phải đi vòng qua màn lịch.
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
  const t = useTranslations('Bookings');
  const tCommon = useTranslations('Common');
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
          <span>{data ? t('detail.titleWithCode', { code: data.code }) : t('detail.title')}</span>
          {data ? (
            <StatusTag
              value={data.status as BookingStatus}
              meta={BOOKING_STATUS_META}
              group="bookingStatus"
            />
          ) : null}
          <Link href={bookingPath.detail(bookingId)} className={styles.pageLink}>
            {t('detail.openPage')}
          </Link>
        </span>
      }
    >
      <BookingDetailContent
        bookingId={bookingId}
        onNotFoundAction={{ label: tCommon('actions.close'), onClick: onClose }}
      />
    </ResponsiveDialog>
  );
}
