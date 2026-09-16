import {
  applicablePublishRequirements as applicableRequirements,
  missingPublishRequirements as missingRequirements,
  VEHICLE_PUBLIC_STATUS,
  type PublishRequirement,
  type VehiclePublicationInput,
  type VehiclePublicStatus,
} from '@xeprime/types';
import type { VehicleDetail } from './types';

/**
 * Điều kiện lên chợ — **luật nằm ở `@xeprime/types`**, file này chỉ là lối vào theo shape của web.
 *
 * Trước 14/09/2026 có hai bản: một ở đây trả khoá, một ở `VehiclesService.missingPublicFields`
 * trả câu tiếng Việt. Cả hai docblock đều ghi "sửa một bên phải sửa cả hai" — tức là đã biết
 * trước rằng chúng sẽ lệch, và khi lệch thì chủ xe thấy checklist xanh hết, bấm gửi, rồi nhận
 * 400. Giờ chỉ còn MỘT bảng luật, chạy ở cả hai phía.
 *
 * Hai thứ file này còn giữ, vì chúng phụ thuộc shape của web:
 *  - đếm ảnh từ mảng `images` đã tải về (backend đếm bằng một truy vấn);
 *  - đọc tỉnh của chi nhánh từ `VehicleDetail`.
 */

export type { PublishRequirement };
/** Tên cũ, giữ để nơi gọi không phải đổi import. */
export type PublishRequirementKey = PublishRequirement;

/** Ảnh đại diện ∪ thư viện, khử trùng theo URL — cùng phép đếm với backend. */
function distinctImageCount(vehicle: VehicleDetail): number {
  const urls = new Set<string>(vehicle.images ?? []);
  if (vehicle.mainImageUrl) urls.add(vehicle.mainImageUrl);
  return urls.size;
}

/**
 * `VehicleDetail` → lát cắt mà luật dùng chung cần.
 *
 * `branchProvinceCode` là mảnh mà bản cũ ở web KHÔNG có, và thiếu nó là một lỗi thật: backend
 * chặn gửi duyệt khi chi nhánh chưa có tỉnh (`BRANCH_LOCATION_REQUIRED`) trong khi checklist ở
 * đây báo đủ. Chủ xe bấm một nút sáng và nhận một lỗi không có trong danh sách nào.
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
 * thấy lỗi (Figma `65:3754` Requirements Checklist).
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
