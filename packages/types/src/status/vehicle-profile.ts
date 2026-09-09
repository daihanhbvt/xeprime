/**
 * HỒ SƠ KỸ THUẬT của một chiếc xe theo LOẠI PHƯƠNG TIỆN — nguồn luật duy nhất cho web, app
 * native và backend (09/09/2026).
 *
 * Ô tô và xe máy KHÔNG dùng chung bộ trường: một chiếc SH không có "số chỗ ngồi" theo nghĩa ô
 * tô, không có kiểu dáng Sedan/SUV, và hộp số của nó là tay ga/côn tay chứ không phải AT/DCT.
 * Trước bản này form hỏi chung một bộ, nên dữ liệu xe máy mang theo những trường vô nghĩa và bộ
 * lọc ngoài chợ hiển thị "2 chỗ" cho một chiếc xe máy.
 *
 * Luật "xe máy không nhận dịch vụ có tài xế" KHÔNG nằm ở đây — nó đã có ở `vehicle.ts`
 * (`VEHICLE_SERVICE_TYPES` / `vehicleServiceTypesFor`); file này chỉ bổ sung phần hồ sơ kỹ thuật.
 *
 * Vì sao gom vào một file: cùng một câu hỏi ("xe này có ô đó không, có bắt buộc không?") được
 * hỏi ở bốn nơi — form ẩn/hiện ô, Yup chặn lưu, DTO chuẩn hoá lúc ghi, và checklist quyết định
 * xe có lên chợ được không. Bốn bản sao của câu trả lời là bốn cơ hội để giao diện nói "đủ rồi"
 * trong khi server nói "còn thiếu".
 */
import { FUEL_TYPE, VEHICLE_TYPE, type VehicleType } from './vehicle';

// ── Phân khúc xe máy ─────────────────────────────────────────────────────────

/**
 * Phân khúc XE MÁY — thay cho `bodyType` (Sedan/SUV/MPV… chỉ có nghĩa với ô tô).
 *
 * Đây là chiều người thuê thật sự dùng để chọn: người đi phố tìm "tay ga", người đi đường dài
 * tìm "côn tay/adventure". Gộp chúng vào `bodyType` của ô tô là làm hỏng cả hai bộ lọc.
 */
export const MOTORBIKE_CATEGORY = {
  /** Xe tay ga — vô cấp, không phải chuyển số. */
  SCOOTER: 'scooter',
  /** Xe số (underbone) — Wave, Sirius, Blade… */
  UNDERBONE: 'underbone',
  /** Naked bike — côn tay, không dàn áo thể thao. */
  NAKED: 'naked',
  /** Sport — dàn áo thể thao, tư thế ngồi gập. */
  SPORT: 'sport',
  CRUISER: 'cruiser',
  ADVENTURE: 'adventure',
  TOURING: 'touring',
  OFFROAD: 'offroad',
  OTHER: 'other',
} as const;

export type MotorbikeCategory = (typeof MOTORBIKE_CATEGORY)[keyof typeof MOTORBIKE_CATEGORY];
export const MOTORBIKE_CATEGORY_VALUES = Object.values(MOTORBIKE_CATEGORY) as MotorbikeCategory[];

/** Nhãn dự phòng — nhãn hiển thị lấy từ namespace `Domain` (ADR 0012). */
export const MOTORBIKE_CATEGORY_LABEL: Readonly<Record<MotorbikeCategory, string>> = {
  [MOTORBIKE_CATEGORY.SCOOTER]: 'Xe tay ga',
  [MOTORBIKE_CATEGORY.UNDERBONE]: 'Xe số',
  [MOTORBIKE_CATEGORY.NAKED]: 'Naked bike',
  [MOTORBIKE_CATEGORY.SPORT]: 'Sport bike',
  [MOTORBIKE_CATEGORY.CRUISER]: 'Cruiser',
  [MOTORBIKE_CATEGORY.ADVENTURE]: 'Adventure',
  [MOTORBIKE_CATEGORY.TOURING]: 'Touring',
  [MOTORBIKE_CATEGORY.OFFROAD]: 'Off-road',
  [MOTORBIKE_CATEGORY.OTHER]: 'Khác',
};

export function motorbikeCategoryLabel(key: string): string {
  return (MOTORBIKE_CATEGORY_LABEL as Record<string, string>)[key] ?? key;
}

export function isMotorbikeCategory(value: unknown): value is MotorbikeCategory {
  return typeof value === 'string' && (MOTORBIKE_CATEGORY_VALUES as string[]).includes(value);
}

// ── Truyền động ──────────────────────────────────────────────────────────────

/**
 * Kiểu truyền động — MỘT bộ mã, mỗi loại xe chỉ dùng phần của mình.
 *
 * Năm mã `automatic` / `manual` / `cvt` / `dct` / `other` là bộ CŨ, giữ nguyên giá trị để dữ liệu
 * và client cũ không vỡ. Phần thêm mới nói đúng thứ đang chạy ngoài đường: E-CVT của hybrid, AMT,
 * truyền động một cấp của xe điện, và ba kiểu của xe máy.
 *
 * Xe điện KHÔNG có "hộp số tự động" — nó truyền động một cấp. Gọi sai là mô tả sai chiếc xe cho
 * người sắp thuê nó.
 */
export const TRANSMISSION_TYPE_EXT = {
  /** Ô tô: số tự động có biến mô (AT). */
  AUTOMATIC: 'automatic',
  /** Ô tô: số sàn (MT). */
  MANUAL: 'manual',
  CVT: 'cvt',
  /** Hybrid: hộp số biến thiên vô cấp điện tử. */
  E_CVT: 'e_cvt',
  /** Ly hợp kép. */
  DCT: 'dct',
  /** Số sàn tự động hoá. */
  AMT: 'amt',
  /** Xe điện: truyền động một cấp, không có cấp số. */
  DIRECT_DRIVE: 'direct_drive',
  /** Xe máy tay ga. */
  AUTOMATIC_CVT: 'automatic_cvt',
  /** Xe máy số: ly hợp tự động, vẫn đạp số. */
  SEMI_AUTOMATIC: 'semi_automatic',
  /** Xe máy côn tay. */
  MANUAL_CLUTCH: 'manual_clutch',
  OTHER: 'other',
} as const;

export type TransmissionTypeExt =
  (typeof TRANSMISSION_TYPE_EXT)[keyof typeof TRANSMISSION_TYPE_EXT];
export const TRANSMISSION_TYPE_EXT_VALUES = Object.values(
  TRANSMISSION_TYPE_EXT,
) as TransmissionTypeExt[];

/** Nhãn dự phòng — nhãn hiển thị lấy từ namespace `Domain`. */
export const TRANSMISSION_TYPE_EXT_LABEL: Readonly<Record<TransmissionTypeExt, string>> = {
  [TRANSMISSION_TYPE_EXT.AUTOMATIC]: 'Số tự động (AT)',
  [TRANSMISSION_TYPE_EXT.MANUAL]: 'Số sàn (MT)',
  [TRANSMISSION_TYPE_EXT.CVT]: 'CVT',
  [TRANSMISSION_TYPE_EXT.E_CVT]: 'E-CVT (hybrid)',
  [TRANSMISSION_TYPE_EXT.DCT]: 'Ly hợp kép (DCT)',
  [TRANSMISSION_TYPE_EXT.AMT]: 'Số sàn tự động (AMT)',
  [TRANSMISSION_TYPE_EXT.DIRECT_DRIVE]: 'Truyền động một cấp (xe điện)',
  [TRANSMISSION_TYPE_EXT.AUTOMATIC_CVT]: 'Tay ga (CVT)',
  [TRANSMISSION_TYPE_EXT.SEMI_AUTOMATIC]: 'Xe số (bán tự động)',
  [TRANSMISSION_TYPE_EXT.MANUAL_CLUTCH]: 'Côn tay',
  [TRANSMISSION_TYPE_EXT.OTHER]: 'Khác',
};

export function transmissionTypeExtLabel(key: string): string {
  return (TRANSMISSION_TYPE_EXT_LABEL as Record<string, string>)[key] ?? key;
}

const CAR_COMBUSTION_TRANSMISSIONS: readonly TransmissionTypeExt[] = [
  TRANSMISSION_TYPE_EXT.MANUAL,
  TRANSMISSION_TYPE_EXT.AUTOMATIC,
  TRANSMISSION_TYPE_EXT.CVT,
  TRANSMISSION_TYPE_EXT.DCT,
  TRANSMISSION_TYPE_EXT.AMT,
  TRANSMISSION_TYPE_EXT.OTHER,
];

const MOTORBIKE_COMBUSTION_TRANSMISSIONS: readonly TransmissionTypeExt[] = [
  TRANSMISSION_TYPE_EXT.AUTOMATIC_CVT,
  TRANSMISSION_TYPE_EXT.SEMI_AUTOMATIC,
  TRANSMISSION_TYPE_EXT.MANUAL_CLUTCH,
  TRANSMISSION_TYPE_EXT.OTHER,
];

const ELECTRIC_TRANSMISSIONS: readonly TransmissionTypeExt[] = [
  TRANSMISSION_TYPE_EXT.DIRECT_DRIVE,
  TRANSMISSION_TYPE_EXT.OTHER,
];

/**
 * Lựa chọn truyền động HỢP LỆ của một chiếc xe cụ thể.
 *
 * Chưa chọn nguồn năng lượng thì trả bộ đầy đủ của loại xe đó: danh sách rộng rồi thu hẹp khi
 * biết thêm là cách ít gây bực nhất — ẩn sạch cũng sai, mà hỏi sai cũng sai.
 */
export function vehicleTransmissionTypesFor(
  vehicleType: string,
  fuelType: string | null | undefined,
): readonly TransmissionTypeExt[] {
  const isMotorbike = vehicleType === VEHICLE_TYPE.MOTORBIKE;
  if (fuelType === FUEL_TYPE.ELECTRIC) return ELECTRIC_TRANSMISSIONS;
  if (isMotorbike) return MOTORBIKE_COMBUSTION_TRANSMISSIONS;
  if (fuelType === FUEL_TYPE.HYBRID) {
    return [
      TRANSMISSION_TYPE_EXT.E_CVT,
      TRANSMISSION_TYPE_EXT.CVT,
      TRANSMISSION_TYPE_EXT.AUTOMATIC,
      TRANSMISSION_TYPE_EXT.DCT,
      TRANSMISSION_TYPE_EXT.OTHER,
    ];
  }
  return CAR_COMBUSTION_TRANSMISSIONS;
}

export function isTransmissionAllowedFor(
  vehicleType: string,
  fuelType: string | null | undefined,
  transmission: string | null | undefined,
): boolean {
  if (transmission == null || transmission === '') return true;
  return (vehicleTransmissionTypesFor(vehicleType, fuelType) as string[]).includes(transmission);
}

// ── Tiện nghi theo loại xe ───────────────────────────────────────────────────

/**
 * Tiện nghi nào có nghĩa với loại xe nào.
 *
 * Bảng này là nguồn cho cả form (ẩn) lẫn backend (từ chối) — ẩn ở form mà không chặn ở server
 * thì một client cũ vẫn gắn được "lốp dự phòng" cho chiếc Wave.
 *
 * Khoá KHÔNG có trong bảng = dùng cho mọi loại xe (dữ liệu admin thêm sau, chưa gắn nhãn).
 */
export const VEHICLE_FEATURE_VEHICLE_TYPES: Readonly<Record<string, readonly VehicleType[]>> = {
  // Chỉ ô tô
  camera_360: [VEHICLE_TYPE.CAR],
  backup_camera: [VEHICLE_TYPE.CAR],
  reverse_sensor: [VEHICLE_TYPE.CAR],
  sunroof: [VEHICLE_TYPE.CAR],
  spare_tire: [VEHICLE_TYPE.CAR],
  airbag: [VEHICLE_TYPE.CAR],
  child_seat: [VEHICLE_TYPE.CAR],
  screen: [VEHICLE_TYPE.CAR],
  etc: [VEHICLE_TYPE.CAR],
  // Dùng chung
  bluetooth: [VEHICLE_TYPE.CAR, VEHICLE_TYPE.MOTORBIKE],
  gps: [VEHICLE_TYPE.CAR, VEHICLE_TYPE.MOTORBIKE],
  usb: [VEHICLE_TYPE.CAR, VEHICLE_TYPE.MOTORBIKE],
  dash_camera: [VEHICLE_TYPE.CAR, VEHICLE_TYPE.MOTORBIKE],
  map: [VEHICLE_TYPE.CAR, VEHICLE_TYPE.MOTORBIKE],
  // Chỉ xe máy
  abs: [VEHICLE_TYPE.MOTORBIKE],
  traction_control: [VEHICLE_TYPE.MOTORBIKE],
  smart_key: [VEHICLE_TYPE.MOTORBIKE],
  phone_holder: [VEHICLE_TYPE.MOTORBIKE],
  top_box: [VEHICLE_TYPE.MOTORBIKE],
  helmet_included: [VEHICLE_TYPE.MOTORBIKE],
  raincoat_included: [VEHICLE_TYPE.MOTORBIKE],
  anti_theft: [VEHICLE_TYPE.MOTORBIKE],
};

export function vehicleFeatureAppliesTo(featureKey: string, vehicleType: string): boolean {
  const allowed = VEHICLE_FEATURE_VEHICLE_TYPES[featureKey];
  // Khoá lạ/mới chưa gắn nhãn: không chặn — chỉ những khoá đã khai mới bị lọc.
  if (!allowed) return true;
  return (allowed as string[]).includes(vehicleType);
}

// ── Ma trận trường của hồ sơ xe ──────────────────────────────────────────────

/**
 *  - `required`: thiếu thì KHÔNG lên chợ được (vẫn lưu nháp được).
 *  - `optional`: hỏi, nhưng bỏ trống vẫn hợp lệ.
 *  - `hidden`: không có nghĩa với xe này — form ẩn, và backend XOÁ giá trị cũ nếu còn sót.
 */
export type VehicleFieldApplicability = 'required' | 'optional' | 'hidden';

export interface VehicleFieldPolicy {
  /** Số chỗ ngồi — chỉ ô tô. */
  seatCount: VehicleFieldApplicability;
  /** Kiểu dáng thân xe (Sedan/SUV/MPV…) — chỉ ô tô. */
  bodyType: VehicleFieldApplicability;
  /** Phân khúc xe máy (tay ga/xe số/côn tay…) — chỉ xe máy. */
  motorbikeCategory: VehicleFieldApplicability;
  transmission: VehicleFieldApplicability;
  /** Lít/100km. */
  fuelConsumption: VehicleFieldApplicability;
  /** Dung tích động cơ đốt trong (cc). */
  engineDisplacementCc: VehicleFieldApplicability;
  /** Km mỗi lần sạc đầy. */
  electricRangeKm: VehicleFieldApplicability;
  /** Dung lượng pin (kWh). */
  batteryCapacityKwh: VehicleFieldApplicability;
  /** kWh/100km. */
  electricConsumption: VehicleFieldApplicability;
}

const HIDDEN_POLICY: VehicleFieldPolicy = {
  seatCount: 'hidden',
  bodyType: 'hidden',
  motorbikeCategory: 'hidden',
  transmission: 'hidden',
  fuelConsumption: 'hidden',
  engineDisplacementCc: 'hidden',
  electricRangeKm: 'hidden',
  batteryCapacityKwh: 'hidden',
  electricConsumption: 'hidden',
};

/**
 * Ma trận DUY NHẤT quyết định form hiện ô nào, Yup đòi ô nào, DTO xoá ô nào và checklist lên
 * chợ kiểm ô nào.
 *
 * Ô tô — luôn có số chỗ (bắt buộc) và kiểu dáng thân xe (tuỳ chọn):
 *  - xăng/dầu: lít/100km bắt buộc, hộp số bắt buộc, dung tích động cơ tuỳ chọn;
 *  - điện: quãng đường mỗi lần sạc bắt buộc; pin và kWh/100km tuỳ chọn; không hỏi lít/100km lẫn cc;
 *  - hybrid: khai phần xăng như trên; phần điện tuỳ chọn — enum chưa tách HEV với PHEV nên bắt
 *    mọi xe hybrid khai quãng đường chạy điện là ép người dùng bịa một con số nửa xe không có.
 *
 * Xe máy — không có số chỗ và kiểu dáng của ô tô, có phân khúc riêng (bắt buộc, vì đây là chiều
 * khách lọc ngoài chợ):
 *  - xăng/hybrid: dung tích xi-lanh BẮT BUỘC (50cc hay 150cc là hai chiếc xe khác hẳn nhau, và
 *    50cc còn khác cả về giấy phép lái xe), lít/100km tuỳ chọn, hộp số tuỳ chọn;
 *  - điện: quãng đường mỗi lần sạc bắt buộc, không có cc và không hỏi lít/100km.
 */
export function vehicleFieldPolicy(
  vehicleType: string,
  fuelType: string | null | undefined,
): VehicleFieldPolicy {
  const isMotorbike = vehicleType === VEHICLE_TYPE.MOTORBIKE;
  const base: VehicleFieldPolicy = isMotorbike
    ? { ...HIDDEN_POLICY, motorbikeCategory: 'required' }
    : { ...HIDDEN_POLICY, seatCount: 'required', bodyType: 'optional' };

  switch (fuelType) {
    case FUEL_TYPE.GASOLINE:
    case FUEL_TYPE.DIESEL:
      return {
        ...base,
        transmission: isMotorbike ? 'optional' : 'required',
        fuelConsumption: isMotorbike ? 'optional' : 'required',
        engineDisplacementCc: isMotorbike ? 'required' : 'optional',
      };
    case FUEL_TYPE.ELECTRIC:
      return {
        ...base,
        transmission: 'optional',
        electricRangeKm: 'required',
        batteryCapacityKwh: 'optional',
        electricConsumption: 'optional',
      };
    case FUEL_TYPE.HYBRID:
      return {
        ...base,
        transmission: isMotorbike ? 'optional' : 'required',
        fuelConsumption: isMotorbike ? 'optional' : 'required',
        engineDisplacementCc: isMotorbike ? 'required' : 'optional',
        electricRangeKm: 'optional',
        batteryCapacityKwh: 'optional',
        electricConsumption: 'optional',
      };
    default:
      // Chưa chọn nguồn năng lượng: chỉ hiện phần không phụ thuộc nó.
      return base;
  }
}

/**
 * Lát cắt "thông số năng lượng" của ma trận trên.
 *
 * Giữ nguyên tên và shape cũ để `VehicleEnergyFields`, publication checklist (web + native) và
 * `VehiclesService` không phải đổi — nhưng nó KHÔNG còn là một ma trận thứ hai: nó đọc thẳng
 * `vehicleFieldPolicy`.
 */
export interface VehicleEnergySpecPolicy {
  fuelConsumption: VehicleFieldApplicability;
  electricRangeKm: VehicleFieldApplicability;
  batteryCapacityKwh: VehicleFieldApplicability;
  electricConsumption: VehicleFieldApplicability;
  engineDisplacementCc: VehicleFieldApplicability;
  transmission: VehicleFieldApplicability;
}

export function vehicleEnergySpecPolicy(
  vehicleType: string,
  fuelType: string | null | undefined,
): VehicleEnergySpecPolicy {
  const policy = vehicleFieldPolicy(vehicleType, fuelType);
  return {
    fuelConsumption: policy.fuelConsumption,
    electricRangeKm: policy.electricRangeKm,
    batteryCapacityKwh: policy.batteryCapacityKwh,
    electricConsumption: policy.electricConsumption,
    engineDisplacementCc: policy.engineDisplacementCc,
    transmission: policy.transmission,
  };
}

/** Ô đang bị ẩn — backend dùng để XOÁ giá trị không còn nghĩa, không tin form đã ẩn. */
export function hiddenVehicleFields(
  vehicleType: string,
  fuelType: string | null | undefined,
): ReadonlyArray<keyof VehicleFieldPolicy> {
  const policy = vehicleFieldPolicy(vehicleType, fuelType);
  return (Object.keys(policy) as Array<keyof VehicleFieldPolicy>).filter(
    (field) => policy[field] === 'hidden',
  );
}
