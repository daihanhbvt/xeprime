/**
 * Bảo dưỡng & KM (Wave 6) — docs/design/12_VEHICLE_360_MANAGEMENT.md §9.
 *
 * Hai miền tách bạch có chủ đích:
 *  - **Odometer**: số KM có thẩm quyền của xe + lịch sử CHỈ-THÊM (`vehicle_odometer_readings`).
 *    Dữ liệu khách tự khai KHÔNG BAO GIỜ cập nhật KM (§9.1).
 *  - **Bảo dưỡng**: cấu hình chu kỳ + các bản ghi công việc. Khoảng bảo dưỡng đã xác nhận
 *    chặn lịch bằng `vehicle_occupancies` (ADR 0006) — đổi nhãn trạng thái xe là KHÔNG đủ (§9.2).
 */

import type { StatusMeta } from './meta';

/**
 * Nguồn của một lần ghi KM. `source` cho biết ai/cái gì làm KM đổi — chỉnh tay phải kèm lý do,
 * còn lại đều phải có `sourceRefId` trỏ về nghiệp vụ gốc (đơn thuê, phiếu bảo dưỡng).
 */
export const ODOMETER_SOURCE = {
  /** Người dùng sửa tay — BẮT BUỘC có lý do (CHECK ở DB, không chỉ ở app). */
  MANUAL_CORRECTION: 'manual_correction',
  /** Ghi khi hoàn tất một phiếu bảo dưỡng (KM tại thời điểm bảo dưỡng). */
  MAINTENANCE: 'maintenance',
  /** Bàn giao nhận xe — Wave 7 nối vào, Wave 6 chỉ mở sẵn nguồn. */
  BOOKING_PICKUP: 'booking_pickup',
  /** Bàn giao trả xe đã xác nhận — nguồn cập nhật KM chính thức (§9.1). */
  BOOKING_RETURN: 'booking_return',
  /** Nhập liệu/di trú dữ liệu có kiểm soát. */
  IMPORT: 'import',
} as const;

export type OdometerSource = (typeof ODOMETER_SOURCE)[keyof typeof ODOMETER_SOURCE];
export const ODOMETER_SOURCE_VALUES = Object.values(ODOMETER_SOURCE) as OdometerSource[];

export const ODOMETER_SOURCE_LABEL: Readonly<Record<OdometerSource, string>> = {
  [ODOMETER_SOURCE.MANUAL_CORRECTION]: 'Điều chỉnh thủ công',
  [ODOMETER_SOURCE.MAINTENANCE]: 'Bảo dưỡng',
  [ODOMETER_SOURCE.BOOKING_PICKUP]: 'Bàn giao nhận xe',
  [ODOMETER_SOURCE.BOOKING_RETURN]: 'Bàn giao trả xe',
  [ODOMETER_SOURCE.IMPORT]: 'Nhập dữ liệu',
};

/**
 * Trần KM chấp nhận được — chặn ở app trước khi chạm cột `integer` của Postgres và bắt lỗi
 * gõ nhầm (nhập 45230000 thay vì 45230). CHECK ở DB là chốt cuối.
 */
export const ODOMETER_MAX_KM = 2_000_000;

/** Lý do điều chỉnh KM có sẵn — chọn từ danh sách rồi ghi chú thêm (ảnh Figma state 4/5). */
export const ODOMETER_CORRECTION_REASON = {
  HANDOVER_ERROR: 'handover_error',
  DEVICE_ERROR: 'device_error',
  CLUSTER_REPLACED: 'cluster_replaced',
  DATA_MIGRATION: 'data_migration',
  OTHER: 'other',
} as const;

export type OdometerCorrectionReason =
  (typeof ODOMETER_CORRECTION_REASON)[keyof typeof ODOMETER_CORRECTION_REASON];
export const ODOMETER_CORRECTION_REASON_VALUES = Object.values(
  ODOMETER_CORRECTION_REASON,
) as OdometerCorrectionReason[];

export const ODOMETER_CORRECTION_REASON_LABEL: Readonly<
  Record<OdometerCorrectionReason, string>
> = {
  [ODOMETER_CORRECTION_REASON.HANDOVER_ERROR]: 'Sai số từ bàn giao',
  [ODOMETER_CORRECTION_REASON.DEVICE_ERROR]: 'Lỗi đồng hồ đo',
  [ODOMETER_CORRECTION_REASON.CLUSTER_REPLACED]: 'Thay cụm đồng hồ',
  [ODOMETER_CORRECTION_REASON.DATA_MIGRATION]: 'Chuyển đổi dữ liệu',
  [ODOMETER_CORRECTION_REASON.OTHER]: 'Lý do khác',
};

// ── Bảo dưỡng ────────────────────────────────────────────────────────────────

export const MAINTENANCE_TYPE = {
  OIL_CHANGE: 'oil_change',
  PERIODIC_SERVICE: 'periodic_service',
  REPAIR: 'repair',
  TIRE: 'tire',
  BATTERY: 'battery',
  OTHER: 'other',
} as const;

export type MaintenanceType = (typeof MAINTENANCE_TYPE)[keyof typeof MAINTENANCE_TYPE];
export const MAINTENANCE_TYPE_VALUES = Object.values(MAINTENANCE_TYPE) as MaintenanceType[];

export const MAINTENANCE_TYPE_LABEL: Readonly<Record<MaintenanceType, string>> = {
  [MAINTENANCE_TYPE.OIL_CHANGE]: 'Thay dầu động cơ & Lọc dầu',
  [MAINTENANCE_TYPE.PERIODIC_SERVICE]: 'Bảo dưỡng định kỳ',
  [MAINTENANCE_TYPE.REPAIR]: 'Sửa chữa',
  [MAINTENANCE_TYPE.TIRE]: 'Lốp xe',
  [MAINTENANCE_TYPE.BATTERY]: 'Ắc quy',
  [MAINTENANCE_TYPE.OTHER]: 'Hạng mục khác',
};

/**
 * CHỈ loại này mới được cập nhật "KM thay nhớt lần gần nhất" khi hoàn tất. Sửa chữa hay
 * thay lốp hoàn tất KHÔNG âm thầm dời mốc thay nhớt (yêu cầu nghiệp vụ Wave 6 §3).
 */
export const MAINTENANCE_TYPES_RESET_OIL_CHANGE: readonly MaintenanceType[] = [
  MAINTENANCE_TYPE.OIL_CHANGE,
];

export const MAINTENANCE_STATUS = {
  SCHEDULED: 'scheduled',
  IN_PROGRESS: 'in_progress',
  COMPLETED: 'completed',
  CANCELED: 'canceled',
} as const;

export type MaintenanceStatus = (typeof MAINTENANCE_STATUS)[keyof typeof MAINTENANCE_STATUS];
export const MAINTENANCE_STATUS_VALUES = Object.values(MAINTENANCE_STATUS) as MaintenanceStatus[];

export const MAINTENANCE_STATUS_META: Readonly<Record<MaintenanceStatus, StatusMeta>> = {
  [MAINTENANCE_STATUS.SCHEDULED]: { label: 'Đã lên lịch', color: 'blue' },
  [MAINTENANCE_STATUS.IN_PROGRESS]: { label: 'Đang bảo dưỡng', color: 'purple' },
  [MAINTENANCE_STATUS.COMPLETED]: { label: 'Hoàn tất', color: 'green' },
  [MAINTENANCE_STATUS.CANCELED]: { label: 'Đã hủy', color: 'default' },
};

/** Chuyển trạng thái hợp lệ — trạng thái kết thúc (hoàn tất/hủy) là điểm dừng. */
export const MAINTENANCE_STATUS_TRANSITIONS: Readonly<
  Record<MaintenanceStatus, readonly MaintenanceStatus[]>
> = {
  [MAINTENANCE_STATUS.SCHEDULED]: [
    MAINTENANCE_STATUS.IN_PROGRESS,
    MAINTENANCE_STATUS.COMPLETED,
    MAINTENANCE_STATUS.CANCELED,
  ],
  [MAINTENANCE_STATUS.IN_PROGRESS]: [MAINTENANCE_STATUS.COMPLETED, MAINTENANCE_STATUS.CANCELED],
  [MAINTENANCE_STATUS.COMPLETED]: [],
  [MAINTENANCE_STATUS.CANCELED]: [],
};

/** Trạng thái chiếm lịch: chỉ lịch còn hiệu lực mới giữ chỗ trên `vehicle_occupancies`. */
export const MAINTENANCE_STATUS_HOLDING_SCHEDULE: readonly MaintenanceStatus[] = [
  MAINTENANCE_STATUS.SCHEDULED,
  MAINTENANCE_STATUS.IN_PROGRESS,
];

export function isMaintenanceTransitionAllowed(
  from: MaintenanceStatus,
  to: MaintenanceStatus,
): boolean {
  return MAINTENANCE_STATUS_TRANSITIONS[from]?.includes(to) ?? false;
}

// ── Mốc bảo dưỡng suy ra ─────────────────────────────────────────────────────

/**
 * Trạng thái đến hạn — SUY RA lúc đọc từ KM, không cột nào lưu.
 * `UNKNOWN` = thiếu thành phần để tính; UI hiển thị `Chưa đủ dữ liệu`, KHÔNG dùng 0km giả (§9).
 */
export const MAINTENANCE_DUE_STATUS = {
  UNKNOWN: 'unknown',
  OK: 'ok',
  DUE_SOON: 'due_soon',
  OVERDUE: 'overdue',
} as const;

export type MaintenanceDueStatus =
  (typeof MAINTENANCE_DUE_STATUS)[keyof typeof MAINTENANCE_DUE_STATUS];
export const MAINTENANCE_DUE_STATUS_VALUES = Object.values(
  MAINTENANCE_DUE_STATUS,
) as MaintenanceDueStatus[];

export const MAINTENANCE_DUE_STATUS_META: Readonly<Record<MaintenanceDueStatus, StatusMeta>> = {
  [MAINTENANCE_DUE_STATUS.UNKNOWN]: { label: 'Chưa đủ dữ liệu', color: 'default' },
  [MAINTENANCE_DUE_STATUS.OK]: { label: 'Trong chu kỳ', color: 'green' },
  [MAINTENANCE_DUE_STATUS.DUE_SOON]: { label: 'Sắp đến hạn', color: 'orange' },
  [MAINTENANCE_DUE_STATUS.OVERDUE]: { label: 'Quá hạn', color: 'red' },
};

/**
 * Ngưỡng "sắp đến hạn" MẶC ĐỊNH của nền tảng, tính bằng KM còn lại.
 *
 * Đây là hằng số CÔNG KHAI, có tên, ở tầng type — không phải con số giấu trong component.
 * Gian hàng ghi đè bằng `tenant_profiles.settings_json.maintenanceDueSoonKm` (cùng convention
 * với `documentExpiryWarningDays` của Wave 5). API luôn TRẢ ngưỡng đang hiệu lực trong
 * response để UI không phải đoán.
 */
export const MAINTENANCE_DUE_SOON_KM_DEFAULT = 500;

export interface MaintenanceScheduleInput {
  /** KM hiện tại của xe; `null` = chưa từng ghi nhận. */
  currentKm?: number | null;
  /** KM tại lần thay nhớt/bảo dưỡng gần nhất. */
  lastServiceKm?: number | null;
  /** Chu kỳ thay nhớt (KM). */
  intervalKm?: number | null;
  /** Ngưỡng còn lại để coi là "sắp đến hạn" — cấu hình tenant, không hard-code ở UI. */
  dueSoonKm?: number | null;
}

export interface MaintenanceScheduleResult {
  nextMaintenanceKm: number | null;
  remainingKm: number | null;
  /** KM đã đi trong chu kỳ hiện tại (currentKm − lastServiceKm) — cho thanh tiến độ. */
  usedKm: number | null;
  /** Phần trăm chu kỳ đã dùng, có thể >100 khi quá hạn. `null` khi chưa đủ dữ liệu. */
  usedPercent: number | null;
  status: MaintenanceDueStatus;
}

/**
 * Công thức chốt ở §9:
 *
 * ```text
 * km_bao_duong_tiep_theo = km_lan_gan_nhat + chu_ky_km
 * km_con_lai             = km_bao_duong_tiep_theo − km_hien_tai
 * ```
 *
 * Thiếu bất kỳ thành phần nào → `UNKNOWN` + các số là `null`. Hàm THUẦN để test được và để
 * FE/BE không bao giờ lệch cách tính.
 */
export function vehicleMaintenanceSchedule(
  input: MaintenanceScheduleInput,
): MaintenanceScheduleResult {
  const { currentKm, lastServiceKm, intervalKm } = input;
  const hasInterval = typeof intervalKm === 'number' && intervalKm > 0;
  const hasLastService = typeof lastServiceKm === 'number' && lastServiceKm >= 0;
  const hasCurrent = typeof currentKm === 'number' && currentKm >= 0;

  if (!hasInterval || !hasLastService) {
    return {
      nextMaintenanceKm: null,
      remainingKm: null,
      usedKm: null,
      usedPercent: null,
      status: MAINTENANCE_DUE_STATUS.UNKNOWN,
    };
  }

  const nextMaintenanceKm = lastServiceKm + intervalKm;
  if (!hasCurrent) {
    // Biết mốc tiếp theo nhưng KHÔNG biết đang ở đâu → vẫn là chưa đủ dữ liệu để kết luận.
    return {
      nextMaintenanceKm,
      remainingKm: null,
      usedKm: null,
      usedPercent: null,
      status: MAINTENANCE_DUE_STATUS.UNKNOWN,
    };
  }

  const remainingKm = nextMaintenanceKm - currentKm;
  const usedKm = currentKm - lastServiceKm;
  const dueSoonKm = typeof input.dueSoonKm === 'number' && input.dueSoonKm > 0 ? input.dueSoonKm : null;

  let status: MaintenanceDueStatus = MAINTENANCE_DUE_STATUS.OK;
  if (remainingKm <= 0) status = MAINTENANCE_DUE_STATUS.OVERDUE;
  else if (dueSoonKm !== null && remainingKm <= dueSoonKm) status = MAINTENANCE_DUE_STATUS.DUE_SOON;

  return {
    nextMaintenanceKm,
    remainingKm,
    usedKm,
    usedPercent: Math.round((usedKm / intervalKm) * 1000) / 10,
    status,
  };
}

/** Bộ lọc việc-cần-làm của Trung tâm bảo dưỡng (§9.2) — thứ tự này là thứ tự tab trên UI. */
export const MAINTENANCE_BOARD_FILTER = {
  ALL: 'all',
  OVERDUE: 'overdue',
  DUE_SOON: 'due_soon',
  IN_PROGRESS: 'in_progress',
  MISSING_ODOMETER: 'missing_odometer',
  UPCOMING: 'upcoming',
  HISTORY: 'history',
  /**
   * Hàng đợi "Thiếu KM trả" (Wave 8): các biên bản TRẢ XE đã xác nhận nhưng chưa có KM.
   *
   * Đây KHÔNG phải phiếu bảo dưỡng — nó là việc vận hành, chỉ *ảnh hưởng* tới tính toán bảo
   * dưỡng vì KM có thẩm quyền đang treo. Đặt ở trung tâm bảo dưỡng vì đây là bề mặt việc-cần-làm
   * đã có sẵn; tạo một mục điều hướng thứ hai cho một loại việc là cách chia nhỏ sự chú ý.
   */
  MISSING_RETURN_KM: 'missing_return_km',
} as const;

export type MaintenanceBoardFilter =
  (typeof MAINTENANCE_BOARD_FILTER)[keyof typeof MAINTENANCE_BOARD_FILTER];
export const MAINTENANCE_BOARD_FILTER_VALUES = Object.values(
  MAINTENANCE_BOARD_FILTER,
) as MaintenanceBoardFilter[];

export const MAINTENANCE_BOARD_FILTER_LABEL: Readonly<Record<MaintenanceBoardFilter, string>> = {
  [MAINTENANCE_BOARD_FILTER.ALL]: 'Tất cả',
  [MAINTENANCE_BOARD_FILTER.OVERDUE]: 'Quá hạn',
  [MAINTENANCE_BOARD_FILTER.DUE_SOON]: 'Sắp đến hạn',
  [MAINTENANCE_BOARD_FILTER.IN_PROGRESS]: 'Đang bảo dưỡng',
  [MAINTENANCE_BOARD_FILTER.MISSING_ODOMETER]: 'Thiếu dữ liệu KM',
  [MAINTENANCE_BOARD_FILTER.UPCOMING]: 'Lịch sắp tới',
  [MAINTENANCE_BOARD_FILTER.HISTORY]: 'Lịch sử',
  [MAINTENANCE_BOARD_FILTER.MISSING_RETURN_KM]: 'Thiếu KM trả',
};

/**
 * Nhóm việc KHÔNG phải danh sách xe: hàng đợi bàn giao thiếu KM có cột và hành động riêng.
 * Tách ra để trang biết đổi bảng thay vì cố nhồi dữ liệu biên bản vào dòng-là-xe.
 */
export const MAINTENANCE_BOARD_QUEUE_FILTERS: readonly MaintenanceBoardFilter[] = [
  MAINTENANCE_BOARD_FILTER.MISSING_RETURN_KM,
];
