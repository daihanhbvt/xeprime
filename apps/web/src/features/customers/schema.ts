import {
  TENANT_CUSTOMER_NOTE_TYPE,
  TENANT_CUSTOMER_NOTE_TYPE_VALUES,
  TENANT_CUSTOMER_RISK_LEVEL,
  TENANT_CUSTOMER_RISK_LEVEL_VALUES,
  VN_PHONE_PATTERN,
  type TenantCustomerNoteType,
  type TenantCustomerRiskLevel,
} from '@xeprime/types';
import * as yup from 'yup';

/**
 * Form sổ khách. Yup báo lỗi SỚM cho người dùng; lớp chặn thật vẫn là `class-validator` +
 * ràng buộc DB ở backend (CLAUDE.md mục 4) — không bỏ lớp nào vì lớp kia đã có.
 */
export const customerFormSchema = yup.object({
  fullName: yup.string().trim().required('Nhập họ tên khách').max(255),
  phone: yup
    .string()
    .trim()
    .required('Nhập số điện thoại')
    .matches(VN_PHONE_PATTERN, 'Số điện thoại không hợp lệ (ví dụ 0901234567)'),
  email: yup
    .string()
    .trim()
    .max(255)
    .default('')
    .test(
      'email',
      'Email không hợp lệ',
      (value) => !value || yup.string().email().isValidSync(value),
    ),
  address: yup.string().trim().max(500).default(''),
});

export type CustomerFormValues = yup.InferType<typeof customerFormSchema>;

/**
 * Đổi mức rủi ro. Lý do BẮT BUỘC khi khác `normal` — cùng luật với DTO backend và với CHECK
 * `tenant_customers_risk_reason_required_check` ở DB, nên ba lớp không thể lệch nhau.
 */
export const customerRiskSchema = yup.object({
  riskLevel: yup
    .mixed<TenantCustomerRiskLevel>()
    .oneOf(TENANT_CUSTOMER_RISK_LEVEL_VALUES)
    .required()
    .default(TENANT_CUSTOMER_RISK_LEVEL.NORMAL),
  reason: yup
    .string()
    .trim()
    .max(1000)
    .default('')
    .when('riskLevel', {
      is: (value: TenantCustomerRiskLevel) => value !== TENANT_CUSTOMER_RISK_LEVEL.NORMAL,
      then: (schema) => schema.required('Nhập lý do để người sau hiểu vì sao có đánh dấu này'),
    }),
});

export type CustomerRiskFormValues = yup.InferType<typeof customerRiskSchema>;

export const customerNoteSchema = yup.object({
  noteType: yup
    .mixed<TenantCustomerNoteType>()
    .oneOf(TENANT_CUSTOMER_NOTE_TYPE_VALUES)
    .required()
    .default(TENANT_CUSTOMER_NOTE_TYPE.GENERAL),
  body: yup.string().trim().required('Nhập nội dung ghi chú').max(2000),
});

export type CustomerNoteFormValues = yup.InferType<typeof customerNoteSchema>;
