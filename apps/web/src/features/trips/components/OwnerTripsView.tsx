'use client';

import { Button } from 'antd';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { CUSTOMER_TRIP_FILTER, PERMISSION, TRIP_ROLE } from '@xeprime/types';
import { EmptyState } from '@/components/feedback/EmptyState';
import { ResponsiveDialog } from '@/components/overlay/ResponsiveDialog';
import { ROUTES } from '@/constants/routes';
import { AccountPageHeader } from '@/features/account/components/AccountPageHeader';
import { currentPathWithQuery } from '@/features/auth/safe-next';
import { fetchBookingRequest } from '@/features/booking-requests/api';
import { BookingRequestDetailDialog } from '@/features/booking-requests/components/BookingRequestDetailDialog';
import { useBookingRequestDecisions } from '@/features/booking-requests/hooks/use-booking-request-decisions';
import { BookingDetailDialog } from '@/features/bookings/components/BookingDetailDialog';
import { VehicleDetailDialog } from '@/features/vehicles/components/VehicleDetailDialog';
import { usePermissions } from '@/hooks/use-permissions';
import { useErrorMessage } from '@/i18n/use-error-message';
import { queryKeys } from '@/services/query-keys';
import { tripToDecisionTarget } from '../decision-target';
import { useTrips } from '../hooks';
import type { CustomerTrip } from '../types';
import { useTripListUrl } from '../use-trip-list-url';
import { TripCard } from './TripCard';
import { TripList } from './TripList';
import styles from './OwnerTripsView.module.css';

/**
 * Chuyến đang mở chi tiết — MỘT trạng thái cho cả hai hộp thoại, nên không bao giờ có hai hộp
 * thoại chồng nhau (bấm thẻ A rồi thẻ B khi A còn đang nạp: B thắng, A bị bỏ).
 */
type OpenTrip = { kind: 'booking'; id: string } | { kind: 'request'; id: string };

/**
 * `Chuyến cho thuê` — CHỦ xe tuyến hoa hồng (Owner Lite) ở site partner.
 *
 * ## Vì sao không dùng hộp thư + bảng đơn của gian hàng
 *
 * Chủ xe cá nhân có một tới ba chiếc. Hộp thư `/booking-requests` (nhiều tab, thanh lọc, chi
 * nhánh) và bảng `/bookings` dựng cho đội xe hàng chục chiếc; với vài chuyến chúng là hai màn phải
 * mở lần lượt. Trước ADR 0053 chủ xe đọc chuyến của mình dạng THẺ trong "Chuyến của tôi" ở site
 * khách — màn này trả lại đúng giao diện đó, ở đúng site của họ: MỘT danh sách gộp yêu cầu và
 * đơn, hai tab hiện tại / lịch sử, duyệt hoặc từ chối ngay trên thẻ.
 *
 * Chỉ dành cho CHỦ: `GET /trips` dựng phía chủ xe cho chủ gian hàng (`resolveScope`). Thành viên
 * không phải chủ được `partnerPageRedirect` giữ ở hộp thư + bảng đơn.
 *
 * ## Không có nguồn sự thật thứ hai
 *
 *  - Danh sách đọc `GET /trips?role=host` — server khoá vai và phạm vi (`scopeWhere`), lọc, đếm
 *    và phân trang trong cùng một vị từ.
 *  - Duyệt/từ chối/huỷ đi qua `useBookingRequestDecisions` — CÙNG hook với hộp thư gian hàng, nên
 *    quy tắc thuê dài hạn, hạn phản hồi và lỗi trùng lịch không thể trôi khỏi nhau.
 *  - "Xem chi tiết" mở CHÍNH hai hộp thoại của Manage: có đơn ⇒ `BookingDetailDialog` (bàn giao,
 *    chuyển trạng thái, phí giao xe); chưa có đơn ⇒ `BookingRequestDetailDialog`. Trang
 *    `/trips/[id]` của site khách viết bằng giọng của NGƯỜI ĐI THUÊ ("đang chờ chủ xe xác nhận")
 *    nên không mượn được.
 */
export function OwnerTripsView() {
  const t = useTranslations('Trips');
  const errorMessage = useErrorMessage();
  const queryClient = useQueryClient();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { has } = usePermissions();

  const canApprove = has(PERMISSION.BOOKING_REQUEST_APPROVE);
  const canViewBooking = has(PERMISSION.BOOKING_VIEW);

  const { filter, page, navigate } = useTripListUrl(ROUTES.MANAGE.TRIPS);
  const { data, isLoading, isError, error, refetch, isFetching } = useTrips(
    filter,
    page,
    TRIP_ROLE.HOST,
  );
  const decisions = useBookingRequestDecisions();

  /** Chỗ đang đứng kèm tab/trang — link "Xem lịch xe" trong hộp thoại yêu cầu quay về đúng đây. */
  const backHref = currentPathWithQuery(pathname, searchParams.toString());

  const [openTrip, setOpenTrip] = useState<OpenTrip | null>(null);
  const [vehicleDetailId, setVehicleDetailId] = useState<string | null>(null);

  /*
   * Yêu cầu đang mở đọc ĐÚNG dòng hộp thư của nó (`GET /booking-requests/:id`): `/trips` trả một DTO
   * hẹp hơn, còn hộp thoại cần đủ trường. `staleTime: 0` vì trạng thái một yêu cầu đổi theo phút
   * (khách huỷ, hết hạn phản hồi) — mở lại trong vòng 30 giây không được bày nút "Duyệt" cho một
   * yêu cầu đã đóng. Nằm dưới tiền tố `bookingRequests`, nên mọi quyết định (vốn invalidate cả tiền
   * tố) làm mới luôn bản đang mở.
   */
  const requestId = openTrip?.kind === 'request' ? openTrip.id : null;
  const request = useQuery({
    queryKey: queryKeys.bookingRequests.detail(requestId ?? ''),
    queryFn: () => fetchBookingRequest(requestId ?? ''),
    enabled: requestId !== null,
    staleTime: 0,
  });
  const detailRequest = requestId !== null && request.data?.id === requestId ? request.data : null;

  /** Có đơn thì vào đơn (đủ công cụ vận hành), chưa có thì vào yêu cầu. */
  function openDetail(trip: CustomerTrip) {
    setOpenTrip(
      trip.bookingId && canViewBooking
        ? { kind: 'booking', id: trip.bookingId }
        : { kind: 'request', id: trip.id },
    );
  }

  function closeDetail() {
    setOpenTrip(null);
  }

  if (isError) {
    return (
      <div className={styles.page}>
        <EmptyState
          variant="error"
          title={t('list.errorTitle')}
          description={errorMessage(error)}
          action={
            <Button type="primary" onClick={() => void refetch()}>
              {t('list.retry')}
            </Button>
          }
        />
      </div>
    );
  }

  const history = filter === CUSTOMER_TRIP_FILTER.HISTORY;

  return (
    <div className={styles.page}>
      <AccountPageHeader title={t('hostList.heading')} subtitle={t('hostList.sub')} />

      <TripList
        filter={filter}
        data={data}
        isLoading={isLoading}
        isFetching={isFetching}
        onNavigate={navigate}
        renderTrip={(trip) => (
          <TripCard
            trip={trip}
            onOpenDetail={openDetail}
            detailLoading={requestId === trip.id && request.isPending}
            decisions={
              canApprove
                ? {
                    onApprove: (row) => decisions.openApprove(tripToDecisionTarget(row)),
                    onReject: (row) => decisions.openReject(tripToDecisionTarget(row)),
                    pending: decisions.decisionActionFor(trip.id),
                  }
                : undefined
            }
          />
        )}
        /*
         * Hai tab trống, hai lối thoát: chưa có chuyến nào đang chạy thì việc có ích là xem lại xe
         * (đã lên chợ chưa, giá, lịch) — không phải "đi tìm xe" của khách; lịch sử trống thì quay
         * về tab đang có chuyến.
         */
        empty={
          <EmptyState
            variant="empty"
            title={history ? t('list.emptyHistoryTitle') : t('hostList.emptyCurrentTitle')}
            description={history ? t('list.emptyHistoryBody') : t('hostList.emptyCurrentBody')}
            action={
              history ? (
                <Button onClick={() => navigate({ filter: CUSTOMER_TRIP_FILTER.CURRENT })}>
                  {t('list.viewCurrent')}
                </Button>
              ) : (
                <Button type="primary" onClick={() => router.push(ROUTES.MANAGE.VEHICLES)}>
                  {t('hostList.viewVehicles')}
                </Button>
              )
            }
          />
        }
      />

      {/*
        Hộp thoại đơn có bàn giao, chuyển trạng thái, phí giao xe — mutation của chúng làm mới
        `bookings`, không làm mới `trips`. Đóng hộp thoại là lúc làm mới danh sách này: một chỗ,
        bắt được mọi thao tác đã làm bên trong.
      */}
      {openTrip?.kind === 'booking' ? (
        <BookingDetailDialog
          bookingId={openTrip.id}
          open
          onClose={() => {
            closeDetail();
            void queryClient.invalidateQueries({ queryKey: queryKeys.trips.all });
          }}
        />
      ) : null}

      {/*
        Hồ sơ KHÁCH (sổ khách hàng) không mở từ đây: đó là năng lực của gói (ADR 0027 điều 1), và
        Owner Lite không có mục đó — hộp thoại vẫn hiện tên + liên hệ của khách.
      */}
      <BookingRequestDetailDialog
        request={detailRequest}
        canApprove={canApprove}
        pendingAction={detailRequest ? decisions.decisionActionFor(detailRequest.id) : null}
        onClose={closeDetail}
        onApprove={(row) => {
          closeDetail();
          decisions.openApprove(row);
        }}
        onReject={(row) => {
          closeDetail();
          decisions.openReject(row);
        }}
        onCancel={(row) => {
          closeDetail();
          decisions.openCancel(row);
        }}
        onOpenVehicle={(row) => setVehicleDetailId(row.vehicleId)}
        backHref={backHref}
      />

      {/* Đọc yêu cầu lỗi: nói ngay tại chỗ người dùng vừa bấm, kèm thử lại — không mở hộp thoại rỗng. */}
      {requestId !== null && request.isError ? (
        <ResponsiveDialog
          open
          onClose={closeDetail}
          size="sm"
          footer={null}
          title={t('hostList.requestErrorTitle')}
        >
          <EmptyState
            variant="error"
            title={t('hostList.requestErrorTitle')}
            description={errorMessage(request.error)}
            onRetry={() => void request.refetch()}
          />
        </ResponsiveDialog>
      ) : null}

      {vehicleDetailId ? (
        <VehicleDetailDialog
          vehicleId={vehicleDetailId}
          open
          onClose={() => setVehicleDetailId(null)}
        />
      ) : null}

      {decisions.dialogs}
    </div>
  );
}
