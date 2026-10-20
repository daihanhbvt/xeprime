/**
 * Chi tiết lỗi `VEHICLE_SERVICE_IN_USE` (409) — xe bỏ một loại dịch vụ trong khi còn chuyến đang
 * mở dùng loại đó (quyết định sản phẩm 19/10/2026). Server liệt kê đơn + yêu cầu vướng để chủ xe
 * biết mở đơn nào; web và app native cùng đọc qua một bộ đọc phòng thủ này — `details` là dữ liệu
 * lỗi, không có kiểu trong contract OpenAPI.
 */
export interface ServiceInUseBooking {
  id: string;
  code: string;
  serviceType: string;
  status: string;
  pickupAt: string;
}

export interface ServiceInUseDetails {
  serviceTypes: string[];
  bookings: ServiceInUseBooking[];
  requestCount: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/** `null` khi `details` không đúng hình — nơi gọi vẫn hiện câu lỗi theo MÃ. */
export function readServiceInUseDetails(details: unknown): ServiceInUseDetails | null {
  if (!isRecord(details)) return null;
  const bookings = Array.isArray(details.bookings)
    ? details.bookings.filter(
        (b): b is ServiceInUseBooking =>
          isRecord(b) && typeof b.id === 'string' && typeof b.code === 'string',
      )
    : [];
  const requests = Array.isArray(details.requests) ? details.requests : [];
  const serviceTypes = Array.isArray(details.serviceTypes)
    ? details.serviceTypes.filter((s): s is string => typeof s === 'string')
    : [];
  return { serviceTypes, bookings, requestCount: requests.length };
}
