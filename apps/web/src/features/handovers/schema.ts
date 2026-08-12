import * as yup from 'yup';
import {
  FUEL_LEVEL_VALUES,
  ODOMETER_CORRECTION_REASON,
  ODOMETER_CORRECTION_REASON_VALUES,
  ODOMETER_MAX_KM,
} from '@xeprime/types';

/**
 * Form bàn giao (Wave 7) — lớp báo sớm ở FE. Ràng buộc thật (KM trả ≥ KM giao, ảnh bắt buộc,
 * trạng thái đơn) nằm ở backend + DB; ở đây chỉ chặn những gì chặn được ngay tại ô nhập để
 * người ở quầy không phải chờ một vòng mạng mới biết gõ nhầm.
 *
 * KM để `nullable`: bản NHÁP được phép chưa có số (nhân viên lưu tạm rồi quay lại). Bắt buộc
 * chỉ áp lúc XÁC NHẬN, và lúc đó backend là nơi quyết.
 */
const odometerKm = yup
  .number()
  .transform((value, original) => (original === '' || original === null ? null : value))
  .typeError('Chỉ số KM phải là số')
  .integer('Chỉ số KM phải là số nguyên')
  .min(0, 'Chỉ số KM không thể âm')
  .max(ODOMETER_MAX_KM, `Chỉ số KM tối đa ${ODOMETER_MAX_KM}`)
  .nullable()
  .default(null);

const optionalText = (max: number) => yup.string().trim().max(max).default('');

export const handoverFormSchema = yup.object({
  odometerKm,
  fuelLevel: yup.string().oneOf([...FUEL_LEVEL_VALUES, '']).default(''),
  batteryPercent: yup
    .number()
    .transform((value, original) => (original === '' || original === null ? null : value))
    .typeError('Mức pin phải là số')
    .integer('Mức pin phải là số nguyên')
    .min(0, 'Mức pin từ 0 đến 100')
    .max(100, 'Mức pin từ 0 đến 100')
    .nullable()
    .default(null),
  conditionNote: optionalText(2000),
  damageNote: optionalText(2000),
  notes: optionalText(2000),
});

export type HandoverFormValues = yup.InferType<typeof handoverFormSchema>;

/**
 * Bổ sung/sửa KM trên biên bản đã xác nhận. Lý do BẮT BUỘC — đây là thao tác có thẩm quyền,
 * và CHECK ở DB cũng đòi lý do khi nguồn là điều chỉnh thủ công.
 */
export const resolveOdometerSchema = yup.object({
  odometerKm: odometerKm.required('Nhập chỉ số KM').nonNullable('Nhập chỉ số KM'),
  reasonCode: yup
    .string()
    .oneOf(ODOMETER_CORRECTION_REASON_VALUES)
    .default(ODOMETER_CORRECTION_REASON.HANDOVER_ERROR)
    .required('Chọn lý do'),
  reason: yup.string().trim().max(1000).required('Nhập lý do chi tiết'),
});

export type ResolveOdometerFormValues = yup.InferType<typeof resolveOdometerSchema>;
