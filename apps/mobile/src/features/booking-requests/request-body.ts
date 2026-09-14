import { PICKUP_PREFERENCE, ROUTE_TYPE, SERVICE_TYPE } from '@xeprime/types';
import type { BookingRequestFormValues } from './booking-schema';
import type { CreateBookingRequestInput } from './api';

export type RequestDevice = CreateBookingRequestInput['device'];

export function toRequestBody(
  values: BookingRequestFormValues,
  device: RequestDevice,
): Omit<CreateBookingRequestInput, 'vehicleId'> {
  const withDriver = values.serviceType === SERVICE_TYPE.WITH_DRIVER;
  const longTerm = values.serviceType === SERVICE_TYPE.LONG_TERM;
  const interCity =
    values.routeType === ROUTE_TYPE.INTER_CITY ||
    values.routeType === ROUTE_TYPE.INTER_CITY_ONE_WAY;

  return {
    client: 'native',
    device,
    customerName: values.customerName.trim(),
    customerPhone: values.customerPhone.trim(),
    ...(values.customerEmail ? { customerEmail: values.customerEmail } : {}),
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
          pickupProvinceCode: values.pickupProvinceCode,
          pickupWardCode: values.pickupWardCode,
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
          deliveryProvinceCode: values.deliveryProvinceCode,
          deliveryWardCode: values.deliveryWardCode,
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
  };
}
