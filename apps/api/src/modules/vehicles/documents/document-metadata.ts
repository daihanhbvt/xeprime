import { BadRequestException } from '@nestjs/common';
import { API_ERROR_CODE, VEHICLE_DOCUMENT_TYPE } from '@xeprime/types';

/**
 * Validation metadata giấy tờ TẬP TRUNG (Wave 5.1) — một nguồn luật cho cả nhập tay
 * (create/update) lẫn áp kết quả OCR. Luôn validate TRẠNG THÁI SAU KHI GỘP
 * (bản hiện tại + patch), không chỉ phần patch gửi lên — để "sửa mỗi ngày cấp" vẫn bị
 * chặn nếu nó làm ngày cấp vượt qua ngày hết hạn đang có.
 */

/** Giới hạn khớp cột DB (migration 20260812200000) — chặn ở app để trả 400 field-level thay vì P2000 → 500. */
export const DOCUMENT_FIELD_MAX_LENGTH = {
  customTypeName: 160,
  documentNumber: 120,
  holderName: 160,
  holderAddress: 255,
  plateNumber: 50,
  chassisNumber: 80,
  engineNumber: 80,
  notes: 4000,
} as const;

export type DocumentTextField = keyof typeof DOCUMENT_FIELD_MAX_LENGTH;

export const DOCUMENT_TEXT_FIELDS = Object.keys(DOCUMENT_FIELD_MAX_LENGTH) as DocumentTextField[];

/** Trạng thái metadata ĐÃ GỘP của một giấy tờ — đầu vào duy nhất của validate. */
export interface DocumentMetadataState {
  type: string;
  customTypeName: string | null;
  documentNumber: string | null;
  holderName: string | null;
  holderAddress: string | null;
  plateNumber: string | null;
  chassisNumber: string | null;
  engineNumber: string | null;
  issuedAt: Date | null;
  expiresAt: Date | null;
  notes: string | null;
}

/** Ký tự điều khiển không in được (chừa \n \t cho ghi chú/địa chỉ) — dữ liệu giấy tờ không có lý do chứa chúng. */
// eslint-disable-next-line no-control-regex -- chặn control char là mục đích của chính regex này
const CONTROL_CHARS = new RegExp('[\\u0000-\\u0008\\u000B\\u000C\\u000E-\\u001F\\u007F]');

/**
 * Ném 400 `VALIDATION_FAILED` kèm `details.fields = [{field, message}]` để FE gắn lỗi
 * đúng ô nhập. Giá trị sai không bao giờ được rơi tới Prisma thành 500.
 */
export function validateDocumentMetadata(state: DocumentMetadataState): void {
  const fields: { field: string; message: string }[] = [];

  for (const field of DOCUMENT_TEXT_FIELDS) {
    const value = state[field];
    if (value == null) continue;
    const max = DOCUMENT_FIELD_MAX_LENGTH[field];
    if (value.length > max) {
      fields.push({ field, message: `Tối đa ${max} ký tự` });
    }
    if (CONTROL_CHARS.test(value)) {
      fields.push({ field, message: 'Chứa ký tự điều khiển không hợp lệ' });
    }
  }

  if (state.type !== VEHICLE_DOCUMENT_TYPE.OTHER && state.customTypeName) {
    fields.push({ field: 'customTypeName', message: 'Tên tuỳ chỉnh chỉ dùng cho loại giấy tờ khác' });
  }

  if (state.issuedAt && state.expiresAt && state.expiresAt < state.issuedAt) {
    fields.push({ field: 'expiresAt', message: 'Ngày hết hạn không được trước ngày cấp' });
  }

  if (fields.length > 0) {
    throw new BadRequestException({
      code: API_ERROR_CODE.VALIDATION_FAILED,
      message: 'Thông tin giấy tờ không hợp lệ',
      details: { fields },
    });
  }
}
