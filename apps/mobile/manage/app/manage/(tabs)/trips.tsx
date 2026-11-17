import { Redirect, useLocalSearchParams } from 'expo-router';
import { CUSTOMER_TRIP_FILTER } from '@xeprime/types';
import { ROUTES } from '@/navigation/routes';

/**
 * `/manage/trips` cũ — "Chuyến cho thuê" riêng của chủ xe tuyến hoa hồng đã gỡ ở web PR #278
 * (06/11/2026): cả chủ lẫn thành viên dùng CÙNG hộp thư + màn "Đơn thuê xe" với gian hàng. Route còn
 * lại để thông báo / liên kết cũ không gãy — gương `legacyOwnerTripsTarget` của web:
 * `?filter=history` → Đơn đã kết thúc, `?request=` → hộp thư mở sẵn yêu cầu đó, còn lại → Đơn thuê.
 */
export default function ManageTripsRoute() {
  const { filter, request, vehicleId } = useLocalSearchParams<{
    filter?: string;
    request?: string;
    vehicleId?: string;
  }>();
  if (filter === CUSTOMER_TRIP_FILTER.HISTORY) return <Redirect href={ROUTES.manage.bookingsEnded()} />;
  if (request) return <Redirect href={ROUTES.manage.requestDetail(request)} />;
  /*
   * Web mang theo `q`/`branchId`/`serviceType`/`vehicleId` (`CARRIED_PARAMS`). Màn Đơn thuê native
   * chỉ nhận bộ lọc khởi tạo `vehicleId` qua route (chi nhánh đi theo bộ lọc chi nhánh chung của
   * app, từ khoá/loại dịch vụ là ô lọc tại chỗ), nên chỉ `vehicleId` còn nghĩa để chuyển tiếp.
   */
  return <Redirect href={ROUTES.manage.bookings(vehicleId ? { vehicleId } : undefined)} />;
}
