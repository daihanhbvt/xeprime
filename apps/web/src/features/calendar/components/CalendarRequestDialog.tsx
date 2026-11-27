'use client';

import { App, Skeleton } from 'antd';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { usePathname, useSearchParams } from 'next/navigation';
import { PERMISSION } from '@xeprime/types';
import { ResponsiveDialog } from '@/components/overlay/ResponsiveDialog';
import { fetchBookingRequest } from '@/features/booking-requests/api';
import { BookingRequestDetailDialog } from '@/features/booking-requests/components/BookingRequestDetailDialog';
import type { BookingRequestDecisions } from '@/features/booking-requests/hooks/use-booking-request-decisions';
import { BookingDetailDialog } from '@/features/bookings/components/BookingDetailDialog';
import { VehicleDetailDialog } from '@/features/vehicles/components/VehicleDetailDialog';
import { usePermissions } from '@/hooks/use-permissions';
import { useErrorMessage } from '@/i18n/use-error-message';
import { queryKeys } from '@/services/query-keys';

/**
 * Chi tiết một YÊU CẦU mở từ lịch (thẻ "Cần xử lý" / "Chờ khách thanh toán") — CHÍNH hộp chi tiết +
 * luồng duyệt/từ chối/huỷ của màn "Đơn thuê xe", không dựng bản thứ hai. Ở lại lịch: duyệt xong thì
 * lưới tự nạp lại (mutation làm mới `calendar.*`).
 *
 * Yêu cầu vừa thành đơn (khách trả đủ trong lúc đang xem) ⇒ mở chi tiết ĐƠN. Không đọc được (đã
 * khép, gian hàng khác) ⇒ báo lỗi theo mã và đóng, không treo một hộp rỗng.
 *
 * `decisions` đến từ lịch chứ không tạo ở đây: bấm "Duyệt" là ĐÓNG hộp này rồi mở hộp duyệt — hộp
 * duyệt phải sống sau khi component này đã gỡ.
 */
export function CalendarRequestDialog({
  requestId,
  decisions,
  onClose,
}: {
  requestId: string;
  decisions: BookingRequestDecisions;
  onClose: () => void;
}) {
  const t = useTranslations('Calendar');
  const { has } = usePermissions();
  const { message } = App.useApp();
  const errorMessage = useErrorMessage();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [vehicleId, setVehicleId] = useState<string | null>(null);

  const request = useQuery({
    queryKey: queryKeys.bookingRequests.detail(requestId),
    queryFn: () => fetchBookingRequest(requestId),
    retry: false,
  });

  useEffect(() => {
    if (!request.error) return;
    message.error(errorMessage(request.error));
    onClose();
  }, [request.error, message, errorMessage, onClose]);

  const row = request.data ?? null;
  const query = searchParams.toString();
  const backHref = query ? `${pathname}?${query}` : pathname;

  if (row?.bookingId && has(PERMISSION.BOOKING_VIEW)) {
    return <BookingDetailDialog bookingId={row.bookingId} open onClose={onClose} />;
  }

  return (
    <>
      {request.isLoading ? (
        <ResponsiveDialog
          open
          onClose={onClose}
          size="md"
          footer={null}
          title={t('requestDialog.loading')}
        >
          <Skeleton active paragraph={{ rows: 6 }} />
        </ResponsiveDialog>
      ) : null}

      <BookingRequestDetailDialog
        request={row}
        canApprove={has(PERMISSION.BOOKING_REQUEST_APPROVE)}
        pendingAction={row ? decisions.decisionActionFor(row.id) : null}
        onClose={onClose}
        onApprove={(item) => {
          onClose();
          decisions.openApprove(item);
        }}
        onReject={(item) => {
          onClose();
          decisions.openReject(item);
        }}
        onCancel={(item) => {
          onClose();
          decisions.openCancel(item);
        }}
        onOpenVehicle={(item) => setVehicleId(item.vehicleId)}
        backHref={backHref}
      />

      {vehicleId ? (
        <VehicleDetailDialog vehicleId={vehicleId} open onClose={() => setVehicleId(null)} />
      ) : null}
    </>
  );
}
