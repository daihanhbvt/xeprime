import { Injectable, NotFoundException } from '@nestjs/common';
import { isValidGeoPoint, type GeoPoint } from '@xeprime/domain';
import {
  API_ERROR_CODE,
  DELIVERY_DISTANCE_STATUS,
  DELIVERY_MANUAL_REASON,
  TENANT_STATUS,
  VEHICLE_PUBLIC_STATUS,
} from '@xeprime/types';
import { GeoService } from '../geo/geo.service';
import { PrismaService } from '../../prisma/prisma.service';
import type { DeliveryDistanceDto } from './dto/pricing.dto';
import { PricingService } from './pricing.service';

/** Không tra được vì phía HỆ THỐNG — giao diện im lặng rơi về luồng cũ, không trách khách. */
const UNAVAILABLE: DeliveryDistanceDto = {
  status: DELIVERY_DISTANCE_STATUS.UNAVAILABLE,
  manualReason: null,
  distanceKm: null,
  straightLineKm: null,
  maxRadiusKm: null,
  fee: null,
  origin: null,
  destination: null,
  formattedAddress: null,
};

/**
 * Hai số lẻ — cùng độ chính xác với đường bộ do nhà cung cấp trả (và cùng `Decimal(8,2)` của
 * `geo_route_cache`), để hai loại khoảng cách không hiện ra với hai kiểu số lẻ khác nhau.
 */
const roundKm = (km: number): number => Math.round(km * 100) / 100;

/**
 * Khoảng cách giao xe tận nơi cho khách trên Marketplace (24/08/2026).
 *
 * Tách khỏi `PricingService` có chủ đích: `PricingService` là **nguồn tính giá duy nhất** và
 * phải giữ được tính chất thuần tuý đó — mọi hàm của nó tính ra tiền từ dữ liệu đã có trong
 * tay. Service này thì gọi ra Internet, có timeout, có ca hỏng. Trộn hai thứ lại là buộc mọi
 * phép tính giá phải mang theo rủi ro mạng.
 *
 * Ranh giới giữ được nhờ đúng một luật: ở đây KHÔNG có phép cộng trừ tiền nào. Bậc phí vẫn do
 * `PricingService.deliveryFeeFor()` tra, service này chỉ cung cấp cho nó con số `distanceKm`
 * mà trước giờ không ai sinh ra được.
 *
 * Kết quả là **dự kiến**, chỉ để hiện cho khách. Không đường nào từ đây ghi vào
 * `bookings.delivery_fee` — chủ xe vẫn là người chốt (ADR 0014).
 */
@Injectable()
export class DeliveryDistanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pricing: PricingService,
    private readonly geo: GeoService,
  ) {}

  /**
   * `pinnedPoint` = toạ độ khách đã tự xác nhận trên bản đồ. Có nó thì KHÔNG tra lại địa chỉ:
   * cái ghim là chỗ khách chỉ tay vào, còn geocode lại từ chuỗi chữ là để máy đoán thêm một lần
   * và có thể ra một điểm khác với điểm khách vừa nhìn thấy — rồi hiện ra một con số phí không
   * khớp với bản đồ ngay bên cạnh nó.
   */
  async forListing(
    vehicleId: string,
    rawAddress: string,
    pinnedPoint?: GeoPoint | null,
  ): Promise<DeliveryDistanceDto> {
    const address = rawAddress.trim();
    const pinned = pinnedPoint && isValidGeoPoint(pinnedPoint) ? pinnedPoint : null;

    const vehicle = await this.prisma.vehicle.findFirst({
      // Cùng cổng vào với `publicQuote`: chỉ xe ĐÃ DUYỆT của gian hàng ĐANG HOẠT ĐỘNG. Không có
      // điều kiện này thì endpoint công khai thành công cụ dò địa chỉ chi nhánh của xe ẩn.
      where: {
        id: vehicleId,
        deletedAt: null,
        publicStatus: VEHICLE_PUBLIC_STATUS.APPROVED_PUBLIC,
        tenant: { status: TENANT_STATUS.ACTIVE, deletedAt: null },
      },
      select: {
        id: true,
        tenantId: true,
        branch: { select: { latitude: true, longitude: true } },
      },
    });
    if (!vehicle) {
      throw new NotFoundException({
        code: API_ERROR_CODE.NOT_FOUND,
        message: 'Xe không khả dụng',
      });
    }

    const policy = await this.pricing.effectivePolicy(vehicle.tenantId, vehicle.id);
    // Chính sách không bật giao nhận thì không có gì để ước lượng — trả lời trước khi tốn một
    // request bản đồ nào.
    if (!policy?.values.deliveryEnabled) {
      return { ...UNAVAILABLE, status: DELIVERY_DISTANCE_STATUS.UNSUPPORTED };
    }

    const origin: GeoPoint = {
      lat: Number(vehicle.branch?.latitude),
      lng: Number(vehicle.branch?.longitude),
    };
    // Chi nhánh chưa có toạ độ (dữ liệu cũ, hoặc địa chỉ không geocode được lúc lưu) → không
    // đoán tâm tỉnh: một điểm đi sai vài km là một con số phí sai, tệ hơn hẳn không có số nào.
    if (!isValidGeoPoint(origin) || !this.geo.enabled) return UNAVAILABLE;
    if (!pinned && !address) return UNAVAILABLE;

    const resolved = pinned
      ? { point: pinned, formattedAddress: address || null }
      : await this.geo.geocode(address);
    if (!resolved) {
      // Phân biệt hai ca giống hệt nhau ở bề ngoài nhưng khác hẳn ở lối đi tiếp: nhà cung cấp
      // còn sống nghĩa là địa chỉ thật sự không tra được → khách sửa được. Nhà cung cấp hỏng
      // thì im lặng, vì đó không phải lỗi của khách.
      return this.geo.enabled
        ? { ...UNAVAILABLE, status: DELIVERY_DISTANCE_STATUS.ADDRESS_NOT_FOUND }
        : UNAVAILABLE;
    }

    const maxRadiusKm = policy.values.deliveryMaxRadiusKm;
    const road = await this.geo.roadDistance(origin, resolved.point, maxRadiusKm);
    const base = {
      origin,
      destination: resolved.point,
      formattedAddress: resolved.formattedAddress,
      maxRadiusKm,
      straightLineKm: null,
      distanceKm: null,
      fee: null,
    };

    /*
     * Ba ngả KHÔNG đo được đường bộ, ba câu khác nhau với khách (ADR 0018 §4 mở rộng
     * 21/09/2026). Trước đây cả ba cùng rơi về một dòng nói "ngoài phạm vi" — kể cả khi hệ
     * thống chỉ đơn giản là không hỏi được nhà cung cấp.
     */
    switch (road.outcome) {
      case 'outside_radius':
        return {
          ...base,
          status: DELIVERY_DISTANCE_STATUS.MANUAL,
          manualReason: DELIVERY_MANUAL_REASON.OUTSIDE_AUTO_RADIUS,
          // Chỉ có đường chim bay — nói đúng tên nó, đừng trưng như quãng đường lái xe.
          straightLineKm: roundKm(road.straightLineKm),
        };
      case 'no_route':
        return {
          ...base,
          status: DELIVERY_DISTANCE_STATUS.MANUAL,
          manualReason: DELIVERY_MANUAL_REASON.ROUTE_UNAVAILABLE,
        };
      case 'unavailable':
        return {
          ...base,
          status: DELIVERY_DISTANCE_STATUS.MANUAL,
          manualReason: DELIVERY_MANUAL_REASON.PROVIDER_UNAVAILABLE,
        };
    }

    const { distanceKm } = road;
    const result = this.pricing.deliveryFeeFor(policy.values, distanceKm);
    if (result.kind === 'auto') {
      return {
        ...base,
        status: DELIVERY_DISTANCE_STATUS.AUTO,
        manualReason: null,
        distanceKm,
        fee: result.fee,
      };
    }
    /*
     * Đo được đường bộ nhưng bậc phí không phủ tới. Vẫn là "ngoài phạm vi tự báo" — chỉ khác ca
     * trên ở chỗ đây là con số ĐƯỜNG BỘ thật, nên giao diện được phép gọi nó bằng đúng tên.
     */
    return {
      ...base,
      status: DELIVERY_DISTANCE_STATUS.MANUAL,
      manualReason: DELIVERY_MANUAL_REASON.OUTSIDE_AUTO_RADIUS,
      distanceKm,
    };
  }
}
