import { SERVICE_TYPE, VEHICLE_PUBLIC_STATUS, type VehiclePublicStatus } from '@xeprime/types';
import type { VehicleDetail } from './types';

/**
 * Khoá của một điều kiện lên chợ. Đây là MÃ nội bộ, không phải chữ hiện ra — nhãn tương ứng nằm
 * ở `Vehicles.publish.requirements.<key>` trong cả hai ngôn ngữ.
 */
export type PublishRequirementKey =
  | 'selfDrivePrice'
  | 'longTermPrice'
  | 'withDriverPrice'
  | 'mainImage'
  | 'plateNumber'
  | 'description';

/**
 * Điều kiện tối thiểu để xe được lên chợ — khớp `missingPublicFields` ở backend và cột
 * "Publish Req" của ma trận trường Figma `65:4844`.
 *
 * Sống ở đây (không phải trong panel) vì HAI bề mặt cùng đọc: checklist của
 * `VehiclePublicReviewPanel` và mục "Việc cần làm" của Hồ sơ 360 — hai nơi lệch nhau một
 * điều kiện là chủ xe được bảo "đủ rồi" ở chỗ này và "còn thiếu" ở chỗ kia.
 *
 * Giá kiểm THEO DỊCH VỤ xe đăng (17/08): đăng dịch vụ nào phải có giá chuyên biệt của dịch vụ
 * đó — không lấy giá tự lái trưng như giá có tài xế/dài hạn. `applies` = điều kiện có hiệu lực
 * với xe này không (điều kiện không áp dụng thì không hiện trong checklist).
 *
 * Bảng này chỉ mang LOGIC và KHOÁ, không mang chữ: nó là hằng module scope, mà một hằng module
 * scope được tính đúng một lần cho cả tiến trình — nhãn nằm trong đó sẽ đóng băng ở ngôn ngữ
 * của request đầu tiên (ADR 0012).
 */
export const PUBLISH_REQUIREMENTS: readonly {
  key: PublishRequirementKey;
  applies: (v: VehicleDetail) => boolean;
  present: (v: VehicleDetail) => boolean;
}[] = [
  {
    key: 'selfDrivePrice',
    applies: (v) => (v.serviceTypes ?? []).includes(SERVICE_TYPE.SELF_DRIVE),
    present: (v) => Boolean(v.weekdayPrice),
  },
  {
    key: 'longTermPrice',
    applies: (v) => (v.serviceTypes ?? []).includes(SERVICE_TYPE.LONG_TERM),
    present: (v) => Boolean(v.monthlyPrice),
  },
  {
    key: 'withDriverPrice',
    applies: (v) => (v.serviceTypes ?? []).includes(SERVICE_TYPE.WITH_DRIVER),
    present: (v) => Boolean(v.withDriverDailyPrice),
  },
  { key: 'mainImage', applies: () => true, present: (v) => Boolean(v.mainImageUrl) },
  { key: 'plateNumber', applies: () => true, present: (v) => Boolean(v.plateNumber) },
  { key: 'description', applies: () => true, present: (v) => Boolean(v.description) },
];

/** Các điều kiện CÓ HIỆU LỰC với xe này (checklist chỉ hiện điều kiện áp dụng). */
export function applicablePublishRequirements(vehicle: VehicleDetail) {
  return PUBLISH_REQUIREMENTS.filter((item) => item.applies(vehicle));
}

/** Khoá các điều kiện public còn thiếu của một xe — rỗng nghĩa là đủ điều kiện gửi duyệt. */
export function missingPublishRequirements(vehicle: VehicleDetail): PublishRequirementKey[] {
  return applicablePublishRequirements(vehicle)
    .filter((item) => !item.present(vehicle))
    .map((item) => item.key);
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
