import { longTermReturnFromWallClock } from '@xeprime/domain';
import {
  PICKUP_PREFERENCE,
  ROUTE_TYPE,
  type PickupPreference,
  type RouteType,
  type ServiceType,
} from '@xeprime/types';
import type { BookingTrip } from '@/features/booking-requests/components/BookingTripCard';
import type { ReviewCostsBreakdown } from '@/features/booking-requests/components/BookingReviewCosts';
import { dayjs, rentalDurationParts, toAppTz } from '@/lib/datetime';
import type { CustomerTripDetail, CustomerTripEstimate, CustomerTripFinance } from './types';

/**
 * Chuyến ĐÃ GỬI (`GET /trips/:id`) → đúng hình dạng mà thẻ "Thông tin chuyến đi" của luồng đặt xe
 * đọc (`BookingTrip`). Màn chuyến chờ chủ xe phản hồi (Figma `19727:60694`) dùng lại chính thẻ đó,
 * nên khách soát chuyến trước khi gửi và đọc lại nó sau khi gửi trên cùng một khuôn.
 *
 * Chỉ ĐỔI DẠNG, không suy nghiệp vụ — trừ một chỗ có ghi lý do (`rentalMode`).
 */
export function tripToBookingTrip(trip: CustomerTripDetail): BookingTrip {
  const pickupAt = trip.pickupAt ? toAppTz(trip.pickupAt) : null;
  const returnAt = trip.returnAt ? toAppTz(trip.returnAt) : null;
  const requestedPickupDate = trip.requestedPickupDate ? dayjs(trip.requestedPickupDate) : null;
  const packageMonths = trip.longTermPackageMonths ?? null;

  return {
    serviceType: trip.serviceType as ServiceType,
    // Chỉ chuyến CÓ TÀI XẾ mang hành trình; dịch vụ khác thì thẻ không đọc trường này.
    routeType: (trip.routeType ?? ROUTE_TYPE.IN_CITY) as RouteType,
    /*
     * Theo giờ hay theo ngày là lựa chọn của Ô CHỌN LỊCH lúc đặt, không lưu trên yêu cầu. Chế độ
     * theo ngày không cho một khoảng dưới một ngày, nên "chưa trọn một ngày" chính là theo giờ.
     */
    rentalMode:
      pickupAt && returnAt && rentalDurationParts(pickupAt, returnAt).days === 0
        ? 'hourly'
        : 'daily',
    pickupAt,
    returnAt,
    packageMonths,
    pickupPreference: (trip.pickupPreference ??
      PICKUP_PREFERENCE.WITHIN_7_DAYS) as PickupPreference,
    requestedPickupDate,
    // Khoảng "nhận trong 7 ngày" server đã chốt lúc nhận yêu cầu — không tính lại từ hôm nay.
    pickupWindow:
      trip.pickupWindowStartDate && trip.pickupWindowEndDate
        ? { start: trip.pickupWindowStartDate, end: trip.pickupWindowEndDate }
        : null,
    // Cùng phép tính với luồng đặt xe: ngày nhận cụ thể + N tháng LỊCH (ADR 0011).
    expectedReturnDate:
      packageMonths != null && requestedPickupDate
        ? longTermReturnFromWallClock(requestedPickupDate, packageMonths)
        : null,
    isDelivery: trip.deliveryRequested,
    deliveryAddress: trip.deliveryAddress ?? null,
    driverPickupAddress: trip.pickupAddress ?? null,
    destination: trip.destination ?? null,
  };
}

/**
 * Bảng kê TẠM TÍNH của chuyến → các mảnh hai thẻ tiền của màn Xem lại đọc (`BookingReviewCosts`).
 *
 * `totalAmount` là tổng giá THUÊ (`rentalTotal`) — đúng nghĩa của `breakdown.totalAmount` ở báo giá
 * công khai; số khách trả cả chuyến vẫn đọc từ `fees.customerTotalAmount` như mọi nơi khác.
 * `estimateNote` đi nguyên từ server: còn tạm tính thì thẻ gọi tổng là "Tạm tính" — đúng chữ khách
 * đã đọc ở màn Xem lại, không trưng số đó như giá chốt.
 */
export function tripEstimateBreakdown(estimate: CustomerTripEstimate): ReviewCostsBreakdown {
  return {
    rows: estimate.rows,
    totalAmount: estimate.rentalTotal,
    depositAmount: estimate.depositAmount,
    fees: estimate.fees ?? null,
    estimateNote: estimate.estimateNote ?? null,
    longTerm: estimate.longTerm ?? null,
  };
}

/**
 * Bảng kê ĐÃ ĐÓNG BĂNG của một ĐƠN → cùng các mảnh hai thẻ tiền của màn Xem lại đọc. Màn chuyến đã
 * xác nhận (Figma `19879:72913`) kể lại đúng bảng tiền khách vừa đọc ở màn chờ giữ chỗ.
 *
 * `null` khi server không trả bảng kê (đơn cũ không có snapshot, hoặc số trên đơn đã đổi sau lúc
 * tạo — `CustomerTripFinanceDto.breakdown`): nơi gọi quay về thẻ tiền đầy đủ `TripFinanceCard`.
 * Tổng giá thuê đọc `rentalTotal` CỦA ĐƠN, không phải con số chụp lúc tạo.
 */
export function tripFinanceBreakdown(finance: CustomerTripFinance): ReviewCostsBreakdown | null {
  const frozen = finance.breakdown ?? null;
  if (!frozen) return null;
  return {
    rows: frozen.rows,
    totalAmount: finance.rentalTotal,
    depositAmount: frozen.depositAmount,
    fees: frozen.fees ?? null,
    // Số của một đơn là số THU — không bao giờ "tạm tính" (ADR 0024).
    estimateNote: null,
    longTerm: frozen.longTerm ?? null,
  };
}
