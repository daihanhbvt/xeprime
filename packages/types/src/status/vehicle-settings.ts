/**
 * Thiết lập VẬN HÀNH của một xe (08/09/2026) — khung giờ giao nhận, thời gian chết giữa hai
 * chuyến, tự động nhận chuyến, giấy tờ/điều khoản theo dịch vụ và phụ phí mặc định có tài xế.
 *
 * Mọi mã ở đây đi trên dây và xuống DB dưới dạng `String` (ADR 0005). Nhãn hiển thị nằm ở
 * namespace `Domain` (ADR 0012); các bảng `*_LABEL` chỉ là nhãn dự phòng cho email/log của API.
 */

import { CUSTOMER_DOCUMENT_TYPE, type CustomerDocumentType } from './tenant-customer';
import { ROUTE_TYPE_VALUES, type RouteType } from './booking-request';
import { SERVICE_TYPE, type ServiceType } from './vehicle';
import { SURCHARGE_CATEGORY, type SurchargeCategory } from './settlement';

// ── Ảnh xe theo vị trí ───────────────────────────────────────────────────────

/**
 * Loại ảnh trong thư viện xe (`vehicle_images.image_type`).
 *
 * Trước đợt này cột `image_type` tồn tại nhưng không có bộ giá trị chốt và API chỉ trả
 * `images: string[]`. Ảnh cũ chưa gán loại được coi là `other` khi hiển thị và KHÔNG bị ghi lại
 * cho tới khi chủ xe bấm lưu.
 */
export const VEHICLE_IMAGE_TYPE = {
  FRONT: 'front',
  REAR: 'rear',
  LEFT: 'left',
  RIGHT: 'right',
  INTERIOR: 'interior',
  OTHER: 'other',
} as const;

export type VehicleImageType = (typeof VEHICLE_IMAGE_TYPE)[keyof typeof VEHICLE_IMAGE_TYPE];
export const VEHICLE_IMAGE_TYPE_VALUES = Object.values(VEHICLE_IMAGE_TYPE) as VehicleImageType[];

/** Thứ tự ô ảnh trên màn thư viện — mặt trước tới nội thất, "khác" đứng cuối. */
export const VEHICLE_IMAGE_SLOT_ORDER: readonly VehicleImageType[] = [
  VEHICLE_IMAGE_TYPE.FRONT,
  VEHICLE_IMAGE_TYPE.REAR,
  VEHICLE_IMAGE_TYPE.LEFT,
  VEHICLE_IMAGE_TYPE.RIGHT,
  VEHICLE_IMAGE_TYPE.INTERIOR,
  VEHICLE_IMAGE_TYPE.OTHER,
];

export const VEHICLE_IMAGE_TYPE_LABEL: Readonly<Record<VehicleImageType, string>> = {
  [VEHICLE_IMAGE_TYPE.FRONT]: 'Ảnh mặt trước',
  [VEHICLE_IMAGE_TYPE.REAR]: 'Ảnh mặt sau',
  [VEHICLE_IMAGE_TYPE.LEFT]: 'Ảnh bên trái',
  [VEHICLE_IMAGE_TYPE.RIGHT]: 'Ảnh bên phải',
  [VEHICLE_IMAGE_TYPE.INTERIOR]: 'Ảnh nội thất',
  [VEHICLE_IMAGE_TYPE.OTHER]: 'Ảnh khác',
};

/** Ô nào chỉ giữ MỘT ảnh, ô nào nhận nhiều ảnh (chỉ `other`). */
export function isSingleVehicleImageSlot(type: VehicleImageType): boolean {
  return type !== VEHICLE_IMAGE_TYPE.OTHER;
}

/** Loại ảnh đọc từ DB — giá trị lạ/rỗng (dữ liệu cũ) rơi về `other`, không ném. */
export function vehicleImageTypeOf(value: string | null | undefined): VehicleImageType {
  return (VEHICLE_IMAGE_TYPE_VALUES as string[]).includes(value ?? '')
    ? (value as VehicleImageType)
    : VEHICLE_IMAGE_TYPE.OTHER;
}

/** Trần số ảnh thư viện — khớp `vehicleFormSchema.images.max(20)` và DTO backend. */
export const VEHICLE_GALLERY_MAX_IMAGES = 20;

// ── Khung giờ giao nhận + thời gian chết ─────────────────────────────────────

export const HANDOVER_WINDOW_KIND = {
  PICKUP: 'pickup',
  RETURN: 'return',
} as const;

export type HandoverWindowKind = (typeof HANDOVER_WINDOW_KIND)[keyof typeof HANDOVER_WINDOW_KIND];
export const HANDOVER_WINDOW_KIND_VALUES = Object.values(
  HANDOVER_WINDOW_KIND,
) as HandoverWindowKind[];

/** Số mốc tối đa mỗi loại (giao / nhận) — đủ cho sáng-chiều-tối, chặn payload phình. */
export const HANDOVER_WINDOW_MAX_PER_KIND = 4;

/** Mốc là số PHÚT kể từ 00:00 giờ Việt Nam; `end` lớn nhất là 1440 (= 24:00, kết thúc ngày). */
export const HANDOVER_WINDOW_MIN_MINUTE = 0;
export const HANDOVER_WINDOW_MAX_MINUTE = 1440;

/** Một khung giờ trong ngày — `start < end`, không qua nửa đêm trong cùng một dòng. */
export interface HandoverWindow {
  /** `HH:mm` giờ Việt Nam. */
  start: string;
  /** `HH:mm`; `24:00` là hết ngày. */
  end: string;
}

const HHMM = /^([01]\d|2[0-4]):([0-5]\d)$/;

/** `"08:30"` → 510. Trả `null` khi chuỗi không hợp lệ (24:00 = 1440 hợp lệ, 24:01 thì không). */
export function handoverTimeToMinute(value: string): number | null {
  const match = HHMM.exec(value);
  if (!match) return null;
  const minute = Number(match[1]) * 60 + Number(match[2]);
  return minute > HANDOVER_WINDOW_MAX_MINUTE ? null : minute;
}

/** 510 → `"08:30"`; 1440 → `"24:00"`. */
export function minuteToHandoverTime(minute: number): string {
  const h = Math.floor(minute / 60);
  const m = minute % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/**
 * Phút-trong-ngày (giờ Việt Nam) của một mốc UTC — để đối chiếu với khung giờ giao nhận.
 * Asia/Ho_Chi_Minh cố định UTC+7, không DST.
 */
export function vnMinuteOfDay(at: Date): number {
  const shifted = new Date(at.getTime() + 7 * 60 * 60 * 1000);
  return shifted.getUTCHours() * 60 + shifted.getUTCMinutes();
}

/**
 * Mốc có nằm trong ít nhất một khung không. KHÔNG có khung nào = không giới hạn (mọi giờ đều
 * nhận) — thiếu cấu hình không được hiểu là "đóng cửa cả ngày".
 *
 * Biên: `[start, end]` — trả xe đúng 22:00 của khung "06:00–22:00" vẫn hợp lệ.
 */
export function isWithinHandoverWindows(
  at: Date,
  windows: readonly HandoverWindow[] | null | undefined,
): boolean {
  if (!windows || windows.length === 0) return true;
  const minute = vnMinuteOfDay(at);
  return windows.some((w) => {
    const start = handoverTimeToMinute(w.start);
    const end = handoverTimeToMinute(w.end);
    if (start == null || end == null) return false;
    return minute >= start && minute <= end;
  });
}

/** Mức thời gian chết gợi ý (phút); người dùng vẫn nhập giá trị khác trong `[0, MAX]`. */
export const TURNAROUND_BUFFER_PRESET_MINUTES: readonly number[] = [0, 60, 120];
export const TURNAROUND_BUFFER_MAX_MINUTES = 1440;

// ── Tự động nhận chuyến ──────────────────────────────────────────────────────

/** Dịch vụ có thiết lập riêng theo xe. Thuê dài hạn KHÔNG có: gian hàng luôn chốt lịch tay (ADR 0011). */
export const VEHICLE_SERVICE_SETTING_SERVICES: readonly ServiceType[] = [
  SERVICE_TYPE.SELF_DRIVE,
  SERVICE_TYPE.WITH_DRIVER,
];

export function hasVehicleServiceSettings(serviceType: string): boolean {
  return (VEHICLE_SERVICE_SETTING_SERVICES as string[]).includes(serviceType);
}

/** Lựa chọn "đặt trước ít nhất" (phút) — 1 giờ tới 3 ngày. */
export const AUTO_ACCEPT_MIN_LEAD_OPTIONS_MINUTES: readonly number[] = [
  60, 120, 240, 360, 720, 1440, 2880, 4320,
];
/** Lựa chọn "đặt trước tối đa" (phút) — 1 ngày tới 90 ngày. */
export const AUTO_ACCEPT_MAX_LEAD_OPTIONS_MINUTES: readonly number[] = [
  1440, 4320, 10080, 20160, 43200, 129600,
];
export const AUTO_ACCEPT_LEAD_MAX_MINUTES = 129600;
export const AUTO_ACCEPT_DEFAULT_MIN_LEAD_MINUTES = 360;
export const AUTO_ACCEPT_DEFAULT_MAX_LEAD_MINUTES = 10080;

/** Thời lượng thuê tối thiểu (có tài xế) — giờ, dạng phút. */
export const MIN_RENTAL_MINUTES_RANGE = { min: 60, max: 24 * 60 } as const;
export const MIN_BOOKING_LEAD_MINUTES_RANGE = { min: 60, max: 72 * 60 } as const;

/**
 * Vì sao một yêu cầu KHÔNG được tự động nhận — MÃ, không phải câu; giao diện dịch qua `Domain`.
 * `null`/vắng = đủ điều kiện.
 */
export const AUTO_ACCEPT_BLOCKER = {
  DISABLED: 'disabled',
  SERVICE_NOT_SUPPORTED: 'service_not_supported',
  LEAD_TOO_SHORT: 'lead_too_short',
  LEAD_TOO_LONG: 'lead_too_long',
  OUTSIDE_HANDOVER_WINDOW: 'outside_handover_window',
  BELOW_MIN_DURATION: 'below_min_duration',
  QUOTE_ESTIMATE: 'quote_estimate',
  SCHEDULE_BUSY: 'schedule_busy',
  NO_DRIVER: 'no_driver',
  HOLD_REQUIRED_WITH_DRIVER: 'hold_required_with_driver',
  TERMS_NOT_ACCEPTED: 'terms_not_accepted',
} as const;

export type AutoAcceptBlocker = (typeof AUTO_ACCEPT_BLOCKER)[keyof typeof AUTO_ACCEPT_BLOCKER];
export const AUTO_ACCEPT_BLOCKER_VALUES = Object.values(AUTO_ACCEPT_BLOCKER) as AutoAcceptBlocker[];

/** Ai quyết định một yêu cầu thuê — cột `booking_requests.decision_source`. */
export const BOOKING_REQUEST_DECISION_SOURCE = {
  HOST: 'host',
  SYSTEM: 'system',
} as const;

export type BookingRequestDecisionSource =
  (typeof BOOKING_REQUEST_DECISION_SOURCE)[keyof typeof BOOKING_REQUEST_DECISION_SOURCE];
export const BOOKING_REQUEST_DECISION_SOURCE_VALUES = Object.values(
  BOOKING_REQUEST_DECISION_SOURCE,
) as BookingRequestDecisionSource[];

// ── Giấy tờ / đối chiếu / điều khoản theo dịch vụ ────────────────────────────

/**
 * Giấy tờ chủ xe được phép YÊU CẦU thêm cho một dịch vụ. `other` không bao giờ nằm đây — nó
 * không định danh được ai. Bộ tối thiểu theo luật (`requiredIdentityDocuments`) luôn được cộng
 * vào; thiết lập chỉ nói "CCCD hay hộ chiếu" và có đòi thêm gì không.
 */
export const CONFIGURABLE_CUSTOMER_DOCUMENT_TYPES: readonly CustomerDocumentType[] = [
  CUSTOMER_DOCUMENT_TYPE.CITIZEN_ID,
  CUSTOMER_DOCUMENT_TYPE.DRIVER_LICENCE,
  CUSTOMER_DOCUMENT_TYPE.PASSPORT,
];

/** Bộ giấy tờ HIỆU LỰC = tối thiểu theo dịch vụ ∪ phần chủ xe cấu hình, giữ thứ tự ổn định. */
export function effectiveRequiredDocuments(
  serviceType: string,
  configured: readonly string[] | null | undefined,
  legalMinimum: readonly CustomerDocumentType[],
): CustomerDocumentType[] {
  const set = new Set<string>(legalMinimum);
  /*
   * Chủ xe chọn hộ chiếu THAY cho CCCD (khách nước ngoài): CCCD tối thiểu được thay bằng hộ
   * chiếu khi cấu hình có passport mà không có citizen_id. GPLX của tự lái không bao giờ bị bỏ.
   */
  const cfg = new Set(configured ?? []);
  if (cfg.has(CUSTOMER_DOCUMENT_TYPE.PASSPORT) && !cfg.has(CUSTOMER_DOCUMENT_TYPE.CITIZEN_ID)) {
    set.delete(CUSTOMER_DOCUMENT_TYPE.CITIZEN_ID);
  }
  for (const doc of cfg) {
    if ((CONFIGURABLE_CUSTOMER_DOCUMENT_TYPES as string[]).includes(doc)) set.add(doc);
  }
  void serviceType;
  return [...set] as CustomerDocumentType[];
}

/** Điều khoản hiển thị cho khách — tối đa 4000 ký tự, cùng trần với mô tả xe. */
export const RENTAL_TERMS_MAX_LENGTH = 4000;

// ── Phụ phí mặc định có tài xế ──────────────────────────────────────────────

/**
 * Bốn khoản phụ phí mặc định của dịch vụ CÓ TÀI XẾ. Đây là QUY TẮC công bố trước với khách,
 * KHÔNG phải khoản đã ghi vào đơn: khoản thật vẫn đi qua `booking_surcharges` ở bước quyết toán
 * (mỗi loại ánh xạ sang một `SURCHARGE_CATEGORY`).
 */
export const DRIVER_SURCHARGE_KIND = {
  OVERTIME: 'overtime',
  WAITING: 'waiting',
  LONG_DISTANCE: 'long_distance',
  OVERNIGHT: 'overnight',
} as const;

export type DriverSurchargeKind = (typeof DRIVER_SURCHARGE_KIND)[keyof typeof DRIVER_SURCHARGE_KIND];
export const DRIVER_SURCHARGE_KIND_VALUES = Object.values(
  DRIVER_SURCHARGE_KIND,
) as DriverSurchargeKind[];

/** Đơn vị tính của số tiền — cố định theo loại, KHÔNG cấu hình. */
export const DRIVER_SURCHARGE_UNIT = {
  PER_HOUR: 'per_hour',
  PER_30_MINUTES: 'per_30_minutes',
  PER_KM: 'per_km',
  PER_NIGHT: 'per_night',
} as const;

export type DriverSurchargeUnit = (typeof DRIVER_SURCHARGE_UNIT)[keyof typeof DRIVER_SURCHARGE_UNIT];
export const DRIVER_SURCHARGE_UNIT_VALUES = Object.values(
  DRIVER_SURCHARGE_UNIT,
) as DriverSurchargeUnit[];

/** Ngưỡng/điều kiện đi kèm mỗi loại — `null` = loại đó không có ngưỡng. */
export const DRIVER_SURCHARGE_THRESHOLD_KIND = {
  /** Phút-trong-ngày (giờ VN) từ đó tính "ngoài giờ" — vd 1320 = 22:00. */
  MINUTE_OF_DAY: 'minute_of_day',
  /** Số phút chờ miễn phí trước khi tính phí. */
  GRACE_MINUTES: 'grace_minutes',
  /** Số km/ngày vượt qua thì tính phí phần vượt. */
  KM_PER_DAY: 'km_per_day',
} as const;

export type DriverSurchargeThresholdKind =
  (typeof DRIVER_SURCHARGE_THRESHOLD_KIND)[keyof typeof DRIVER_SURCHARGE_THRESHOLD_KIND];

export interface DriverSurchargeKindSpec {
  unit: DriverSurchargeUnit;
  threshold: DriverSurchargeThresholdKind | null;
  /** Danh mục phát sinh thật khi ghi vào đơn. */
  category: SurchargeCategory;
}

export const DRIVER_SURCHARGE_KIND_SPEC: Readonly<Record<DriverSurchargeKind, DriverSurchargeKindSpec>> =
  {
    [DRIVER_SURCHARGE_KIND.OVERTIME]: {
      unit: DRIVER_SURCHARGE_UNIT.PER_HOUR,
      threshold: DRIVER_SURCHARGE_THRESHOLD_KIND.MINUTE_OF_DAY,
      category: SURCHARGE_CATEGORY.OVERTIME,
    },
    [DRIVER_SURCHARGE_KIND.WAITING]: {
      unit: DRIVER_SURCHARGE_UNIT.PER_30_MINUTES,
      threshold: DRIVER_SURCHARGE_THRESHOLD_KIND.GRACE_MINUTES,
      category: SURCHARGE_CATEGORY.WAITING,
    },
    [DRIVER_SURCHARGE_KIND.LONG_DISTANCE]: {
      unit: DRIVER_SURCHARGE_UNIT.PER_KM,
      threshold: DRIVER_SURCHARGE_THRESHOLD_KIND.KM_PER_DAY,
      category: SURCHARGE_CATEGORY.LONG_DISTANCE,
    },
    [DRIVER_SURCHARGE_KIND.OVERNIGHT]: {
      unit: DRIVER_SURCHARGE_UNIT.PER_NIGHT,
      threshold: null,
      category: SURCHARGE_CATEGORY.OVERNIGHT,
    },
  };

/** Loại phụ phí mặc định ứng với một danh mục phát sinh (để gợi ý số tiền khi ghi khoản thật). */
export function driverSurchargeKindForCategory(category: string): DriverSurchargeKind | null {
  const hit = DRIVER_SURCHARGE_KIND_VALUES.find(
    (kind) => DRIVER_SURCHARGE_KIND_SPEC[kind].category === category,
  );
  return hit ?? null;
}

/** Ngưỡng tối đa theo từng loại — canh cả ở DTO lẫn CHECK. */
export const DRIVER_SURCHARGE_THRESHOLD_MAX = 100000;

// ── Đặt cọc giữ chuyến có tài xế ─────────────────────────────────────────────

/**
 * Điều kiện đặt cọc giữ chuyến CÓ TÀI XẾ — KHÁC hẳn cọc thế chấp tự lái
 * (`RentalPolicy.depositAmount`): đây là tiền trả trước cho chính chuyến đi.
 *
 * Chỉ `none` được ghi hôm nay: thu 30%/50% cần nối vào vòng đời giữ chỗ/thanh toán và snapshot
 * (ADR 0028). Hai mã còn lại giữ chỗ trong bộ giá trị + CHECK DB để mở sau mà không migrate.
 */
export const DRIVER_DEPOSIT_MODE = {
  NONE: 'none',
  PERCENT_30: 'percent_30',
  PERCENT_50: 'percent_50',
} as const;

export type DriverDepositMode = (typeof DRIVER_DEPOSIT_MODE)[keyof typeof DRIVER_DEPOSIT_MODE];
export const DRIVER_DEPOSIT_MODE_VALUES = Object.values(DRIVER_DEPOSIT_MODE) as DriverDepositMode[];
/** Bộ giá trị được PHÉP LƯU hôm nay — DTO `@IsIn` đọc đúng danh sách này. */
export const DRIVER_DEPOSIT_MODE_SUPPORTED = [DRIVER_DEPOSIT_MODE.NONE] as const;

/** Chế độ cọc mà hệ thống THU được hôm nay — 30%/50% còn chờ luồng giữ chỗ/thanh toán. */
export type SupportedDriverDepositMode = (typeof DRIVER_DEPOSIT_MODE_SUPPORTED)[number];

/**
 * Type guard chứ không phải boolean trần: nơi gọi (DTO, form) cần TS thu hẹp về đúng tập giá
 * trị gửi được, nếu không sẽ phải ép kiểu ở mọi chỗ ghi.
 */
export function isDriverDepositModeSupported(mode: string): mode is SupportedDriverDepositMode {
  return (DRIVER_DEPOSIT_MODE_SUPPORTED as readonly string[]).includes(mode);
}

// ── Snapshot điều kiện thuê trên yêu cầu / đơn ───────────────────────────────

/** Một quy tắc phụ phí đã đóng băng — cùng shape với DTO công khai. */
export interface DriverSurchargeRuleSnapshot {
  kind: DriverSurchargeKind;
  unit: DriverSurchargeUnit;
  /** VND string (ADR 0007). */
  amount: string;
  thresholdValue: number | null;
}

/**
 * Điều kiện thuê ĐÓNG BĂNG vào `booking_requests.rental_terms_json` lúc khách gửi và COPY sang
 * `bookings.rental_terms_json` lúc duyệt. Chủ xe đổi thiết lập sau đó KHÔNG được viết lại.
 */
export interface RentalTermsSnapshot {
  serviceType: ServiceType;
  requiredDocuments: CustomerDocumentType[];
  identityVerifyMethod: string;
  termsText: string | null;
  requireTermsAcceptance: boolean;
  /** ISO — thời điểm khách tích đồng ý; null khi không bắt buộc. */
  termsAcceptedAt: string | null;
  depositMode: DriverDepositMode | null;
  surchargeRules: DriverSurchargeRuleSnapshot[];
  pickupWindows: HandoverWindow[];
  returnWindows: HandoverWindow[];
  turnaroundBufferMinutes: number;
}

// ── Lịch sử chuyến của MỘT xe ───────────────────────────────────────────────

/** Tab của màn lịch sử chuyến — giá trị đi trong query `filter`. */
export const VEHICLE_TRIP_HISTORY_FILTER = {
  ALL: 'all',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
} as const;

export type VehicleTripHistoryFilter =
  (typeof VEHICLE_TRIP_HISTORY_FILTER)[keyof typeof VEHICLE_TRIP_HISTORY_FILTER];
export const VEHICLE_TRIP_HISTORY_FILTER_VALUES = Object.values(
  VEHICLE_TRIP_HISTORY_FILTER,
) as VehicleTripHistoryFilter[];

/** Nguồn của một dòng lịch sử — đơn thuê thật hay yêu cầu chưa/không thành đơn. */
export const VEHICLE_TRIP_HISTORY_KIND = {
  BOOKING: 'booking',
  REQUEST: 'request',
} as const;

export type VehicleTripHistoryKind =
  (typeof VEHICLE_TRIP_HISTORY_KIND)[keyof typeof VEHICLE_TRIP_HISTORY_KIND];
export const VEHICLE_TRIP_HISTORY_KIND_VALUES = Object.values(
  VEHICLE_TRIP_HISTORY_KIND,
) as VehicleTripHistoryKind[];

/** Lộ trình ưu tiên hợp lệ = đúng bộ `ROUTE_TYPE` — không có category marketing nào khác. */
export function isPreferredRouteTypeList(values: readonly string[]): values is RouteType[] {
  return values.every((v) => (ROUTE_TYPE_VALUES as string[]).includes(v));
}
