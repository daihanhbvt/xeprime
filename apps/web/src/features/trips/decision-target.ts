import { isLongTermPackageMonths } from '@xeprime/types';

import type { BookingRequestDecisionTarget } from '@/features/booking-requests/types';

import type { CustomerTrip } from './types';

/**
 * Một chuyến ở phía CHỦ XE → bộ trường mà bốn hộp thoại duyệt/từ chối cần.
 *
 * Không dựng một `BookingRequestItem` đầy đủ: `/trips` cố ý trả một DTO hẹp hơn hộp thư gian
 * hàng (không có ghi chú nội bộ, không có hồ sơ khách), và điền bừa những trường thiếu là bịa
 * dữ liệu vào một màn hình sắp giữ chỗ một chiếc xe thật. `BookingRequestDecisionTarget` chỉ
 * đòi đúng những gì hộp thoại đọc, và mọi giá trị dưới đây đều đến từ server.
 *
 * `customerPhone` đi thẳng từ `renter.phone`, tức là `null` khi chuyến tuyến hoa hồng chưa được
 * duyệt — hộp thoại duyệt vì thế không trở thành cửa hậu để đọc số điện thoại trước khi quyết
 * định (ADR 0028 điều 9).
 */
export function tripToDecisionTarget(trip: CustomerTrip): BookingRequestDecisionTarget {
  return {
    id: trip.id,
    bookingId: trip.bookingId,
    vehicleId: trip.vehicle.id,
    vehicleName: trip.vehicle.name,
    vehiclePlate: trip.vehicle.plateNumber,
    customerName: trip.renter?.name ?? '',
    customerPhone: trip.renter?.phone ?? null,
    serviceType: trip.serviceType,
    pickupAt: trip.pickupAt,
    returnAt: trip.returnAt,
    deliveryRequested: trip.deliveryRequested,
    /*
     * Gói dài hạn đi trên dây là `number`, còn hộp thoại đòi đúng một trong sáu mốc hợp lệ
     * (ADR 0011). Lọc qua `isLongTermPackageMonths` thay vì ép kiểu: một con số lạ từ dữ liệu
     * cũ phải thành "không có gói", không được lọt vào ô chọn kỳ hạn như một mốc có thật.
     */
    longTermPackageMonths: isLongTermPackageMonths(trip.longTermPackageMonths)
      ? trip.longTermPackageMonths
      : null,
    pickupPreference: trip.pickupPreference,
    requestedPickupDate: trip.requestedPickupDate,
    pickupWindowStartDate: trip.pickupWindowStartDate,
    pickupWindowEndDate: trip.pickupWindowEndDate,
  };
}
