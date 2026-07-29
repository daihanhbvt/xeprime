import { PAYMENT_METHOD_VALUES, RECEIPT_TYPE_VALUES } from '@xeprime/types';
import * as yup from 'yup';

/**
 * Schema form tạo phiếu thu/chi (yup — báo lỗi sớm; validate thật ở BE). Tiền giữ number trong
 * form, hoá string lúc gửi (ADR 0007).
 */
export const receiptFormSchema = yup.object({
  type: yup.string().required('Chọn loại phiếu').oneOf([...RECEIPT_TYPE_VALUES]),
  amount: yup
    .number()
    .typeError('Nhập số tiền')
    .nullable()
    .defined()
    .min(0, 'Số tiền phải ≥ 0')
    .test('required', 'Nhập số tiền', (v) => v != null),
  paymentMethod: yup.string().required('Chọn hình thức').oneOf([...PAYMENT_METHOD_VALUES]),
  categoryId: yup.string().nullable().default(null),
  referenceCode: yup.string().trim().max(255).default(''),
  description: yup.string().trim().max(2000).default(''),
});

export type ReceiptFormValues = yup.InferType<typeof receiptFormSchema>;
