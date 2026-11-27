'use client';

import { BOOKING_SOURCE_FILTER_VALUES, BOOKING_STATUS } from '@xeprime/types';
import { BOOKINGS_GROUP_PARAM } from '@/constants/routes';
import {
  LEGACY_REQUEST_TAB_STAGE,
  RENTAL_STAGE,
  RENTAL_STAGE_ORDER,
  RENTAL_VIEW_VALUES,
  type RentalStage,
  type RentalView,
} from '@/constants/rental-stages';
import { enumParam, positiveIntParam, useUrlFilters } from '@/hooks/use-url-filters';
import type { BookingSort } from '../types';

/** Bộ lọc của màn "Đơn thuê xe" gộp — sống ở URL (ADR 0004). */
export interface RentalsFilters {
  /**
   * Nhóm đang xem, vắng = "Tất cả". Khoá trùng tên tham số URL (`?preset=`) vì `useUrlFilters` ghi
   * theo TÊN khoá — cùng tên với `preset` của `GET /bookings` nên link cũ vẫn mở đúng nhóm.
   */
  preset?: RentalStage;
  /** Chỉ để GỠ `?status=` cũ khỏi URL khi người dùng chọn một nhóm — không bao giờ đọc. */
  status?: undefined;
  /** Kanban / List — vắng thì `useRentalsView` quyết theo lựa chọn đã nhớ. */
  view?: RentalView;
  q?: string;
  branchId?: string;
  serviceType?: string;
  /** Lọc theo một xe — lối vào từ hồ sơ xe (`?vehicleId=`). */
  vehicleId?: string;
  /** Nguồn đơn (ADR 0110) — mã nguồn hoặc `direct`; loại trừ với `sourceLabel`. */
  source?: string;
  /** Một nhãn nguồn tự nhập cụ thể (tên nền tảng / tên nguồn). */
  sourceLabel?: string;
  /** Sắp xếp của hai nhóm ĐƠN; hai nhóm yêu cầu xếp theo hạn đang chạy (server). */
  sort?: BookingSort;
  page?: number;
  limit?: number;
}

/**
 * Link CŨ mang `?status=` — thẻ Tổng quan trước 02/11/2026 (trạng thái ĐƠN) và hộp thư yêu cầu
 * trước 05/11/2026 (tab yêu cầu). Quy về nhóm tương ứng và thôi coi nó là bộ lọc: ô lọc trạng thái
 * không còn, một `status` sống tiếp trên URL là bộ lọc vô hình không có nút gỡ. Hai trạng thái đã
 * kết thúc được `page.tsx` chuyển sang màn "Đơn đã kết thúc" trước khi tới đây.
 */
const LEGACY_STATUS_STAGE: Readonly<Record<string, RentalStage>> = {
  ...LEGACY_REQUEST_TAB_STAGE,
  [BOOKING_STATUS.RESERVED]: RENTAL_STAGE.AWAITING_PICKUP,
  [BOOKING_STATUS.CONFIRMED]: RENTAL_STAGE.AWAITING_PICKUP,
  [BOOKING_STATUS.ACTIVE]: RENTAL_STAGE.RENTING,
};

export function useRentalsFilters() {
  return useUrlFilters<RentalsFilters>((sp) => {
    const legacyStatus = sp.get('status');
    return {
      preset:
        (enumParam(sp, BOOKINGS_GROUP_PARAM, RENTAL_STAGE_ORDER) as RentalStage | undefined) ??
        (legacyStatus ? LEGACY_STATUS_STAGE[legacyStatus] : undefined),
      view: enumParam(sp, 'view', RENTAL_VIEW_VALUES) as RentalView | undefined,
      q: sp.get('q') ?? undefined,
      vehicleId: sp.get('vehicleId') ?? undefined,
      serviceType: sp.get('serviceType') ?? undefined,
      branchId: sp.get('branchId') ?? undefined,
      source: enumParam(sp, 'source', BOOKING_SOURCE_FILTER_VALUES),
      sourceLabel: sp.get('sourceLabel') ?? undefined,
      sort: (sp.get('sort') as BookingSort | null) ?? undefined,
      page: positiveIntParam(sp, 'page'),
      limit: positiveIntParam(sp, 'limit'),
    };
  });
}
