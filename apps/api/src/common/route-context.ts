import { BadRequestException } from '@nestjs/common';
import { API_ERROR_CODE, ROUTE_TYPE, SERVICE_TYPE } from '@xeprime/types';

/** Hành trình đã chuẩn hoá của một chuyến — bộ ba luôn đi cùng nhau. */
export interface RouteContext {
  routeType: string | null;
  pickupAddress: string | null;
  destination: string | null;
}

/**
 * MỘT nguồn luật cho hành trình chuyến CÓ TÀI XẾ — dùng chung cho khách gửi yêu cầu
 * (BookingRequestsService.submitPublic) lẫn shop lập/sửa đơn tay (BookingsService):
 *
 *   - with_driver: bắt buộc lộ trình + địa chỉ đón; liên tỉnh (khứ hồi/1 chiều) bắt buộc
 *     điểm đến; nội thành thì điểm đến bị normalize về null.
 *   - dịch vụ khác: cả ba trường về null (CHECK `*_route_context_service_check` ở DB là
 *     chốt chặn nếu một writer nào đó quên gọi hàm này).
 */
export function normalizeRouteContext(input: {
  serviceType: string;
  routeType?: string | null;
  pickupAddress?: string | null;
  destination?: string | null;
}): RouteContext {
  if (input.serviceType !== SERVICE_TYPE.WITH_DRIVER) {
    return { routeType: null, pickupAddress: null, destination: null };
  }

  if (!input.routeType) {
    throw invalid('Vui lòng chọn lộ trình cho chuyến có tài xế');
  }
  const pickupAddress = input.pickupAddress?.trim() ?? '';
  if (!pickupAddress) {
    throw invalid('Vui lòng nhập địa chỉ đón');
  }
  const interCity = input.routeType !== ROUTE_TYPE.IN_CITY;
  const destination = input.destination?.trim() ?? '';
  if (interCity && !destination) {
    throw invalid('Vui lòng nhập điểm đến cho lộ trình liên tỉnh');
  }

  return {
    routeType: input.routeType,
    pickupAddress,
    destination: interCity ? destination : null,
  };
}

function invalid(message: string): BadRequestException {
  return new BadRequestException({ code: API_ERROR_CODE.VALIDATION_FAILED, message });
}
