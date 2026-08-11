import type { Dayjs } from 'dayjs';
import * as yup from 'yup';

/**
 * Schema form "Yêu cầu thuê" trên marketplace (yup — báo lỗi sớm; validate thật ở BE).
 * Ngày là `Dayjs` (AntD DatePicker); bắt buộc qua `.test()` để giữ type `Dayjs | null`.
 */
const requiredDate = (message: string) =>
  yup
    .mixed<Dayjs>()
    .nullable()
    .defined()
    .test('required', message, (value) => value != null);

export const requestFormSchema = yup.object({
  customerName: yup.string().trim().required('Nhập họ tên').max(255),
  customerPhone: yup
    .string()
    .trim()
    .required('Nhập số điện thoại')
    .matches(/^(0|\+84)\d{9}$/, 'Số điện thoại không hợp lệ'),
  pickupAt: requiredDate('Chọn thời gian nhận xe'),
  returnAt: requiredDate('Chọn thời gian trả xe').test(
    'after-pickup',
    'Thời gian trả phải sau thời gian nhận',
    (value, ctx) => {
      const pickup = ctx.parent.pickupAt as Dayjs | null;
      return !value || !pickup || value.isAfter(pickup);
    },
  ),
  /** Giao xe tận nơi (Wave 2) — chỉ hiện khi chính sách giao nhận của xe đang bật. */
  deliveryRequested: yup.boolean().default(false),
  deliveryAddress: yup
    .string()
    .trim()
    .max(500, 'Tối đa 500 ký tự')
    .default('')
    .when('deliveryRequested', {
      is: true,
      then: (s) => s.required('Nhập địa điểm giao xe'),
    }),
});

export type RequestFormValues = yup.InferType<typeof requestFormSchema>;
