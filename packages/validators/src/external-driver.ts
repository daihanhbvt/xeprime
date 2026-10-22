import * as yup from 'yup';
import { EXTERNAL_DRIVER_NAME_LENGTH, VN_PHONE_PATTERN } from '@xeprime/types';

/** Câu lỗi của form tài xế ngoài hệ thống — app truyền câu đã dịch vào (luật ở đây, chữ ở ngoài). */
export interface ExternalDriverSchemaLabels {
  nameRequired: string;
  nameLength: string;
  phoneRequired: string;
  phoneInvalid: string;
}

/** Bỏ dấu cách / chấm / gạch người dùng hay gõ trong SĐT — cùng phép server làm trước khi kiểm. */
function compactPhone(value: unknown): unknown {
  return typeof value === 'string' ? value.replace(/[\s.-]/g, '') : value;
}

/**
 * Tài xế NGOÀI HỆ THỐNG ghi trên đơn (ADR 0067) — tên 2–120 ký tự sau khi cắt khoảng trắng, SĐT di
 * động VN bắt buộc (khách cần gọi được người sẽ đến đón). Khớp `ExternalDriverInputDto` ở API: hai
 * lớp thi hành cùng một luật, `EXTERNAL_DRIVER_NAME_LENGTH` + `VN_PHONE_PATTERN` là nguồn chung.
 */
export const buildExternalDriverSchema = (labels: ExternalDriverSchemaLabels) =>
  yup.object({
    name: yup
      .string()
      .trim()
      .required(labels.nameRequired)
      .min(EXTERNAL_DRIVER_NAME_LENGTH.MIN, labels.nameLength)
      .max(EXTERNAL_DRIVER_NAME_LENGTH.MAX, labels.nameLength),
    phone: yup
      .string()
      .transform(compactPhone)
      .required(labels.phoneRequired)
      .matches(VN_PHONE_PATTERN, labels.phoneInvalid),
  });

export type ExternalDriverFormValues = yup.InferType<ReturnType<typeof buildExternalDriverSchema>>;
