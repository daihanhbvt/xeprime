import { PAYMENT_METHOD_VALUES, RECEIPT_TYPE_VALUES } from '@xeprime/types';
import * as yup from 'yup';

/**
 * Schema form tạo phiếu thu/chi (yup — báo lỗi sớm; validate thật ở BE). Tiền giữ number trong
 * form, hoá string lúc gửi (ADR 0007).
 */
export const receiptFormSchema = yup.object({
  type: yup.string().required('Chọn loại phiếu').oneOf([...RECEIPT_TYPE_VALUES]),
  /** Ngày tiền phát sinh, `YYYY-MM-DD`. Mặc định hôm nay; nhập bù thì đặt đúng ngày đã chi. */
  occurredAt: yup.string().required('Chọn ngày phát sinh'),
  amount: yup
    .number()
    .typeError('Nhập số tiền')
    .nullable()
    .defined()
    .min(0, 'Số tiền phải ≥ 0')
    .test('required', 'Nhập số tiền', (v) => v != null),
  paymentMethod: yup.string().required('Chọn hình thức').oneOf([...PAYMENT_METHOD_VALUES]),
  categoryId: yup.string().nullable().default(null),
  /** Đơn thuê liên kết — chọn xong form tự điền khách, xe và số tiền còn nợ. */
  bookingId: yup.string().nullable().default(null),
  vehicleId: yup.string().nullable().default(null),
  referenceCode: yup.string().trim().max(255).default(''),
  description: yup.string().trim().max(2000).default(''),
  /** URL ảnh minh chứng đã upload lên R2. Trần 10 khớp `ArrayMaxSize` ở DTO backend. */
  attachments: yup.array().of(yup.string().required()).max(10).default([]),
});

export type ReceiptFormValues = yup.InferType<typeof receiptFormSchema>;
