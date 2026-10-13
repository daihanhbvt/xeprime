import { licenceTripLastDayKey } from '@xeprime/domain';
import {
  PICKUP_PREFERENCE,
  SERVICE_TYPE,
  longTermPickupWindow,
  serviceRequiresDriverLicence,
} from '@xeprime/types';
import type { DriverLicenceTrip } from '@/features/driver-licence/driver-licence-view';

/**
 * Chuyến mà bằng lái phải dùng được — cùng phép dựng với `licenceTrip` của
 * `RequestBookingFlow` bên web, và cùng `licenceTripLastDayKey` với cổng ở server (ADR 0057).
 *
 *  - Thuê có tài xế ⇒ `null` (người cầm lái là tài xế của gian hàng).
 *  - Dài hạn chưa có ngày nhận chắc ⇒ ngày nhận MUỘN NHẤT khách đã nêu (ngày cụ thể, hoặc cuối
 *    cửa sổ nguyện vọng) + số tháng LỊCH của gói.
 *  - Theo ngày ⇒ ngày của thời điểm trả.
 *
 * `null` cũng có nghĩa "chưa đủ dữ liệu để soát" (chưa chọn gói / chưa chọn giờ trả).
 */
export function buildLicenceTrip(input: {
  serviceType: string | null | undefined;
  vehicleType: string | null | undefined;
  packageMonths: number | null | undefined;
  pickupPreference: string | null | undefined;
  /** `YYYY-MM-DD` — chỉ có nghĩa khi nguyện vọng là "ngày cụ thể". */
  requestedPickupDate: string | null | undefined;
  /** ISO instant của thời điểm trả (thuê theo ngày). */
  returnAt: string | null | undefined;
  now?: Date;
}): DriverLicenceTrip | null {
  if (!serviceRequiresDriverLicence(input.serviceType)) return null;
  const vehicleType = input.vehicleType ?? null;

  if (input.serviceType === SERVICE_TYPE.LONG_TERM) {
    if (!input.packageMonths) return null;
    const latestPickupDateKey =
      input.pickupPreference === PICKUP_PREFERENCE.SPECIFIC_DATE && input.requestedPickupDate
        ? input.requestedPickupDate
        : longTermPickupWindow(input.now ?? new Date()).end;
    return {
      vehicleType,
      lastDayKey: licenceTripLastDayKey({
        latestPickupDateKey,
        packageMonths: input.packageMonths,
      }),
    };
  }

  if (!input.returnAt) return null;
  const returnAt = new Date(input.returnAt);
  if (Number.isNaN(returnAt.getTime())) return null;
  return { vehicleType, lastDayKey: licenceTripLastDayKey({ returnAt }) };
}
