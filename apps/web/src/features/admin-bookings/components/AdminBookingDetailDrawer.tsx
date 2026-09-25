'use client';

import { HistoryOutlined } from '@ant-design/icons';
import { Button } from 'antd';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { PERMISSION } from '@xeprime/types';
import { DetailDrawer } from '@/components/overlay/DetailDrawer';
import { adminAuditPath } from '@/constants/routes';
import { AUDIT_TARGET_TYPE } from '@/features/admin-audit/constants';
import { usePermissions } from '@/hooks/use-permissions';
import { useAdminBooking } from '../hooks/use-admin-bookings';
import type { AdminBookingDetail } from '../types';
import { BookingDocuments } from './booking-detail/BookingDocuments';
import { BookingDrawerHeader } from './booking-detail/BookingDrawerHeader';
import { BookingInformation } from './booking-detail/BookingInformation';
import { BookingPaymentSummary } from './booking-detail/BookingPaymentSummary';
import { BookingTimeline } from './booking-detail/BookingTimeline';

/**
 * Panel chi tiết một đơn — ĐỨNG CẠNH bảng (`modeless`, cỡ `split`), không mask: người dùng vẫn
 * thấy danh sách và bấm dòng khác để đổi đơn. Trang chừa chỗ cho bảng bằng cùng token bề rộng.
 *
 * Header (mã + trạng thái) và footer của AntD Drawer nằm ngoài vùng cuộn, nên cả hai dính cố định
 * khi nội dung dài.
 *
 * Không có nút "Mở chi tiết đầy đủ": trang chi tiết đơn duy nhất (`/manage/bookings/:id`) thuộc
 * phạm vi GIAN HÀNG và API chặn admin nền tảng. "Xem lịch sử" trỏ vào nhật ký kiểm toán lọc sẵn
 * theo đơn — route có thật, và chỉ hiện với người có quyền xem nhật ký.
 */
export function AdminBookingDetailDrawer({
  bookingId,
  onClose,
}: {
  bookingId: string | null;
  onClose: () => void;
}) {
  const t = useTranslations('AdminBookings.drawer');
  const { has } = usePermissions();
  const { data, isLoading, isError, refetch } = useAdminBooking(bookingId);

  const canViewHistory = has(PERMISSION.PLATFORM_AUDIT_VIEW);

  return (
    <DetailDrawer
      title={data ? <BookingDrawerHeader booking={data} /> : t('fallbackTitle')}
      ariaLabel={data ? t('title', { code: data.code }) : t('fallbackTitle')}
      size="split"
      modeless
      open={Boolean(bookingId)}
      onClose={onClose}
      loading={!isError && (isLoading || !data)}
      error={isError}
      errorTitle={t('loadError')}
      onRetry={() => void refetch()}
      footer={
        data && canViewHistory ? (
          <Link href={adminAuditPath.forTarget(AUDIT_TARGET_TYPE.BOOKING, data.id)}>
            <Button icon={<HistoryOutlined />}>{t('viewHistory')}</Button>
          </Link>
        ) : undefined
      }
    >
      {/* `key` ép remount khi đổi đơn: SĐT đã bỏ che của đơn trước không được rớt sang đơn sau. */}
      {data ? <Body key={data.id} booking={data} /> : null}
    </DetailDrawer>
  );
}

function Body({ booking }: { booking: AdminBookingDetail }) {
  return (
    <div>
      <BookingInformation booking={booking} />
      <BookingTimeline booking={booking} />
      <BookingPaymentSummary booking={booking} />
      <BookingDocuments booking={booking} />
    </div>
  );
}
