import { PICKUP_PREFERENCE, ROUTE_TYPE, SERVICE_TYPE } from '@xeprime/types';
import type { BookingRequestFormValues } from './booking-schema';
import type { CreateBookingRequestInput } from './api';

/**
 * Thân `POST /public/booking-requests`.
 *
 * KHÔNG mang danh tính người thuê (ADR 0060): họ tên, SĐT, email đọc từ TÀI KHOẢN của phiên ở
 * server. `client`/`device` cũng không gửi nữa — lượt gửi không còn cấp phiên nào.
 */
export function toRequestBody(
  values: BookingRequestFormValues,
  /**
   * MÃ KHUYẾN MÃI đang áp — ADR 0046.
   *
   * Tham số RIÊNG chứ không nằm trong `values`: nó không phải một ô của biểu mẫu mà là kết quả
   * của một lượt xem trước ở SERVER (`usePromoCode`), và một chuỗi khách gõ nhưng chưa áp được
   * thì không bao giờ được đi kèm lượt gửi.
   *
   * Gửi CHUỖI MÃ, không gửi số giảm: số giảm do server tính ở cả ba cửa kiểm.
   */
  promoCode?: string | null,
): Omit<CreateBookingRequestInput, 'vehicleId'> {
  const withDriver = values.serviceType === SERVICE_TYPE.WITH_DRIVER;
  const longTerm = values.serviceType === SERVICE_TYPE.LONG_TERM;
  const interCity =
    values.routeType === ROUTE_TYPE.INTER_CITY ||
    values.routeType === ROUTE_TYPE.INTER_CITY_ONE_WAY;

  return {
    serviceType: values.serviceType as CreateBookingRequestInput['serviceType'],
    ...(longTerm
      ? {
          longTermPackageMonths:
            values.longTermPackageMonths as CreateBookingRequestInput['longTermPackageMonths'],
          pickupPreference:
            values.pickupPreference as CreateBookingRequestInput['pickupPreference'],
          ...(values.pickupPreference === PICKUP_PREFERENCE.SPECIFIC_DATE &&
          values.requestedPickupDate
            ? { requestedPickupDate: values.requestedPickupDate }
            : {}),
        }
      : { pickupAt: values.pickupAt, returnAt: values.returnAt }),
    /*
     * Có tài xế: lộ trình + địa chỉ đón; điểm đến CHỈ khi liên tỉnh (nội thành lộ trình tự do).
     *
     * Địa chỉ gửi đi dạng MÃ + phần chi tiết; chuỗi hiển thị do SERVER ghép (ADR 0035 điều 3),
     * nên không có trường `pickupAddress` nào trong thân request nữa.
     */
    ...(withDriver
      ? {
          routeType: values.routeType as CreateBookingRequestInput['routeType'],
          /*
           * Chuỗi RỖNG không được gửi: DTO khai `@IsOptional()` kèm `@Length(5, 5)`, mà
           * `@IsOptional` chỉ bỏ qua `null`/`undefined`. Từ ADR 0042 luồng khách không còn bộ
           * chọn hành chính nào, nên hai trường này rỗng ở gần như mọi yêu cầu.
           */
          ...(values.pickupProvinceCode ? { pickupProvinceCode: values.pickupProvinceCode } : {}),
          ...(values.pickupWardCode ? { pickupWardCode: values.pickupWardCode } : {}),
          pickupAddressLine: values.pickupAddressLine,
          ...(values.pickupPlaceId ? { pickupPlaceId: values.pickupPlaceId } : {}),
          ...(values.pickupLatitude != null && values.pickupLongitude != null
            ? { pickupLatitude: values.pickupLatitude, pickupLongitude: values.pickupLongitude }
            : {}),
          ...(interCity && values.destination ? { destination: values.destination } : {}),
        }
      : {}),
    // Giao tận nơi loại trừ với có tài xế — xe đã đến đón thì không có khái niệm giao xe.
    ...(!withDriver && values.deliveryRequested
      ? {
          deliveryRequested: true,
          ...(values.deliveryProvinceCode
            ? { deliveryProvinceCode: values.deliveryProvinceCode }
            : {}),
          ...(values.deliveryWardCode ? { deliveryWardCode: values.deliveryWardCode } : {}),
          deliveryAddressLine: values.deliveryAddressLine,
          ...(values.deliveryPlaceId ? { deliveryPlaceId: values.deliveryPlaceId } : {}),
          ...(values.deliveryLatitude != null && values.deliveryLongitude != null
            ? {
                deliveryLatitude: values.deliveryLatitude,
                deliveryLongitude: values.deliveryLongitude,
              }
            : {}),
        }
      : {}),
    ...(values.note ? { note: values.note } : {}),
    // Đúng web: chỉ gửi khi đã tick — server tự kiểm lại với điều khoản hiệu lực của dịch vụ.
    ...(values.acceptedTerms ? { acceptedTerms: true } : {}),
    ...(promoCode ? { promoCode } : {}),
  };
}
