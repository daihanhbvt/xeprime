/**
 * Bàn giao xe (Wave 7) — docs/design/12_VEHICLE_360_MANAGEMENT.md §9.1 + design-briefs/05.
 *
 * Bàn giao là CẦU NỐI giữa đơn thuê và hồ sơ xe: nó là nơi DUY NHẤT mà số KM do con người
 * đọc trên đồng hồ được đưa vào hệ thống, và chỉ khi ĐÃ XÁC NHẬN mới chảy tiếp sang
 * `vehicle_odometer_readings` (§9.1: "Không cập nhật KM từ dữ liệu khách tự khai").
 *
 * Bản nháp KHÔNG có hiệu lực nghiệp vụ nào: không đổi KM, không đổi trạng thái đơn, không
 * đụng lịch xe. Toàn bộ hệ quả xảy ra đúng một lần, tại lúc xác nhận, trong một transaction.
 */

import { BOOKING_STATUS, type BookingStatus } from './booking';
import { STATUS_COLOR, type StatusMeta } from './meta';
import { FUEL_TYPE, type FuelType } from './vehicle';

/** Hai chiều của một chuyến thuê. Mỗi đơn có tối đa một bản còn hiệu lực mỗi chiều. */
export const HANDOVER_TYPE = {
  PICKUP: 'pickup',
  RETURN: 'return',
} as const;

export type HandoverType = (typeof HANDOVER_TYPE)[keyof typeof HANDOVER_TYPE];
export const HANDOVER_TYPE_VALUES = Object.values(HANDOVER_TYPE) as HandoverType[];

export const HANDOVER_TYPE_LABEL: Readonly<Record<HandoverType, string>> = {
  [HANDOVER_TYPE.PICKUP]: 'Giao xe',
  [HANDOVER_TYPE.RETURN]: 'Nhận xe trả',
};

/**
 * Vòng đời một biên bản bàn giao.
 *
 * `ready` tách khỏi `draft` để nhân viên đánh dấu "đã nhập đủ, chờ người có quyền xác nhận" —
 * cùng dữ liệu nhưng khác ý định. `confirmed` là điểm KHÔNG QUAY LẠI: từ đó biên bản chỉ đọc,
 * sửa số KM phải đi đường điều chỉnh có lý do + quyền riêng.
 */
export const HANDOVER_STATUS = {
  DRAFT: 'draft',
  READY: 'ready',
  CONFIRMED: 'confirmed',
  CANCELED: 'canceled',
} as const;

export type HandoverStatus = (typeof HANDOVER_STATUS)[keyof typeof HANDOVER_STATUS];
export const HANDOVER_STATUS_VALUES = Object.values(HANDOVER_STATUS) as HandoverStatus[];

export const HANDOVER_STATUS_META: Readonly<Record<HandoverStatus, StatusMeta>> = {
  [HANDOVER_STATUS.DRAFT]: { label: 'Bản nháp', color: STATUS_COLOR.NEUTRAL },
  [HANDOVER_STATUS.READY]: { label: 'Chờ xác nhận', color: STATUS_COLOR.WAITING },
  [HANDOVER_STATUS.CONFIRMED]: { label: 'Đã xác nhận', color: STATUS_COLOR.SUCCESS },
  [HANDOVER_STATUS.CANCELED]: { label: 'Đã hủy', color: STATUS_COLOR.NEUTRAL },
};

/** Trạng thái còn SỬA được. Ngoài hai giá trị này biên bản là chỉ đọc. */
export const HANDOVER_STATUS_EDITABLE: readonly HandoverStatus[] = [
  HANDOVER_STATUS.DRAFT,
  HANDOVER_STATUS.READY,
];

export function isHandoverEditable(status: HandoverStatus): boolean {
  return HANDOVER_STATUS_EDITABLE.includes(status);
}

/**
 * Trạng thái đơn thuê cho phép mở từng chiều bàn giao.
 *
 * Giao xe khi đơn đã xác nhận (chuyển sang `active`), nhận trả khi đơn đang thuê (chuyển sang
 * `completed`) — khớp `BOOKING_STATUS_TRANSITIONS`. Đơn đã hủy/không đến/hoàn thành thì không
 * mở bàn giao mới được nữa; backend là nơi chốt, đây chỉ để hai phía nói cùng một luật.
 */
export const HANDOVER_ELIGIBLE_BOOKING_STATUS: Readonly<
  Record<HandoverType, readonly BookingStatus[]>
> = {
  [HANDOVER_TYPE.PICKUP]: [BOOKING_STATUS.RESERVED, BOOKING_STATUS.CONFIRMED],
  [HANDOVER_TYPE.RETURN]: [BOOKING_STATUS.ACTIVE],
};

/** Trạng thái đơn mà việc xác nhận bàn giao sẽ chuyển tới. `null` = giữ nguyên trạng thái. */
export const HANDOVER_CONFIRM_BOOKING_TARGET: Readonly<Record<HandoverType, BookingStatus | null>> =
  {
    [HANDOVER_TYPE.PICKUP]: BOOKING_STATUS.ACTIVE,
    [HANDOVER_TYPE.RETURN]: BOOKING_STATUS.COMPLETED,
  };

export function isHandoverEligible(type: HandoverType, bookingStatus: BookingStatus): boolean {
  return HANDOVER_ELIGIBLE_BOOKING_STATUS[type].includes(bookingStatus);
}

// ── Nhiên liệu / pin ─────────────────────────────────────────────────────────

/**
 * Loại năng lượng cần ghi khi bàn giao — SUY từ `fuelType` của xe, không lưu riêng và không
 * hỏi người dùng: xe điện hỏi mức xăng là dữ liệu rác.
 */
export const HANDOVER_ENERGY_KIND = {
  FUEL: 'fuel',
  BATTERY: 'battery',
} as const;

export type HandoverEnergyKind = (typeof HANDOVER_ENERGY_KIND)[keyof typeof HANDOVER_ENERGY_KIND];

export function handoverEnergyKind(fuelType: string | null | undefined): HandoverEnergyKind {
  return fuelType === FUEL_TYPE.ELECTRIC ? HANDOVER_ENERGY_KIND.BATTERY : HANDOVER_ENERGY_KIND.FUEL;
}

/** Xe hybrid vẫn đổ xăng — chỉ thuần điện mới chuyển sang ghi % pin. */
export const HANDOVER_BATTERY_FUEL_TYPES: readonly FuelType[] = [FUEL_TYPE.ELECTRIC];

/**
 * Mức nhiên liệu theo nấc kim đồng hồ. Không nhận số lít: người bàn giao đọc vạch, không
 * đo bình — nấc rời rạc là dữ liệu trung thực, con số lít là con số bịa.
 */
export const FUEL_LEVEL = {
  FULL: 'full',
  THREE_QUARTER: 'three_quarter',
  HALF: 'half',
  QUARTER: 'quarter',
  EMPTY: 'empty',
} as const;

export type FuelLevel = (typeof FUEL_LEVEL)[keyof typeof FUEL_LEVEL];
export const FUEL_LEVEL_VALUES = Object.values(FUEL_LEVEL) as FuelLevel[];

export const FUEL_LEVEL_LABEL: Readonly<Record<FuelLevel, string>> = {
  [FUEL_LEVEL.FULL]: 'Đầy (1/1)',
  [FUEL_LEVEL.THREE_QUARTER]: '3/4 bình',
  [FUEL_LEVEL.HALF]: '1/2 bình',
  [FUEL_LEVEL.QUARTER]: '1/4 bình',
  [FUEL_LEVEL.EMPTY]: 'Cạn',
};

/** Phần bình còn lại, để so sánh hao hụt giữa lúc giao và lúc nhận. */
export const FUEL_LEVEL_FRACTION: Readonly<Record<FuelLevel, number>> = {
  [FUEL_LEVEL.FULL]: 1,
  [FUEL_LEVEL.THREE_QUARTER]: 0.75,
  [FUEL_LEVEL.HALF]: 0.5,
  [FUEL_LEVEL.QUARTER]: 0.25,
  [FUEL_LEVEL.EMPTY]: 0,
};

/**
 * Hao hụt nhiên liệu so với lúc giao, tính bằng SỐ NẤC (1 nấc = 1/4 bình).
 * `null` khi thiếu một trong hai đầu — không suy diễn thay người dùng.
 */
export function fuelLevelDropQuarters(
  pickupLevel: FuelLevel | null | undefined,
  returnLevel: FuelLevel | null | undefined,
): number | null {
  if (!pickupLevel || !returnLevel) return null;
  const drop = FUEL_LEVEL_FRACTION[pickupLevel] - FUEL_LEVEL_FRACTION[returnLevel];
  return Math.round(drop * 4);
}

// ── Ảnh hiện trạng ───────────────────────────────────────────────────────────

/**
 * Các góc chụp cố định. Slot rời rạc (không phải danh sách file tự do) vì tranh chấp hiện
 * trạng chỉ giải quyết được khi hai bên nhìn CÙNG một góc trước/sau chuyến.
 */
export const HANDOVER_PHOTO_SLOT = {
  FRONT: 'front',
  REAR: 'rear',
  LEFT: 'left',
  RIGHT: 'right',
  ODOMETER: 'odometer',
} as const;

export type HandoverPhotoSlot = (typeof HANDOVER_PHOTO_SLOT)[keyof typeof HANDOVER_PHOTO_SLOT];
export const HANDOVER_PHOTO_SLOT_VALUES = Object.values(HANDOVER_PHOTO_SLOT) as HandoverPhotoSlot[];

export const HANDOVER_PHOTO_SLOT_LABEL: Readonly<Record<HandoverPhotoSlot, string>> = {
  [HANDOVER_PHOTO_SLOT.FRONT]: 'Trước',
  [HANDOVER_PHOTO_SLOT.REAR]: 'Sau',
  [HANDOVER_PHOTO_SLOT.LEFT]: 'Trái',
  [HANDOVER_PHOTO_SLOT.RIGHT]: 'Phải',
  [HANDOVER_PHOTO_SLOT.ODOMETER]: 'Đồng hồ Odo',
};

/** Bốn góc ngoại thất, theo đúng thứ tự lưới trên UI. */
export const HANDOVER_EXTERIOR_SLOTS: readonly HandoverPhotoSlot[] = [
  HANDOVER_PHOTO_SLOT.FRONT,
  HANDOVER_PHOTO_SLOT.REAR,
  HANDOVER_PHOTO_SLOT.LEFT,
  HANDOVER_PHOTO_SLOT.RIGHT,
];

/**
 * Tối thiểu để xác nhận: hai góc đối diện. Đòi đủ bốn góc sẽ khiến nhân viên bỏ qua quy
 * trình lúc cao điểm; đòi hai góc là mức vừa đủ để đối chiếu mà vẫn làm được trong 30 giây.
 */
export const HANDOVER_REQUIRED_SLOTS: readonly HandoverPhotoSlot[] = [
  HANDOVER_PHOTO_SLOT.FRONT,
  HANDOVER_PHOTO_SLOT.REAR,
];

/** Trần ảnh mỗi biên bản — 5 slot cố định, phần dư là ảnh hư hỏng chụp thêm. */
export const HANDOVER_MAX_PHOTOS = 12;

// ── Đối soát KM ──────────────────────────────────────────────────────────────

/**
 * Khóa cấu hình ngưỡng "KM nghi ngờ" ở `tenant_profiles.settings_json`.
 *
 * CỐ Ý KHÔNG có giá trị mặc định: quãng đường hợp lý mỗi ngày khác nhau hoàn toàn giữa xe
 * máy cho thuê nội thành và xe 7 chỗ chạy tỉnh. Một con số nền tảng tự đặt sẽ hoặc kêu oan
 * liên tục, hoặc không bao giờ kêu — cả hai đều tệ hơn là không kiểm. Gian hàng nào muốn
 * cảnh báo thì phải khai ngưỡng của mình; chưa khai thì API trả `null` và UI nói rõ là
 * "chưa cấu hình", KHÔNG bịa ngưỡng ngầm.
 */
export const HANDOVER_SUSPICIOUS_KM_PER_DAY_SETTING = 'handoverSuspiciousKmPerDay';

export interface HandoverOdometerSuspicionInput {
  /** Quãng đường phát sinh trong chuyến (KM trả − KM giao). */
  deltaKm: number;
  /** Số ngày thuê (làm tròn lên, tối thiểu 1). */
  rentalDays: number;
  /** Ngưỡng KM/ngày dưới mức đó thì coi là bất thường. `null` = gian hàng chưa cấu hình. */
  thresholdKmPerDay: number | null;
}

export interface HandoverOdometerSuspicion {
  suspicious: boolean;
  /** Quãng đường tối thiểu kỳ vọng theo ngưỡng đang hiệu lực. */
  expectedMinKm: number;
  deltaKm: number;
  rentalDays: number;
  thresholdKmPerDay: number;
}

/**
 * Chuyến dài ngày mà đồng hồ gần như không nhích là dấu hiệu công tơ mét bị ngắt hoặc số
 * đọc sai. Đây là CẢNH BÁO cần người xác nhận, không phải lỗi chặn cứng.
 *
 * `null` khi gian hàng chưa cấu hình ngưỡng — không kết luận gì cả.
 */
export function handoverOdometerSuspicion(
  input: HandoverOdometerSuspicionInput,
): HandoverOdometerSuspicion | null {
  const { thresholdKmPerDay } = input;
  if (typeof thresholdKmPerDay !== 'number' || thresholdKmPerDay <= 0) return null;
  const rentalDays = Math.max(1, Math.ceil(input.rentalDays));
  const expectedMinKm = thresholdKmPerDay * rentalDays;
  return {
    suspicious: input.deltaKm < expectedMinKm,
    expectedMinKm,
    deltaKm: input.deltaKm,
    rentalDays,
    thresholdKmPerDay,
  };
}
