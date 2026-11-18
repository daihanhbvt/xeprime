/**
 * Cà vẹt (giấy chứng nhận đăng ký xe) lúc TẠO ô tô — ADR 0089.
 *
 * Chủ xe chụp cà vẹt ở bước Hình ảnh của wizard; ảnh vào kho RIÊNG TƯ trước khi xe tồn tại (bảng
 * `vehicle_registration_uploads`), máy đọc kể lại các trường, và lượt tạo xe gắn ảnh + trường vào
 * giấy tờ `registration` của xe trong CÙNG transaction. Đủ trường bắt buộc ⇒ lưu luôn; thiếu ⇒ chủ
 * xe nhập tay phần thiếu. Chỉ ô tô (xe máy chưa có bảo hiểm — ADR 0088).
 */
import { DRIVER_LICENCE_UPLOAD_MAX_BYTES } from './driver-licence';

/** Vòng đời một lượt tải ảnh cà vẹt chưa gắn vào xe. */
export const VEHICLE_REGISTRATION_UPLOAD_STATUS = {
  /** Đã phát URL tải lên, chưa xác minh tệp. */
  UPLOADING: 'uploading',
  /** Tệp hợp lệ, đã chạy máy đọc (đọc được hay không) — dùng được cho lượt tạo xe. */
  READ: 'read',
  /** Đã gắn vào một xe — không dùng lại được. */
  CONSUMED: 'consumed',
} as const;

export type VehicleRegistrationUploadStatus =
  (typeof VEHICLE_REGISTRATION_UPLOAD_STATUS)[keyof typeof VEHICLE_REGISTRATION_UPLOAD_STATUS];

export const VEHICLE_REGISTRATION_UPLOAD_STATUS_VALUES = Object.values(
  VEHICLE_REGISTRATION_UPLOAD_STATUS,
) as VehicleRegistrationUploadStatus[];

/** Trần ảnh cà vẹt — cùng trần ảnh giấy tờ tuỳ thân; client nén về 2000px trước khi tải. */
export const VEHICLE_REGISTRATION_UPLOAD_MAX_BYTES = DRIVER_LICENCE_UPLOAD_MAX_BYTES;

/**
 * Lượt tải chưa gắn vào xe quá chừng này giờ thì worker xoá cả ảnh lẫn dòng — cà vẹt mang tên và
 * địa chỉ chủ xe, không giữ ảnh của một wizard đã bỏ dở.
 */
export const VEHICLE_REGISTRATION_UPLOAD_TTL_HOURS = 24;

/** Số lượt tải ảnh cà vẹt tối đa của một người trong 24 giờ — chặn dùng máy đọc làm OCR miễn phí. */
export const VEHICLE_REGISTRATION_UPLOADS_PER_DAY = 30;

/** Các trường lấy từ cà vẹt — key ổn định cho DTO, form và thông báo lỗi. */
export const VEHICLE_REGISTRATION_FIELD = {
  PLATE_NUMBER: 'plateNumber',
  HOLDER_NAME: 'holderName',
  HOLDER_ADDRESS: 'holderAddress',
  CHASSIS_NUMBER: 'chassisNumber',
  ENGINE_NUMBER: 'engineNumber',
} as const;

export type VehicleRegistrationField =
  (typeof VEHICLE_REGISTRATION_FIELD)[keyof typeof VEHICLE_REGISTRATION_FIELD];

/**
 * Trường BẮT BUỘC để cà vẹt được coi là đủ: tên chủ xe + số khung là trường bắt buộc của hợp đồng
 * MIC (ADR 0088), số máy cùng số khung định danh chiếc xe.
 */
export const VEHICLE_REGISTRATION_REQUIRED_FIELDS = [
  VEHICLE_REGISTRATION_FIELD.HOLDER_NAME,
  VEHICLE_REGISTRATION_FIELD.CHASSIS_NUMBER,
  VEHICLE_REGISTRATION_FIELD.ENGINE_NUMBER,
] as const;

/** Độ dài hợp lệ — khớp cột `vehicle_documents` và DTO. */
export const VEHICLE_REGISTRATION_LIMITS = {
  holderNameMax: 160,
  holderAddressMax: 255,
  /** VIN chuẩn 17 ký tự; xe lắp ráp/cũ trong nước có số khung ngắn hơn. */
  chassisNumberMin: 6,
  chassisNumberMax: 25,
  engineNumberMin: 4,
  engineNumberMax: 25,
  plateNumberMax: 50,
} as const;

/** Kết quả đọc một ảnh cà vẹt — trường không đọc được là `null`, KHÔNG đoán. */
export interface VehicleRegistrationReading {
  plateNumber: string | null;
  holderName: string | null;
  holderAddress: string | null;
  chassisNumber: string | null;
  engineNumber: string | null;
  /** Màu sơn ("Trắng") — tự điền ô Màu sắc của form xe (ADR 0102). */
  color: string | null;
}

/** Biển số chỉ còn chữ + số, viết hoa — "51H-100.00" ≡ "51h 10000". */
export function normalizePlateNumber(value: string | null | undefined): string {
  return (value ?? '').toUpperCase().replace(/[^0-9A-Z]/g, '');
}

/** Số khung / số máy: viết hoa, bỏ khoảng trắng và dấu chấm/gạch máy đọc hay chèn nhầm. */
export function normalizeRegistrationCode(value: string | null | undefined): string {
  return (value ?? '').toUpperCase().replace(/[^0-9A-Z]/g, '');
}

export interface RegistrationReadingAssessment {
  /** Đủ trường bắt buộc và không lệch biển số ⇒ lưu luôn, không bắt nhập tay. */
  complete: boolean;
  /** Trường bắt buộc máy chưa đọc được — chủ xe phải nhập tay. */
  missing: VehicleRegistrationField[];
  /** Biển số trên cà vẹt khác biển đã nhập ở bước Cơ bản (cả hai cùng có). */
  plateMismatch: boolean;
}

/**
 * Một lượt đọc đã đủ để lưu không — hàm thuần, web dùng để chọn "tóm tắt" hay "nhập tay", server
 * không dựa vào nó để tin dữ liệu (server kiểm lại trường bắt buộc lúc tạo xe).
 */
export function assessRegistrationReading(
  reading: VehicleRegistrationReading | null,
  vehiclePlate: string | null | undefined,
): RegistrationReadingAssessment {
  const missing = VEHICLE_REGISTRATION_REQUIRED_FIELDS.filter(
    (field) => !(reading?.[field] ?? '').trim(),
  );
  const read = normalizePlateNumber(reading?.plateNumber);
  const typed = normalizePlateNumber(vehiclePlate);
  const plateMismatch = read.length > 0 && typed.length > 0 && read !== typed;
  return { complete: missing.length === 0 && !plateMismatch, missing, plateMismatch };
}
