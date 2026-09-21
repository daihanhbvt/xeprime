import {
  VEHICLE_PUBLIC_STATUS,
  applicablePublishRequirements as applicableRequirements,
  missingPublishRequirements as missingRequirements,
  type PublishRequirement,
  type VehiclePublicStatus,
  type VehiclePublicationInput,
} from '@xeprime/types';
import type { VehicleDetail } from './api';

/** Ảnh đại diện ∪ thư viện, khử trùng theo URL — cùng phép đếm với backend. */
function distinctImageCount(vehicle: VehicleDetail): number {
  const urls = new Set<string>(vehicle.images ?? []);
  if (vehicle.mainImageUrl) urls.add(vehicle.mainImageUrl);
  return urls.size;
}

/**
 * `VehicleDetail` → lát cắt mà luật DÙNG CHUNG cần.
 *
 * Trước đợt này file có một bản CHÉP TAY của bảng điều kiện, và bản chép thiếu đúng một mục:
 * `branchLocation`. Backend chặn gửi duyệt khi chi nhánh chưa có tỉnh
 * (`BRANCH_LOCATION_REQUIRED`) trong khi checklist báo đủ — chủ xe bấm một nút đang sáng và nhận
 * một lỗi không nằm trong danh sách nào. Đó chính là lỗi mà `packages/types/src/vehicle-publication.ts`
 * sinh ra để xoá bỏ, và nó đã mọc lại ở app.
 */
function toInput(vehicle: VehicleDetail): VehiclePublicationInput {
  return {
    vehicleType: vehicle.vehicleType,
    serviceTypes: vehicle.serviceTypes,
    weekdayPrice: vehicle.weekdayPrice,
    monthlyPrice: vehicle.monthlyPrice,
    withDriverDailyPrice: vehicle.withDriverDailyPrice,
    mainImageUrl: vehicle.mainImageUrl,
    plateNumber: vehicle.plateNumber,
    brand: vehicle.brand,
    model: vehicle.model,
    manufactureYear: vehicle.manufactureYear,
    fuelType: vehicle.fuelType,
    transmission: vehicle.transmission,
    seatCount: vehicle.seatCount,
    motorbikeCategory: vehicle.motorbikeCategory,
    fuelConsumptionCombined: vehicle.fuelConsumptionCombined,
    engineDisplacementCc: vehicle.engineDisplacementCc,
    electricRangeKm: vehicle.electricRangeKm,
    branchProvinceCode: vehicle.branch?.provinceCode ?? null,
  };
}

/**
 * Các điều kiện CÓ HIỆU LỰC với xe này, kèm trạng thái đạt/chưa đạt.
 *
 * Trả cả `met` chứ không chỉ phần còn thiếu: chủ xe cần thấy mình còn cách bao xa, không chỉ
 * thấy lỗi.
 */
export function publishChecklist(
  vehicle: VehicleDetail,
): { key: PublishRequirement; met: boolean }[] {
  const input = toInput(vehicle);
  const imageCount = distinctImageCount(vehicle);
  return applicableRequirements(input).map((item) => ({
    key: item.key,
    met: item.present(input, imageCount),
  }));
}

/** Khoá các điều kiện còn thiếu — rỗng nghĩa là đủ điều kiện gửi duyệt. */
export function missingPublishRequirements(vehicle: VehicleDetail): PublishRequirement[] {
  return missingRequirements(toInput(vehicle), distinctImageCount(vehicle));
}

/**
 * Cách trình bày trạng thái public cho chủ xe — dùng chung cho alert panel và banner Hồ sơ 360.
 *
 * Trả về `type` (màu) + KHOÁ message, không trả câu chữ: nơi gọi đã có bộ dịch của request và
 * dịch một chỗ. `reason` là câu do người duyệt viết — nó đi qua nguyên văn, không dịch được.
 */
export interface PublicStatusPresentation {
  type: 'success' | 'info' | 'warning' | 'error';
  /** Khoá trong `Vehicles.publish.status`. */
  key: 'pending' | 'approved' | 'rejected' | 'needsRevision' | 'hidden' | 'draft';
  /** `true` = phần mô tả ưu tiên dùng `reason` của người duyệt nếu có. */
  useReason: boolean;
}

export function publicStatusPresentation(status: VehiclePublicStatus): PublicStatusPresentation {
  switch (status) {
    case VEHICLE_PUBLIC_STATUS.PENDING_PUBLIC_REVIEW:
      return { type: 'info', key: 'pending', useReason: false };
    case VEHICLE_PUBLIC_STATUS.APPROVED_PUBLIC:
      return { type: 'success', key: 'approved', useReason: false };
    case VEHICLE_PUBLIC_STATUS.REJECTED:
      return { type: 'error', key: 'rejected', useReason: true };
    case VEHICLE_PUBLIC_STATUS.NEEDS_REVISION:
      return { type: 'warning', key: 'needsRevision', useReason: true };
    case VEHICLE_PUBLIC_STATUS.HIDDEN:
      return { type: 'warning', key: 'hidden', useReason: false };
    default:
      return { type: 'info', key: 'draft', useReason: false };
  }
}
