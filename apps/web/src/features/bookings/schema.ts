import type { Dayjs } from 'dayjs';
import { SERVICE_TYPE, SERVICE_TYPE_VALUES } from '@xeprime/types';
import { moneySchema } from '@xeprime/validators';
import * as yup from 'yup';

/**
 * Schema form tạo/sửa đơn (yup, chạy phía FE để báo lỗi sớm — CLAUDE.md mục 4).
 *
 * Ngày dùng `Dayjs` vì AntD DatePicker trả Dayjs; giữ `nullable` để defaultValues=null hợp lệ,
 * bắt buộc bằng `.test()` thay vì `.required()` (tránh lệch input/output type của yupResolver).
 * Ràng buộc thật (trùng lịch, khoảng thời gian) nằm ở DB — đây chỉ là lớp UX (ADR 0006).
 */
const optionalMoney = moneySchema
  .transform((v, orig) => (orig === '' || orig === null ? null : v))
  .nullable()
  .default(null);

const requiredDate = (message: string) =>
  yup
    .mixed<Dayjs>()
    .nullable()
    .defined()
    .test('required', message, (value) => value != null);

export const bookingFormSchema = yup.object({
  vehicleId: yup.string().required('Chọn xe'),
  customerName: yup.string().trim().required('Nhập tên khách').max(255),
  customerPhone: yup
    .string()
    .trim()
    .default('')
    .matches(/^(0|\+84)\d{9}$/, { message: 'Số điện thoại không hợp lệ', excludeEmptyString: true }),
  serviceType: yup
    .string()
    .oneOf(SERVICE_TYPE_VALUES)
    .default(SERVICE_TYPE.SELF_DRIVE)
    .required('Chọn loại dịch vụ'),
  pickupAt: requiredDate('Chọn thời gian nhận xe'),
  returnAt: requiredDate('Chọn thời gian trả xe').test(
    'after-pickup',
    'Thời gian trả phải sau thời gian nhận',
    (value, ctx) => {
      const pickup = ctx.parent.pickupAt as Dayjs | null;
      return !value || !pickup || value.isAfter(pickup);
    },
  ),
  baseAmount: optionalMoney,
  deliveryFee: optionalMoney,
  discountAmount: optionalMoney,
  depositAmount: optionalMoney,
  note: yup.string().trim().max(2000).default(''),
});

export type BookingFormValues = yup.InferType<typeof bookingFormSchema>;
