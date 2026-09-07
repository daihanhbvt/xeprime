/**
 * Form sổ khách — schema DÙNG CHUNG với app native, sống ở `@xeprime/validators`.
 *
 * Message của schema là MÃ; `useValidationResolver(schema, 'Customers.validation')` dịch chúng
 * ra chữ (ADR 0012). Chép schema xuống app native là dựng bản thứ hai của cùng một luật, mà luật
 * ở đây phải khớp với `class-validator` của DTO backend và với CHECK ở DB.
 */
export {
  customerFormSchema,
  customerNoteSchema,
  customerRiskSchema,
  type CustomerFormValues,
  type CustomerNoteFormValues,
  type CustomerRiskFormValues,
} from '@xeprime/validators';
