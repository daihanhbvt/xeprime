import { STATUS_COLOR, type StatusMeta } from './meta';

/**
 * Trạng thái duyệt public của xe (ADR 0005).
 *
 * Nguồn: `xeprime_database_design.md` §9.1. `xeprime_overall_user_flow_next_node.md` §9 ghi
 * `published` / `pending_review` — bản đó BỊ GHI ĐÈ.
 *
 * CLAUDE.md mục 5: client KHÔNG được tự set `approved_public`. Chỉ `ApprovalService` đổi
 * được sang giá trị này, sau khi platform reviewer duyệt.
 */
export const VEHICLE_PUBLIC_STATUS = {
  DRAFT: 'draft',
  PENDING_PUBLIC_REVIEW: 'pending_public_review',
  APPROVED_PUBLIC: 'approved_public',
  NEEDS_REVISION: 'needs_revision',
  REJECTED: 'rejected',
  HIDDEN: 'hidden',
  ARCHIVED: 'archived',
} as const;

export type VehiclePublicStatus =
  (typeof VEHICLE_PUBLIC_STATUS)[keyof typeof VEHICLE_PUBLIC_STATUS];

export const VEHICLE_PUBLIC_STATUS_VALUES = Object.values(
  VEHICLE_PUBLIC_STATUS,
) as VehiclePublicStatus[];

/**
 * Các trạng thái mà từ đó chủ shop được (lại) gửi xe đi duyệt công khai. Không gồm
 * `pending_public_review` (đang chờ) và `approved_public` (đã lên chợ) — chặn gửi trùng.
 */
export const VEHICLE_PUBLIC_STATUS_SUBMITTABLE: readonly VehiclePublicStatus[] = [
  VEHICLE_PUBLIC_STATUS.DRAFT,
  VEHICLE_PUBLIC_STATUS.NEEDS_REVISION,
  VEHICLE_PUBLIC_STATUS.REJECTED,
  VEHICLE_PUBLIC_STATUS.HIDDEN,
];

/**
 * Trường "nhạy cảm": sửa khi xe đang `approved_public` sẽ tự hạ xe về `pending_public_review`
 * và tạo lại phiếu duyệt (ADR 0008 — không để thông tin đã đổi hiển thị mà chưa qua kiểm duyệt).
 */
/**
 * Danh mục tiện ích xe (feature) — key lưu DB, label hiển thị. Chốt ở đây để FE (multi-select)
 * và BE (validate `@IsIn`) dùng chung, không hard-code string rời (ADR 0005).
 */
export const VEHICLE_FEATURE_LABEL = {
  bluetooth: 'Bluetooth',
  gps: 'Định vị GPS',
  backup_camera: 'Camera lùi',
  camera_360: 'Camera 360',
  dash_camera: 'Camera hành trình',
  reverse_sensor: 'Cảm biến lùi',
  sunroof: 'Cửa sổ trời',
  etc: 'ETC thu phí',
  spare_tire: 'Lốp dự phòng',
  airbag: 'Túi khí an toàn',
  usb: 'Cổng USB',
  screen: 'Màn hình giải trí',
  map: 'Bản đồ',
  child_seat: 'Ghế trẻ em',
} as const;

export type VehicleFeatureKey = keyof typeof VEHICLE_FEATURE_LABEL;
export const VEHICLE_FEATURE_KEYS = Object.keys(VEHICLE_FEATURE_LABEL) as VehicleFeatureKey[];

export function vehicleFeatureLabel(key: string): string {
  return (VEHICLE_FEATURE_LABEL as Record<string, string>)[key] ?? key;
}

export const VEHICLE_PUBLIC_SENSITIVE_FIELDS = [
  'weekdayPrice',
  'weekendPrice',
  'hourlyPrice',
  'monthlyPrice',
  'withDriverDailyPrice',
  'withDriverInterCityPrice',
  'withDriverOneWayPrice',
  'discountPercent',
  'plateNumber',
  'vehicleType',
  'serviceTypes',
  'mainImageUrl',
] as const;
export type VehicleSensitiveField = (typeof VEHICLE_PUBLIC_SENSITIVE_FIELDS)[number];

export function isVehiclePublicStatus(value: unknown): value is VehiclePublicStatus {
  return typeof value === 'string' && (VEHICLE_PUBLIC_STATUS_VALUES as string[]).includes(value);
}

export const VEHICLE_PUBLIC_STATUS_META: Readonly<Record<VehiclePublicStatus, StatusMeta>> = {
  [VEHICLE_PUBLIC_STATUS.DRAFT]: { label: 'Nháp', color: STATUS_COLOR.NEUTRAL },
  [VEHICLE_PUBLIC_STATUS.PENDING_PUBLIC_REVIEW]: {
    label: 'Chờ duyệt public',
    color: STATUS_COLOR.WAITING,
  },
  [VEHICLE_PUBLIC_STATUS.APPROVED_PUBLIC]: {
    label: 'Đã duyệt public',
    color: STATUS_COLOR.SUCCESS,
  },
  [VEHICLE_PUBLIC_STATUS.NEEDS_REVISION]: {
    label: 'Cần bổ sung',
    color: STATUS_COLOR.WARNING,
  },
  [VEHICLE_PUBLIC_STATUS.REJECTED]: { label: 'Bị từ chối', color: STATUS_COLOR.DANGER },
  [VEHICLE_PUBLIC_STATUS.HIDDEN]: { label: 'Đã ẩn', color: STATUS_COLOR.NEUTRAL },
  [VEHICLE_PUBLIC_STATUS.ARCHIVED]: {
    label: 'Ngừng sử dụng',
    color: STATUS_COLOR.NEUTRAL,
  },
};

/**
 * Trạng thái vận hành của xe — độc lập với trạng thái duyệt public.
 *
 * Một xe có thể `approved_public` (hiện ngoài chợ) nhưng `renting` (đang có khách thuê).
 * Hai trục này không được gộp.
 */
export const VEHICLE_OPERATION_STATUS = {
  AVAILABLE: 'available',
  RENTING: 'renting',
  MAINTENANCE: 'maintenance',
  INACTIVE: 'inactive',
} as const;

export type VehicleOperationStatus =
  (typeof VEHICLE_OPERATION_STATUS)[keyof typeof VEHICLE_OPERATION_STATUS];

export const VEHICLE_OPERATION_STATUS_VALUES = Object.values(
  VEHICLE_OPERATION_STATUS,
) as VehicleOperationStatus[];

export const VEHICLE_OPERATION_STATUS_META: Readonly<Record<VehicleOperationStatus, StatusMeta>> = {
  [VEHICLE_OPERATION_STATUS.AVAILABLE]: { label: 'Sẵn sàng', color: STATUS_COLOR.SUCCESS },
  [VEHICLE_OPERATION_STATUS.RENTING]: { label: 'Đang thuê', color: STATUS_COLOR.PROCESSING },
  [VEHICLE_OPERATION_STATUS.MAINTENANCE]: { label: 'Bảo dưỡng', color: STATUS_COLOR.SPECIAL },
  [VEHICLE_OPERATION_STATUS.INACTIVE]: {
    label: 'Ngừng hoạt động',
    color: STATUS_COLOR.NEUTRAL,
  },
};

/** Loại xe. */
export const VEHICLE_TYPE = {
  CAR: 'car',
  MOTORBIKE: 'motorbike',
} as const;

export type VehicleType = (typeof VEHICLE_TYPE)[keyof typeof VEHICLE_TYPE];
export const VEHICLE_TYPE_VALUES = Object.values(VEHICLE_TYPE) as VehicleType[];

export const VEHICLE_TYPE_LABEL: Readonly<Record<VehicleType, string>> = {
  [VEHICLE_TYPE.CAR]: 'Ô tô',
  [VEHICLE_TYPE.MOTORBIKE]: 'Xe máy',
};

/** Hình thức nguồn xe — Wave 3 chỉ lưu lựa chọn, hồ sơ tài chính chi tiết được bổ sung ở Wave 4. */
export const VEHICLE_SOURCE_TYPE = {
  OWNED: 'owned',
  FINANCED: 'financed',
  RENTED: 'rented',
  PARTNERSHIP: 'partnership',
} as const;

export type VehicleSourceType = (typeof VEHICLE_SOURCE_TYPE)[keyof typeof VEHICLE_SOURCE_TYPE];
export const VEHICLE_SOURCE_TYPE_VALUES = Object.values(VEHICLE_SOURCE_TYPE) as VehicleSourceType[];
export const VEHICLE_SOURCE_TYPE_LABEL: Readonly<Record<VehicleSourceType, string>> = {
  [VEHICLE_SOURCE_TYPE.OWNED]: 'Sở hữu',
  [VEHICLE_SOURCE_TYPE.FINANCED]: 'Trả góp',
  [VEHICLE_SOURCE_TYPE.RENTED]: 'Thuê lại',
  [VEHICLE_SOURCE_TYPE.PARTNERSHIP]: 'Hợp tác',
};

/** Mô tả ngắn của từng hình thức — dải trạng thái đầu tab Nguồn xe & thẻ chọn (Wave 4). */
export const VEHICLE_SOURCE_TYPE_DESCRIPTION: Readonly<Record<VehicleSourceType, string>> = {
  [VEHICLE_SOURCE_TYPE.OWNED]: 'Xe thuộc sở hữu trực tiếp, không có nghĩa vụ tài chính định kỳ.',
  [VEHICLE_SOURCE_TYPE.FINANCED]:
    'Thông tin tài chính được đồng bộ với phân hệ kế toán và tính toán chi phí vận hành.',
  [VEHICLE_SOURCE_TYPE.RENTED]:
    'Thông tin tài chính được đồng bộ với phân hệ kế toán và tính toán chi phí vận hành.',
  [VEHICLE_SOURCE_TYPE.PARTNERSHIP]:
    'Thông tin phân chia doanh thu được đồng bộ trực tiếp với hệ thống đối soát tài chính.',
};

/**
 * Phương pháp tính lãi của khoản vay trả góp — chỉ là DỮ LIỆU GHI NHẬN (hiển thị/đối chiếu),
 * hệ thống KHÔNG tự dựng lịch trả nợ từ nó (Wave 4 không làm amortization).
 */
export const VEHICLE_FINANCE_INTEREST_METHOD = {
  REDUCING_BALANCE: 'reducing_balance',
  FLAT: 'flat',
} as const;

export type VehicleFinanceInterestMethod =
  (typeof VEHICLE_FINANCE_INTEREST_METHOD)[keyof typeof VEHICLE_FINANCE_INTEREST_METHOD];
export const VEHICLE_FINANCE_INTEREST_METHOD_VALUES = Object.values(
  VEHICLE_FINANCE_INTEREST_METHOD,
) as VehicleFinanceInterestMethod[];
export const VEHICLE_FINANCE_INTEREST_METHOD_LABEL: Readonly<
  Record<VehicleFinanceInterestMethod, string>
> = {
  [VEHICLE_FINANCE_INTEREST_METHOD.REDUCING_BALANCE]: 'Dư nợ giảm dần',
  [VEHICLE_FINANCE_INTEREST_METHOD.FLAT]: 'Trả đều (Niên kim)',
};

/**
 * Hồ sơ nguồn đã ĐỦ cho theo dõi nghĩa vụ tài chính chưa (Wave 4.1 — trạng thái tất định,
 * KHÔNG chặn việc lưu hồ sơ dở dang; phase nghĩa vụ tài chính sau này tiêu thụ cờ này):
 *  - financed: cần bankName + monthlyPrincipal + monthlyInterest + paymentDay
 *  - rented:   cần ownerName + monthlyRent + paymentDay
 *  - partnership: cần ownerName + commissionPercent
 *  - owned: luôn đủ (không có nghĩa vụ định kỳ)
 */
export function isVehicleSourceObligationReady(detail: {
  sourceType: string;
  bankName?: string | null;
  monthlyPrincipal?: string | null;
  monthlyInterest?: string | null;
  monthlyRent?: string | null;
  ownerName?: string | null;
  commissionPercent?: string | null;
  paymentDay?: number | null;
}): boolean {
  const has = (value: string | number | null | undefined) =>
    value !== null && value !== undefined && value !== '';
  switch (detail.sourceType) {
    case VEHICLE_SOURCE_TYPE.FINANCED:
      return (
        has(detail.bankName) &&
        has(detail.monthlyPrincipal) &&
        has(detail.monthlyInterest) &&
        has(detail.paymentDay)
      );
    case VEHICLE_SOURCE_TYPE.RENTED:
      return has(detail.ownerName) && has(detail.monthlyRent) && has(detail.paymentDay);
    case VEHICLE_SOURCE_TYPE.PARTNERSHIP:
      return has(detail.ownerName) && has(detail.commissionPercent);
    default:
      return true;
  }
}

/**
 * Ngày đến hạn thực tế của một tháng (quy tắc chốt Wave 4.1, scheduler làm ở phase sau):
 * tháng không có `paymentDay` (29–31) thì đến hạn vào NGÀY CUỐI tháng đó.
 * `month` theo lịch 1–12.
 */
export function paymentDueDayForMonth(paymentDay: number, year: number, month: number): number {
  // Date UTC với day=0 của tháng KẾ TIẾP = ngày cuối tháng hiện tại — không dính múi giờ.
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return Math.min(paymentDay, lastDay);
}

/** Loại hộp số dùng cho nhóm thông số kỹ thuật mở rộng. */
export const TRANSMISSION_TYPE = {
  AUTOMATIC: 'automatic',
  MANUAL: 'manual',
  CVT: 'cvt',
  DCT: 'dct',
  OTHER: 'other',
} as const;
export type TransmissionType = (typeof TRANSMISSION_TYPE)[keyof typeof TRANSMISSION_TYPE];
export const TRANSMISSION_TYPE_VALUES = Object.values(TRANSMISSION_TYPE) as TransmissionType[];
export const TRANSMISSION_TYPE_LABEL: Readonly<Record<TransmissionType, string>> = {
  [TRANSMISSION_TYPE.AUTOMATIC]: 'Tự động',
  [TRANSMISSION_TYPE.MANUAL]: 'Số sàn',
  [TRANSMISSION_TYPE.CVT]: 'CVT',
  [TRANSMISSION_TYPE.DCT]: 'Ly hợp kép (DCT)',
  [TRANSMISSION_TYPE.OTHER]: 'Khác',
};

/**
 * Loại dịch vụ cho thuê. Từ 17/08 xe mang MẢNG `serviceTypes` (một xe nhiều dịch vụ) — giá
 * trị `both` cũ đã khai tử (nó là tổ hợp, không phải dịch vụ); booking/booking-request vẫn
 * thuộc đúng MỘT giá trị ở đây.
 */
export const SERVICE_TYPE = {
  SELF_DRIVE: 'self_drive',
  WITH_DRIVER: 'with_driver',
  LONG_TERM: 'long_term',
} as const;

export type ServiceType = (typeof SERVICE_TYPE)[keyof typeof SERVICE_TYPE];
export const SERVICE_TYPE_VALUES = Object.values(SERVICE_TYPE) as ServiceType[];

export const SERVICE_TYPE_LABEL: Readonly<Record<ServiceType, string>> = {
  [SERVICE_TYPE.SELF_DRIVE]: 'Tự lái',
  [SERVICE_TYPE.WITH_DRIVER]: 'Có tài xế',
  [SERVICE_TYPE.LONG_TERM]: 'Thuê dài hạn',
};

/**
 * Nhãn cho giá trị dịch vụ KHÔNG còn trong bộ hiện hành nhưng vẫn nằm trong snapshot jsonb
 * đã đóng băng (approval_tasks, contracts) — snapshot không migrate, chỉ tương thích đọc.
 */
const LEGACY_SERVICE_TYPE_LABEL: Readonly<Record<string, string>> = {
  both: 'Tự lái & có tài xế',
};

/** Nhãn một dịch vụ, chịu được cả giá trị legacy trong snapshot cũ — không bao giờ in mã thô. */
export function serviceTypeLabel(value: string): string {
  return (
    (SERVICE_TYPE_LABEL as Readonly<Record<string, string>>)[value] ??
    LEGACY_SERVICE_TYPE_LABEL[value] ??
    value
  );
}

/** Nhãn gộp cho MẢNG dịch vụ của xe (`service_types`) — điểm dùng chung cho mọi chỗ hiển thị. */
export function serviceTypesLabel(values: readonly string[]): string {
  return values.map(serviceTypeLabel).join(' · ');
}

/**
 * Sàn thời lượng một chuyến THUÊ DÀI HẠN (ngày) — khách chọn ngày cụ thể, tối thiểu 1 tuần
 * (chốt 17/08). Dùng chung FE (yup + minDays của control chọn ngày) lẫn BE (quote + tạo
 * yêu cầu — backend là nguồn chặn thật).
 */
export const LONG_TERM_MIN_DAYS = 7;

/**
 * Nhiên liệu — thuộc tính dữ liệu của xe (không phải trạng thái), nên chỉ có nhãn, không màu.
 * DB lưu String; đây là bộ giá trị chốt để form là select thay vì text trần (ADR 0005).
 */
export const FUEL_TYPE = {
  GASOLINE: 'gasoline',
  DIESEL: 'diesel',
  ELECTRIC: 'electric',
  HYBRID: 'hybrid',
} as const;

export type FuelType = (typeof FUEL_TYPE)[keyof typeof FUEL_TYPE];
export const FUEL_TYPE_VALUES = Object.values(FUEL_TYPE) as FuelType[];

export const FUEL_TYPE_LABEL: Readonly<Record<FuelType, string>> = {
  [FUEL_TYPE.GASOLINE]: 'Xăng',
  [FUEL_TYPE.DIESEL]: 'Dầu (Diesel)',
  [FUEL_TYPE.ELECTRIC]: 'Điện',
  [FUEL_TYPE.HYBRID]: 'Hybrid',
};

/**
 * Ma trận loại phương tiện × nguồn năng lượng.
 *
 * Không tạo các enum tổ hợp như `electric_car`/`electric_motorbike`: hai chiều này được lưu
 * độc lập để bộ lọc, báo cáo và danh mục xe không tăng số tổ hợp khi bổ sung nguồn năng lượng mới.
 */
export const VEHICLE_FUEL_TYPES: Readonly<Record<VehicleType, readonly FuelType[]>> = {
  [VEHICLE_TYPE.CAR]: [FUEL_TYPE.GASOLINE, FUEL_TYPE.DIESEL, FUEL_TYPE.ELECTRIC, FUEL_TYPE.HYBRID],
  [VEHICLE_TYPE.MOTORBIKE]: [FUEL_TYPE.GASOLINE, FUEL_TYPE.ELECTRIC],
};

export function vehicleFuelTypesFor(vehicleType: string): readonly FuelType[] {
  return VEHICLE_FUEL_TYPES[vehicleType as VehicleType] ?? [];
}

export function isVehicleFuelTypeAllowed(
  vehicleType: string,
  fuelType: string | null | undefined,
): boolean {
  return fuelType == null || vehicleFuelTypesFor(vehicleType).includes(fuelType as FuelType);
}

/**
 * Kiểu dáng thân xe (body type) — thuộc tính dữ liệu như nhiên liệu, chỉ áp dụng cho ô tô
 * (`vehicleType = car`). Đây là chiều "Loại xe" trong bộ lọc marketplace (database_design §9.9).
 */
export const BODY_TYPE = {
  MINI: 'mini',
  SEDAN: 'sedan',
  CUV: 'cuv',
  SUV: 'suv',
  MPV: 'mpv',
  PICKUP: 'pickup',
  VAN: 'van',
  MINIBUS: 'minibus',
  CARGO: 'cargo',
} as const;

export type BodyType = (typeof BODY_TYPE)[keyof typeof BODY_TYPE];
export const BODY_TYPE_VALUES = Object.values(BODY_TYPE) as BodyType[];

export const BODY_TYPE_LABEL: Readonly<Record<BodyType, string>> = {
  [BODY_TYPE.MINI]: 'Mini car',
  [BODY_TYPE.SEDAN]: 'Sedan',
  [BODY_TYPE.CUV]: 'CUV',
  [BODY_TYPE.SUV]: 'SUV',
  [BODY_TYPE.MPV]: 'MPV (7 chỗ)',
  [BODY_TYPE.PICKUP]: 'Bán tải',
  [BODY_TYPE.VAN]: 'Van',
  [BODY_TYPE.MINIBUS]: 'Xe 16 chỗ',
  [BODY_TYPE.CARGO]: 'Xe tải – Cargo',
};

export function bodyTypeLabel(key: string): string {
  return (BODY_TYPE_LABEL as Record<string, string>)[key] ?? key;
}

/**
 * Danh sách hãng xe curated — `label` là giá trị canonical lưu vào cột `brand` (cột vẫn là
 * free-text để không chặn hãng lạ; AutoComplete + seed dùng label này để facet groupBy không
 * bị tách dòng), `key` là slug dùng tra logo `/brands/{key}.svg`.
 */
export const VEHICLE_BRANDS: ReadonlyArray<{ key: string; label: string }> = [
  { key: 'vinfast', label: 'VinFast' },
  { key: 'toyota', label: 'Toyota' },
  { key: 'hyundai', label: 'Hyundai' },
  { key: 'kia', label: 'Kia' },
  { key: 'mazda', label: 'Mazda' },
  { key: 'honda', label: 'Honda' },
  { key: 'ford', label: 'Ford' },
  { key: 'mitsubishi', label: 'Mitsubishi' },
  { key: 'suzuki', label: 'Suzuki' },
  { key: 'nissan', label: 'Nissan' },
  { key: 'peugeot', label: 'Peugeot' },
  { key: 'mercedes', label: 'Mercedes-Benz' },
  { key: 'bmw', label: 'BMW' },
  { key: 'volkswagen', label: 'Volkswagen' },
  { key: 'mini', label: 'MINI' },
  { key: 'chevrolet', label: 'Chevrolet' },
  { key: 'yamaha', label: 'Yamaha' },
];

/**
 * Đổi tên hãng (free-text) → key logo: khớp curated theo label (không phân biệt hoa thường),
 * không có thì slugify để vẫn thử tra được file logo tự thêm sau.
 */
export function vehicleBrandKey(brand: string): string {
  const normalized = brand.trim().toLowerCase();
  const hit = VEHICLE_BRANDS.find((b) => b.label.toLowerCase() === normalized);
  if (hit) return hit.key;
  return normalized.replace(/[^a-z0-9]+/g, '-').replace(/(^-+|-+$)/g, '');
}

/**
 * Bucket "Số chỗ" của bộ lọc marketplace — giá trị đi trong URL/query (CSV), range để
 * where-builder BE và label FE dùng chung một nguồn.
 */
export const SEAT_BUCKET = {
  S4: '4',
  S5: '5',
  S7: '7',
  S8_PLUS: '8plus',
} as const;

export type SeatBucket = (typeof SEAT_BUCKET)[keyof typeof SEAT_BUCKET];
export const SEAT_BUCKET_VALUES = Object.values(SEAT_BUCKET) as SeatBucket[];

export const SEAT_BUCKET_LABEL: Readonly<Record<SeatBucket, string>> = {
  [SEAT_BUCKET.S4]: '4 chỗ',
  [SEAT_BUCKET.S5]: '5 chỗ',
  [SEAT_BUCKET.S7]: '7 chỗ',
  [SEAT_BUCKET.S8_PLUS]: '7+ chỗ',
};

/** Range số chỗ của từng bucket — min/max đều inclusive, thiếu đầu nào thì đầu đó mở. */
export const SEAT_BUCKET_RANGE: Readonly<Record<SeatBucket, { min?: number; max?: number }>> = {
  [SEAT_BUCKET.S4]: { max: 4 },
  [SEAT_BUCKET.S5]: { min: 5, max: 6 },
  [SEAT_BUCKET.S7]: { min: 7, max: 7 },
  [SEAT_BUCKET.S8_PLUS]: { min: 8 },
};

/**
 * Tiện ích listing — 4 toggle trong bộ lọc marketplace. Key trùng tên query param của
 * `/public/listings`: hourly = có giá thuê giờ, delivery = giao xe tận nơi,
 * noCollateral = miễn thế chấp, discount = đang giảm giá.
 */
export const LISTING_AMENITY = {
  HOURLY: 'hourly',
  DELIVERY: 'delivery',
  NO_COLLATERAL: 'noCollateral',
  DISCOUNT: 'discount',
} as const;

export type ListingAmenity = (typeof LISTING_AMENITY)[keyof typeof LISTING_AMENITY];
export const LISTING_AMENITY_VALUES = Object.values(LISTING_AMENITY) as ListingAmenity[];

export const LISTING_AMENITY_LABEL: Readonly<Record<ListingAmenity, string>> = {
  [LISTING_AMENITY.HOURLY]: 'Thuê theo giờ',
  [LISTING_AMENITY.DELIVERY]: 'Giao xe tận nơi',
  [LISTING_AMENITY.NO_COLLATERAL]: 'Miễn thế chấp',
  [LISTING_AMENITY.DISCOUNT]: 'Đang giảm giá',
};

/** Dòng mô tả phụ dưới mỗi toggle tiện ích (theo mockup bộ lọc). */
export const LISTING_AMENITY_DESC: Readonly<Record<ListingAmenity, string>> = {
  [LISTING_AMENITY.HOURLY]: 'Xe có giá thuê giờ',
  [LISTING_AMENITY.DELIVERY]: 'Chủ xe hỗ trợ giao nhận',
  [LISTING_AMENITY.NO_COLLATERAL]: 'Không yêu cầu cọc tài sản',
  [LISTING_AMENITY.DISCOUNT]: 'Xe có khuyến mãi',
};
