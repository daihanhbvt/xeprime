'use client';

import { useMemo } from 'react';
import {
  BOOKING_LIST_PRESET,
  VEHICLE_OPERATION_STATUS,
  type VehiclePublicStatus,
} from '@xeprime/types';
import { RENTAL_STAGE } from '@/constants/rental-stages';
import { ROUTES, bookingPath, bookingsGroupPath, rentalStagePath } from '@/constants/routes';
import { withBranchParam } from '@/features/branches/branch-link';
import { useWorkspace } from '@/hooks/use-workspace';

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
 * Một chỗ quyết định cho hai tuyến, mọi vai:
 *  - yêu cầu + đơn ở màn "Đơn thuê xe" gộp — CÙNG màn cho gian hàng lẫn chủ xe tuyến hoa hồng
 *    (06/11/2026), có lọc sẵn đúng nhóm;
 *  - đường dẫn xe/gói đọc từ `useWorkspace()` — đúng khu, kể cả trong phiên hỗ trợ (ADR 0050).
 *
 * Danh sách nào lọc theo chi nhánh thì mang theo chi nhánh đang chọn (ADR 0052): thẻ đếm theo Đà
 * Nẵng mà bấm vào ra cả gian hàng là hai con số cãi nhau. `withBranchParam` tự bỏ qua màn không
 * lọc chi nhánh.
 */
export function useDashboardLinks(branchId?: string): DashboardLinks {
  const { paths, vehicles } = useWorkspace();

  return useMemo(() => {
    const branch = (href: string) => withBranchParam(href, branchId ?? null);
    return {
      // Hai thẻ yêu cầu trỏ vào hai NHÓM đầu của màn "Đơn thuê xe" gộp (05/11/2026).
      requests: branch(rentalStagePath(RENTAL_STAGE.NEEDS_ACTION)),
      awaitingPayment: branch(rentalStagePath(RENTAL_STAGE.AWAITING_PAYMENT)),
      // Ba thẻ đơn trỏ vào đúng NGĂN của cột trái "Quản lý đơn thuê xe" (02/11/2026); ngăn tự mang
      // cách sắp xếp mặc định của nó (đang thuê: trả xe sớm nhất trước).
      awaitingPickup: branch(bookingsGroupPath(BOOKING_LIST_PRESET.AWAITING_PICKUP)),
      active: branch(bookingsGroupPath(BOOKING_LIST_PRESET.RENTING)),
      allBookings: branch(paths.bookings),
      completed: branch(bookingsGroupPath(BOOKING_LIST_PRESET.COMPLETED)),
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
  }, [branchId, paths, vehicles]);
}
