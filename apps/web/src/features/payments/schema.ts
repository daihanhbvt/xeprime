import { PAYMENT_METHOD_VALUES } from '@xeprime/types';
import * as yup from 'yup';

/** Form ghi nhận thu tiền (yup — BE validate lại). Số tiền number trong form, string khi gửi. */
export const recordPaymentSchema = yup.object({
  amount: yup
    .number()
    .typeError('Nhập số tiền')
    .nullable()
    .defined()
    .moreThan(0, 'Số tiền phải lớn hơn 0')
    .test('required', 'Nhập số tiền', (v) => v != null),
  method: yup.string().required('Chọn hình thức').oneOf([...PAYMENT_METHOD_VALUES]),
  referenceCode: yup.string().trim().max(255).default(''),
  description: yup.string().trim().max(500).default(''),
});

export type RecordPaymentValues = yup.InferType<typeof recordPaymentSchema>;
