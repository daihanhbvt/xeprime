/**
 * Việc cần làm của một xe (Wave 8) — mô hình DUY NHẤT dùng chung cho danh sách xe và Hồ sơ 360.
 * docs/design/12_VEHICLE_360_MANAGEMENT.md §9.2 + §11.
 *
 * Vì sao gom về một chỗ: trước Wave 8 mỗi surface tự suy ra "việc cần làm" của riêng nó, nên
 * thẻ xe và trang chi tiết có thể nói hai điều khác nhau về CÙNG một chiếc xe. Cảnh báo là
 * thứ người vận hành hành động theo — hai nguồn sự thật ở đây là hai quyết định sai.
 *
 * Server là nơi tính. Frontend chỉ sắp xếp/hiển thị, và không bao giờ tự suy thêm cảnh báo.
 */

import type { StatusColor } from './meta';

/**
 * Mức nghiêm trọng. Ba mức, không hơn: thêm mức thứ tư chỉ làm người đọc phải học thêm một
 * sắc thái mà không đổi được hành động.
 */
export const VEHICLE_ALERT_SEVERITY = {
  /** Đang chặn vận hành hoặc có rủi ro pháp lý — phải xử lý. */
  CRITICAL: 'critical',
  /** Sắp thành vấn đề nếu bỏ qua. */
  WARNING: 'warning',
  /** Thông tin, không đòi hành động ngay. */
  INFO: 'info',
} as const;

export type VehicleAlertSeverity =
  (typeof VEHICLE_ALERT_SEVERITY)[keyof typeof VEHICLE_ALERT_SEVERITY];

/**
 * Màu của mức nghiêm trọng.
 *
 * VÀNG (gold) là màu THƯƠNG HIỆU/HÀNH ĐỘNG của XePrime, không phải màu cảnh báo chung
 * (docs/design/01 + §12) — nên `warning` dùng cam, không dùng gold. Và màu KHÔNG BAO GIỜ là
 * kênh thông tin duy nhất: mọi cảnh báo đều có nhãn chữ, ở mọi surface.
 */
export const VEHICLE_ALERT_SEVERITY_COLOR: Readonly<Record<VehicleAlertSeverity, StatusColor>> = {
  [VEHICLE_ALERT_SEVERITY.CRITICAL]: 'red',
  [VEHICLE_ALERT_SEVERITY.WARNING]: 'orange',
  [VEHICLE_ALERT_SEVERITY.INFO]: 'blue',
};

export const VEHICLE_ALERT_SEVERITY_LABEL: Readonly<Record<VehicleAlertSeverity, string>> = {
  [VEHICLE_ALERT_SEVERITY.CRITICAL]: 'Nghiêm trọng',
  [VEHICLE_ALERT_SEVERITY.WARNING]: 'Cần chú ý',
  [VEHICLE_ALERT_SEVERITY.INFO]: 'Thông tin',
};

/** Loại việc cần làm. Mỗi loại có một cách xử lý riêng, nên không gộp. */
export const VEHICLE_ALERT_KIND = {
  /** Bàn giao trả xe đã chốt nhưng chưa có KM (Wave 7) — KM có thẩm quyền đang treo. */
  MISSING_RETURN_ODOMETER: 'missing_return_odometer',
  /** Giấy tờ đã quá hạn — rủi ro pháp lý khi xe đang chạy. */
  DOCUMENT_EXPIRED: 'document_expired',
  /** Đã vượt mốc bảo dưỡng. */
  MAINTENANCE_OVERDUE: 'maintenance_overdue',
  /** Nền tảng từ chối / yêu cầu bổ sung / đã ẩn — xe không lên sàn được. */
  PUBLIC_ACTION_REQUIRED: 'public_action_required',
  /** Giấy tờ sắp hết hạn theo ngưỡng gian hàng cấu hình. */
  DOCUMENT_EXPIRING: 'document_expiring',
  /** Sắp tới mốc bảo dưỡng theo ngưỡng gian hàng cấu hình. */
  MAINTENANCE_DUE_SOON: 'maintenance_due_soon',
  /** Thiếu thông tin bắt buộc để gửi duyệt công khai. */
  MISSING_VEHICLE_INFO: 'missing_vehicle_info',
  /** Chưa từng ghi nhận KM — mọi tính toán bảo dưỡng đều là `Chưa đủ dữ liệu`. */
  MISSING_ODOMETER: 'missing_odometer',
  /** Đang có phiếu bảo dưỡng thực hiện dở. */
  MAINTENANCE_IN_PROGRESS: 'maintenance_in_progress',
  /** Nghĩa vụ tài chính định kỳ của nguồn xe — CHỈ hiện với vai trò có quyền tài chính. */
  SOURCE_OBLIGATION_DUE: 'source_obligation_due',
} as const;

export type VehicleAlertKind = (typeof VEHICLE_ALERT_KIND)[keyof typeof VEHICLE_ALERT_KIND];
export const VEHICLE_ALERT_KIND_VALUES = Object.values(VEHICLE_ALERT_KIND) as VehicleAlertKind[];

/**
 * Thứ tự ưu tiên TẤT ĐỊNH — số nhỏ hiện trước.
 *
 * Nguyên tắc xếp: chặn vận hành / rủi ro pháp lý → sắp thành vấn đề → thông tin. Đây là bảng
 * duy nhất quyết định "cảnh báo nào lên đầu", nên mọi surface xếp giống hệt nhau và
 * "3 việc quan trọng nhất" ở Hồ sơ 360 luôn là cùng 3 việc đó.
 */
export const VEHICLE_ALERT_PRIORITY: Readonly<Record<VehicleAlertKind, number>> = {
  [VEHICLE_ALERT_KIND.MISSING_RETURN_ODOMETER]: 10,
  [VEHICLE_ALERT_KIND.DOCUMENT_EXPIRED]: 20,
  [VEHICLE_ALERT_KIND.MAINTENANCE_OVERDUE]: 30,
  [VEHICLE_ALERT_KIND.PUBLIC_ACTION_REQUIRED]: 40,
  [VEHICLE_ALERT_KIND.DOCUMENT_EXPIRING]: 50,
  [VEHICLE_ALERT_KIND.MAINTENANCE_DUE_SOON]: 60,
  [VEHICLE_ALERT_KIND.MISSING_VEHICLE_INFO]: 70,
  [VEHICLE_ALERT_KIND.MISSING_ODOMETER]: 80,
  [VEHICLE_ALERT_KIND.SOURCE_OBLIGATION_DUE]: 90,
  [VEHICLE_ALERT_KIND.MAINTENANCE_IN_PROGRESS]: 100,
};

export const VEHICLE_ALERT_SEVERITY_OF: Readonly<Record<VehicleAlertKind, VehicleAlertSeverity>> = {
  [VEHICLE_ALERT_KIND.MISSING_RETURN_ODOMETER]: VEHICLE_ALERT_SEVERITY.CRITICAL,
  [VEHICLE_ALERT_KIND.DOCUMENT_EXPIRED]: VEHICLE_ALERT_SEVERITY.CRITICAL,
  [VEHICLE_ALERT_KIND.MAINTENANCE_OVERDUE]: VEHICLE_ALERT_SEVERITY.CRITICAL,
  [VEHICLE_ALERT_KIND.PUBLIC_ACTION_REQUIRED]: VEHICLE_ALERT_SEVERITY.WARNING,
  [VEHICLE_ALERT_KIND.DOCUMENT_EXPIRING]: VEHICLE_ALERT_SEVERITY.WARNING,
  [VEHICLE_ALERT_KIND.MAINTENANCE_DUE_SOON]: VEHICLE_ALERT_SEVERITY.WARNING,
  [VEHICLE_ALERT_KIND.MISSING_VEHICLE_INFO]: VEHICLE_ALERT_SEVERITY.WARNING,
  [VEHICLE_ALERT_KIND.MISSING_ODOMETER]: VEHICLE_ALERT_SEVERITY.WARNING,
  [VEHICLE_ALERT_KIND.SOURCE_OBLIGATION_DUE]: VEHICLE_ALERT_SEVERITY.INFO,
  [VEHICLE_ALERT_KIND.MAINTENANCE_IN_PROGRESS]: VEHICLE_ALERT_SEVERITY.INFO,
};

/**
 * Nhãn NGẮN cho thẻ xe trong danh sách — chỗ chỉ đủ vài chữ.
 *
 * Cố ý KHÔNG mang số liệu nhạy cảm: không số giấy tờ, không tên file, không số tiền. Nhãn dài
 * kèm ngữ cảnh nằm ở `title`/`detail` do server sinh, và cũng theo đúng luật đó.
 */
export const VEHICLE_ALERT_SHORT_LABEL: Readonly<Record<VehicleAlertKind, string>> = {
  [VEHICLE_ALERT_KIND.MISSING_RETURN_ODOMETER]: 'Thiếu KM trả',
  [VEHICLE_ALERT_KIND.DOCUMENT_EXPIRED]: 'Giấy tờ hết hạn',
  [VEHICLE_ALERT_KIND.MAINTENANCE_OVERDUE]: 'Quá hạn bảo dưỡng',
  [VEHICLE_ALERT_KIND.PUBLIC_ACTION_REQUIRED]: 'Cần xử lý duyệt',
  [VEHICLE_ALERT_KIND.DOCUMENT_EXPIRING]: 'Giấy tờ sắp hết hạn',
  [VEHICLE_ALERT_KIND.MAINTENANCE_DUE_SOON]: 'Sắp đến hạn bảo dưỡng',
  [VEHICLE_ALERT_KIND.MISSING_VEHICLE_INFO]: 'Thiếu thông tin',
  [VEHICLE_ALERT_KIND.MISSING_ODOMETER]: 'Chưa có KM',
  [VEHICLE_ALERT_KIND.SOURCE_OBLIGATION_DUE]: 'Nghĩa vụ tài chính',
  [VEHICLE_ALERT_KIND.MAINTENANCE_IN_PROGRESS]: 'Đang bảo dưỡng',
};

/**
 * Một việc cần làm của xe. `title`/`detail` do SERVER sinh và đã lọc dữ liệu nhạy cảm — client
 * không được ghép thêm số giấy tờ, tên file hay số tiền vào đây.
 */
export interface VehicleAlert {
  kind: VehicleAlertKind;
  severity: VehicleAlertSeverity;
  title: string;
  detail?: string | null;
  /** Số bản ghi liên quan (vd 2 giấy tờ hết hạn) — chỉ ĐẾM, không kèm định danh. */
  count?: number | null;
  /**
   * Đường đi tiếp trong app (tab sửa xe, trung tâm bảo dưỡng, đơn thuê…). Luôn là đường dẫn
   * nội bộ; không bao giờ là signed URL hay link tới tài nguyên riêng tư.
   */
  href?: string | null;
}

/**
 * Sắp xếp tất định: ưu tiên theo loại, rồi theo tên loại để hai lần gọi luôn ra một thứ tự
 * (không phụ thuộc thứ tự truy vấn trả về).
 */
export function sortVehicleAlerts<T extends { kind: VehicleAlertKind }>(alerts: readonly T[]): T[] {
  return [...alerts].sort((a, b) => {
    const diff = VEHICLE_ALERT_PRIORITY[a.kind] - VEHICLE_ALERT_PRIORITY[b.kind];
    return diff !== 0 ? diff : a.kind.localeCompare(b.kind);
  });
}

/** Số việc hiện thẳng ở Hồ sơ 360 trước khi thu gọn sau `Xem tất cả` (§3 Wave 8). */
export const VEHICLE_ALERT_PRIMARY_LIMIT = 3;

/** Mức nghiêm trọng cao nhất trong danh sách — cho chip tổng hợp trên thẻ xe. */
export function topVehicleAlertSeverity(
  alerts: readonly { severity: VehicleAlertSeverity }[],
): VehicleAlertSeverity | null {
  if (alerts.length === 0) return null;
  if (alerts.some((a) => a.severity === VEHICLE_ALERT_SEVERITY.CRITICAL)) {
    return VEHICLE_ALERT_SEVERITY.CRITICAL;
  }
  if (alerts.some((a) => a.severity === VEHICLE_ALERT_SEVERITY.WARNING)) {
    return VEHICLE_ALERT_SEVERITY.WARNING;
  }
  return VEHICLE_ALERT_SEVERITY.INFO;
}
