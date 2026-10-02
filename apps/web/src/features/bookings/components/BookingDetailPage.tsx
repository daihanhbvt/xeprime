'use client';

import { useParams, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { BOOKING_STATUS_META, PERMISSION, type BookingStatus } from '@xeprime/types';
import { StatusTag } from '@/components/data-display/StatusTag';
import { ManagePageHeader } from '@/components/layout/ManagePageHeader';
import { ROUTES } from '@/constants/routes';
import { useBranchReturnHref } from '@/features/branches/hooks/use-branch-return';
import { BookingDetailContent } from '@/features/bookings/components/BookingDetailContent';
import { useBooking } from '@/features/bookings/hooks/use-booking';
import { usePermissions } from '@/hooks/use-permissions';
import styles from './BookingDetailPage.module.css';

/**
 * Chi tiết một đơn thuê — route THẬT (Wave 10).
 *
 * Vì sao là trang chứ không phải drawer: vận hành một chuyến kéo dài nhiều ngày, nhiều người
 * cùng nhìn, và người ta gửi link cho nhau.
 *
 * Toàn bộ nội dung nằm ở `BookingDetailContent` — dùng CHUNG với modal chi tiết trên lịch
 * (Wave lịch), nên hai bề mặt không bao giờ lệch nhau. Trang chỉ thêm header điều hướng.
 */
export function BookingDetailPage() {
  const params = useParams<{ id: string }>();
  const bookingId = params?.id ?? '';
  const router = useRouter();
  const { has } = usePermissions();
  const t = useTranslations('Bookings.detail');
  // Quay lại danh sách với đúng chi nhánh đang lọc lúc mở đơn (ADR 0052).
  const listHref = useBranchReturnHref(ROUTES.MANAGE.BOOKINGS);

  // Header cần mã đơn + trạng thái; cùng query key với content nên không thêm request nào.
  const { data } = useBooking(has(PERMISSION.BOOKING_VIEW) ? bookingId : null);

  return (
    <div className={styles.page}>
      <ManagePageHeader
        title={data ? t('titleWithCode', { code: data.code }) : t('title')}
        subtitle={t('pageSubtitle')}
        onBack={() => router.push(listHref)}
        extra={
          data ? <StatusTag value={data.status as BookingStatus} meta={BOOKING_STATUS_META} group="bookingStatus" /> : null
        }
      />
      <BookingDetailContent
        bookingId={bookingId}
        onNotFoundAction={{
          label: t('backToList'),
          onClick: () => router.push(listHref),
        }}
      />
    </div>
  );
}
