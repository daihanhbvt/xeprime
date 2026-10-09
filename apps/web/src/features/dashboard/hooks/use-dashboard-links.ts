'use client';

import { useMemo } from 'react';
import {
  BOOKING_REQUEST_STATUS,
  BOOKING_STATUS,
  CUSTOMER_TRIP_FILTER,
  VEHICLE_OPERATION_STATUS,
  type VehiclePublicStatus,
} from '@xeprime/types';
import { ROUTES, bookingPath } from '@/constants/routes';
import { isCommissionOwner } from '@/features/auth/post-auth-destination';
import { withBranchParam } from '@/features/branches/branch-link';
import { useCurrentUser } from '@/hooks/use-current-user';
import { useWorkspace } from '@/hooks/use-workspace';
import type { BookingSort } from '@/features/bookings/types';

/** "Đang cho thuê" xếp theo GIỜ TRẢ — chuyến quá hạn đứng đầu danh sách mà thẻ dẫn tới. */
const ACTIVE_SORT: BookingSort = 'return_asc';

export interface DashboardLinks {
  requests: string;
  awaitingPayment: string;
  awaitingPickup: string;
  active: string;
  allBookings: string;
  completed: string;
  calendar: string;
  availableVehicles: string;
  booking: (id: string) => string;
  vehicles: string;
  vehiclesByPublicStatus: (status: VehiclePublicStatus) => string;
  vehicle: (id: string) => string;
  vehicleNew: string;
  subscription: string;
  balance: string;
}

/**
 * Đích của MỌI thẻ trên Tổng quan — mỗi thẻ dẫn tới đúng danh sách tạo nên con số của nó (UX §1.5).
 *
 * Một chỗ quyết định cho hai tuyến, ba vai:
 *  - CHỦ xe tuyến hoa hồng đọc yêu cầu + đơn gộp ở "Chuyến cho thuê" — trỏ thẳng vào đó, không đi
 *    qua hộp thư rồi bị `partnerPageRedirect` chuyển tiếp (mất tham số, thêm một nhịp);
 *  - THÀNH VIÊN và tuyến gói dùng hộp thư + bảng đơn, có lọc sẵn đúng tab/trạng thái;
 *  - đường dẫn xe/gói đọc từ `useWorkspace()` — đúng khu, kể cả trong phiên hỗ trợ (ADR 0050).
 *
 * Danh sách nào lọc theo chi nhánh thì mang theo chi nhánh đang chọn (ADR 0052): thẻ đếm theo Đà
 * Nẵng mà bấm vào ra cả gian hàng là hai con số cãi nhau. `withBranchParam` tự bỏ qua màn không
 * lọc chi nhánh.
 */
export function useDashboardLinks(branchId?: string): DashboardLinks {
  const { data: user } = useCurrentUser();
  const { paths, vehicles } = useWorkspace();
  const ownerTrips = isCommissionOwner(user);

  return useMemo(() => {
    const branch = (href: string) => withBranchParam(href, branchId ?? null);
    const trips = ROUTES.MANAGE.TRIPS;
    return {
      requests: ownerTrips ? trips : branch(paths.bookingRequests),
      awaitingPayment: ownerTrips
        ? trips
        : branch(`${paths.bookingRequests}?status=${BOOKING_REQUEST_STATUS.AWAITING_HOLD}`),
      awaitingPickup: ownerTrips ? trips : branch(ROUTES.MANAGE.BOOKINGS_AWAITING_PICKUP),
      active: ownerTrips
        ? trips
        : branch(`${paths.bookings}?status=${BOOKING_STATUS.ACTIVE}&sort=${ACTIVE_SORT}`),
      allBookings: ownerTrips ? trips : branch(paths.bookings),
      completed: ownerTrips
        ? `${trips}?filter=${CUSTOMER_TRIP_FILTER.HISTORY}`
        : branch(`${paths.bookings}?status=${BOOKING_STATUS.COMPLETED}`),
      calendar: branch(paths.calendar),
      availableVehicles: branch(`${paths.vehicles}?operationStatus=${VEHICLE_OPERATION_STATUS.AVAILABLE}`),
      booking: bookingPath.detail,
      vehicles: branch(paths.vehicles),
      vehiclesByPublicStatus: (status) => branch(`${paths.vehicles}?publicStatus=${status}`),
      vehicle: vehicles.overview,
      vehicleNew: paths.vehicleNew,
      subscription: paths.subscription,
      balance: ROUTES.MANAGE.BALANCE,
    };
  }, [branchId, ownerTrips, paths, vehicles]);
}
