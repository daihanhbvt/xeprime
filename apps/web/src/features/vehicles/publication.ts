import { VEHICLE_PUBLIC_STATUS, type VehiclePublicStatus } from '@xeprime/types';
import type { VehicleDetail } from './types';

/**
 * Điều kiện tối thiểu để xe được lên chợ — khớp `missingPublicFields` ở backend và cột
 * "Publish Req" của ma trận trường Figma `65:4844`.
 *
 * Sống ở đây (không phải trong panel) vì HAI bề mặt cùng đọc: checklist của
 * `VehiclePublicReviewPanel` và mục "Việc cần làm" của Hồ sơ 360 — hai nơi lệch nhau một
 * điều kiện là chủ xe được bảo "đủ rồi" ở chỗ này và "còn thiếu" ở chỗ kia.
 */
export const PUBLISH_REQUIREMENTS: readonly {
  present: (v: VehicleDetail) => boolean;
  label: string;
}[] = [
  { present: (v) => Boolean(v.weekdayPrice), label: 'Giá ngày thường' },
  { present: (v) => Boolean(v.mainImageUrl), label: 'Ảnh đại diện' },
  { present: (v) => Boolean(v.plateNumber), label: 'Biển số' },
  { present: (v) => Boolean(v.description), label: 'Mô tả xe' },
];

/** Nhãn các điều kiện public còn thiếu của một xe — rỗng nghĩa là đủ điều kiện gửi duyệt. */
export function missingPublishRequirements(vehicle: VehicleDetail): string[] {
  return PUBLISH_REQUIREMENTS.filter((item) => !item.present(vehicle)).map((item) => item.label);
}

export interface PublicStatusPresentation {
  type: 'success' | 'info' | 'warning' | 'error';
  message: string;
  description: string;
}

/** Cách trình bày trạng thái public cho chủ xe — dùng chung cho alert panel và banner Hồ sơ 360. */
export function publicStatusPresentation(
  status: VehiclePublicStatus,
  reason: string | null | undefined,
): PublicStatusPresentation {
  switch (status) {
    case VEHICLE_PUBLIC_STATUS.PENDING_PUBLIC_REVIEW:
      return {
        type: 'info',
        message: 'Đang chờ nền tảng duyệt công khai',
        description: 'Xe sẽ hiển thị trên chợ ngay sau khi được duyệt.',
      };
    case VEHICLE_PUBLIC_STATUS.APPROVED_PUBLIC:
      return {
        type: 'success',
        message: 'Xe đang hiển thị trên chợ',
        description: 'Sửa giá, biển số, loại xe hoặc ảnh đại diện sẽ cần duyệt lại.',
      };
    case VEHICLE_PUBLIC_STATUS.REJECTED:
      return {
        type: 'error',
        message: 'Xe bị từ chối',
        description: reason ?? 'Hãy chỉnh sửa theo yêu cầu của nền tảng rồi gửi duyệt lại.',
      };
    case VEHICLE_PUBLIC_STATUS.NEEDS_REVISION:
      return {
        type: 'warning',
        message: 'Cần bổ sung thông tin',
        description: reason ?? 'Hãy bổ sung thông tin còn thiếu rồi gửi duyệt lại.',
      };
    case VEHICLE_PUBLIC_STATUS.HIDDEN:
      return {
        type: 'warning',
        message: 'Xe đang bị ẩn khỏi chợ',
        description: 'Gửi duyệt lại để xe hiển thị trở lại trên marketplace.',
      };
    default:
      return {
        type: 'info',
        message: 'Xe chưa đăng lên chợ',
        description: 'Gửi duyệt để khách hàng thấy xe trên marketplace.',
      };
  }
}
