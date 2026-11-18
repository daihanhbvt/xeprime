import {
  VEHICLE_REGISTRATION_LIMITS as LIMITS,
  assessRegistrationReading,
  normalizeRegistrationCode,
  type VehicleRegistrationReading,
} from '@xeprime/types';
import type { CreateVehicleRegistrationInput } from './types';

/**
 * Ô "Cà vẹt xe" của wizard tạo ô tô (ADR 0089) — trạng thái + luật kiểm, thuần để test riêng.
 *
 * Giữ NGOÀI form React Hook Form của wizard: `VehicleFormValues` là schema dùng chung với app
 * native, thêm trường vào đó là đổi type của một app khác.
 */
export type RegistrationPhase = 'empty' | 'working' | 'ready' | 'failed';

/** Lý do một lượt chọn ảnh hỏng — khoá câu lỗi ở `Vehicles.form.registration.failure`. */
export type RegistrationFailure = 'unsupported' | 'tooSmall' | 'tooLarge' | 'upload';

export interface RegistrationFields {
  holderName: string;
  chassisNumber: string;
  engineNumber: string;
  holderAddress: string;
}

export interface RegistrationCaptureState {
  phase: RegistrationPhase;
  uploadId: string | null;
  /** Ảnh xem trước (object URL) — người gọi thu hồi khi đổi ảnh. */
  previewUrl: string | null;
  failure: RegistrationFailure | null;
  /** Mã lỗi API khi `failure = upload` — để `useErrorMessage` nói đúng lý do. */
  failureError: unknown;
  reading: VehicleRegistrationReading | null;
  readerAvailable: boolean;
  fields: RegistrationFields;
  /** Chủ xe bấm "Sửa" trên bản tóm tắt — mở các ô nhập dù máy đã đọc đủ. */
  editing: boolean;
}

export const EMPTY_REGISTRATION_FIELDS: RegistrationFields = {
  holderName: '',
  chassisNumber: '',
  engineNumber: '',
  holderAddress: '',
};

export const EMPTY_REGISTRATION: RegistrationCaptureState = {
  phase: 'empty',
  uploadId: null,
  previewUrl: null,
  failure: null,
  failureError: null,
  reading: null,
  readerAvailable: false,
  fields: EMPTY_REGISTRATION_FIELDS,
  editing: false,
};

/** Trường máy đọc được ⇒ điền sẵn vào ô nhập; không đọc được ⇒ để trống cho chủ xe gõ. */
export function fieldsFromReading(reading: VehicleRegistrationReading | null): RegistrationFields {
  return {
    holderName: reading?.holderName ?? '',
    chassisNumber: reading?.chassisNumber ?? '',
    engineNumber: reading?.engineNumber ?? '',
    holderAddress: reading?.holderAddress ?? '',
  };
}

/**
 * Máy đọc đủ (và biển số khớp) ⇒ lưu luôn, chỉ hiện bản tóm tắt. Thiếu / lệch ⇒ bắt nhập tay.
 * Chủ xe tự mở sửa thì cũng là nhập tay.
 */
export function registrationAutoFilled(
  state: RegistrationCaptureState,
  vehiclePlate: string | null | undefined,
): boolean {
  return (
    state.phase === 'ready' &&
    !state.editing &&
    assessRegistrationReading(state.reading, vehiclePlate).complete
  );
}

export type RegistrationErrorField = 'photo' | keyof RegistrationFields;

/** Mã lỗi — khoá câu ở `Vehicles.form.registration.errors`. */
export type RegistrationErrorCode =
  | 'photoRequired'
  | 'photoNotReady'
  | 'holderNameRequired'
  | 'holderNameInvalid'
  | 'chassisRequired'
  | 'chassisInvalid'
  | 'engineRequired'
  | 'engineInvalid'
  | 'addressTooLong';

export interface RegistrationCheck {
  ok: boolean;
  errors: Partial<Record<RegistrationErrorField, RegistrationErrorCode>>;
  /** Có khi `ok` — gửi kèm `POST /vehicles`. */
  input?: CreateVehicleRegistrationInput;
}

const CODE_PATTERN = /^[A-Z0-9-]+$/;

/** Cùng luật với `CreateVehicleRegistrationDto` ở server — server vẫn kiểm lại. */
export function checkRegistration(
  state: RegistrationCaptureState,
  vehiclePlate: string | null | undefined,
): RegistrationCheck {
  const errors: RegistrationCheck['errors'] = {};
  // Ảnh cà vẹt TUỲ CHỌN (18/11/2026): chỉ để máy điền nhanh ba ô bên dưới. Chỉ chặn khi ảnh ĐANG
  // tải/đọc - gửi lúc đó là bỏ mất ảnh người dùng vừa chọn.
  if (state.phase === 'working') errors.photo = 'photoNotReady';

  const holderName = state.fields.holderName.trim().replace(/\s+/g, ' ');
  const chassisNumber = normalizeRegistrationCode(state.fields.chassisNumber);
  const engineNumber = normalizeRegistrationCode(state.fields.engineNumber);
  const holderAddress = state.fields.holderAddress.trim();

  if (!holderName) errors.holderName = 'holderNameRequired';
  else if (holderName.length < 2 || holderName.length > LIMITS.holderNameMax) {
    errors.holderName = 'holderNameInvalid';
  }
  if (!chassisNumber) errors.chassisNumber = 'chassisRequired';
  else if (
    chassisNumber.length < LIMITS.chassisNumberMin ||
    chassisNumber.length > LIMITS.chassisNumberMax ||
    !CODE_PATTERN.test(chassisNumber)
  ) {
    errors.chassisNumber = 'chassisInvalid';
  }
  if (!engineNumber) errors.engineNumber = 'engineRequired';
  else if (
    engineNumber.length < LIMITS.engineNumberMin ||
    engineNumber.length > LIMITS.engineNumberMax ||
    !CODE_PATTERN.test(engineNumber)
  ) {
    errors.engineNumber = 'engineInvalid';
  }
  if (holderAddress.length > LIMITS.holderAddressMax) errors.holderAddress = 'addressTooLong';

  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return {
    ok: true,
    errors,
    input: {
      ...(state.uploadId ? { uploadId: state.uploadId } : {}),
      holderName,
      chassisNumber,
      engineNumber,
      holderAddress: holderAddress || null,
      // Biển in trên cà vẹt (nếu đọc được); vắng thì server lấy biển số của xe.
      plateNumber: state.reading?.plateNumber ?? vehiclePlate?.trim() ?? null,
    },
  };
}

/**
 * Gộp kết quả máy đọc vào các ô chủ xe ĐÃ GÕ tay (ADR 0099): ô đã có chữ giữ nguyên, ô trống lấy
 * giá trị đọc được. Máy đọc về muộn không bao giờ ghi đè công nhập tay.
 */
export function mergeTypedFields(
  typed: RegistrationFields,
  read: RegistrationFields,
): RegistrationFields {
  const pick = (field: keyof RegistrationFields) => (typed[field].trim() ? typed[field] : read[field]);
  return {
    holderName: pick('holderName'),
    chassisNumber: pick('chassisNumber'),
    engineNumber: pick('engineNumber'),
    holderAddress: pick('holderAddress'),
  };
}
