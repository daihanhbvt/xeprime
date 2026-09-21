import { isLongTermPackageMonths } from '@xeprime/types';
import type { BookingRequestDecisionTarget } from '@/features/booking-requests/api';
import type { CustomerTrip } from './api';

/**
 * Một chuyến ở phía CHỦ XE → bộ trường mà ba tấm trượt duyệt/từ chối cần.
 *
 * Không dựng một `BookingRequestItem` đầy đủ: `/trips` cố ý trả một DTO hẹp hơn hộp thư gian hàng
 * (không có ghi chú nội bộ, không có hồ sơ khách), và điền bừa những trường thiếu là bịa dữ liệu
 * vào một màn hình sắp giữ chỗ một chiếc xe thật. `BookingRequestDecisionTarget` chỉ đòi đúng
 * những gì tấm trượt đọc, và mọi giá trị dưới đây đều đến từ server.
 *
 * `customerPhone` đi thẳng từ `renter.phone`, tức là `null` khi chuyến tuyến hoa hồng chưa được
 * duyệt — tấm duyệt vì thế không trở thành cửa hậu để đọc số điện thoại trước khi quyết định
 * (ADR 0028 điều 9).
 */
export function tripToDecisionTarget(trip: CustomerTrip): BookingRequestDecisionTarget {
  return {
    id: trip.id,
    bookingId: trip.bookingId ?? null,
    vehicleId: trip.vehicle.id,
    vehicleName: trip.vehicle.name,
    vehiclePlate: trip.vehicle.plateNumber ?? null,
    customerName: trip.renter?.name ?? '',
    customerPhone: trip.renter?.phone ?? null,
    serviceType: trip.serviceType,
    respondBy: trip.respondBy ?? null,
    pickupAt: trip.pickupAt ?? null,
    returnAt: trip.returnAt ?? null,
    deliveryRequested: trip.deliveryRequested,
    /*
     * Gói dài hạn đi trên dây là `number`, còn tấm trượt đòi đúng một trong sáu mốc hợp lệ
     * (ADR 0011). Lọc qua `isLongTermPackageMonths` thay vì ép kiểu: một con số lạ từ dữ liệu cũ
     * phải thành "không có gói", không được lọt vào ô chọn kỳ hạn như một mốc có thật.
     */
    longTermPackageMonths: isLongTermPackageMonths(trip.longTermPackageMonths)
      ? trip.longTermPackageMonths
      : null,
    pickupPreference: trip.pickupPreference ?? null,
    requestedPickupDate: trip.requestedPickupDate ?? null,
    pickupWindowStartDate: trip.pickupWindowStartDate ?? null,
    pickupWindowEndDate: trip.pickupWindowEndDate ?? null,
  };
}
