/**
 * Yup schema dùng chung cho form frontend.
 *
 * CLAUDE.md mục 4: frontend validate bằng yup, backend validate bằng class-validator.
 * Hai lớp này KHÔNG thay thế nhau — yup để báo lỗi sớm cho người dùng, class-validator là
 * lớp chặn thật. Bỏ lớp backend vì "frontend đã validate rồi" là lỗ bảo mật.
 */
import * as yup from 'yup';
import { VEHICLE_TYPE_VALUES, SERVICE_TYPE_VALUES } from '@xeprime/types';

/** SĐT Việt Nam: 0xxxxxxxxx hoặc +84xxxxxxxxx. */
export const phoneSchema = yup
  .string()
  .trim()
  .matches(/^(0|\+84)\d{9}$/, 'Số điện thoại không hợp lệ');

export const requiredPhoneSchema = phoneSchema.required('Vui lòng nhập số điện thoại');

export const emailSchema = yup.string().trim().email('Email không hợp lệ');

/** Tiền VND: số nguyên không âm. Không dùng float — xem ADR 0007. */
export const moneySchema = yup
  .number()
  .typeError('Vui lòng nhập số')
  .integer('Số tiền phải là số nguyên')
  .min(0, 'Số tiền không được âm');

export const vehicleFormSchema = yup.object({
  code: yup.string().trim().required('Mã xe là bắt buộc').max(80),
  name: yup.string().trim().required('Tên xe là bắt buộc').max(255),
  plateNumber: yup.string().trim().max(50).nullable(),
  vehicleType: yup.string().oneOf(VEHICLE_TYPE_VALUES).required('Chọn loại xe'),
  serviceType: yup.string().oneOf(SERVICE_TYPE_VALUES).required('Chọn loại dịch vụ'),
  seatCount: yup.number().integer().min(1).max(64).nullable(),
  weekdayPrice: moneySchema.nullable(),
  weekendPrice: moneySchema.nullable(),
});

export type VehicleFormValues = yup.InferType<typeof vehicleFormSchema>;

/**
 * Khoảng thuê. Kiểm tra `returnAt > pickupAt` ở đây chỉ để báo lỗi sớm — ràng buộc thật
 * nằm ở CHECK constraint của bảng `bookings` và exclusion constraint của
 * `vehicle_occupancies` (ADR 0006).
 */
export const bookingPeriodSchema = yup.object({
  pickupAt: yup.date().required('Chọn thời gian nhận xe'),
  returnAt: yup
    .date()
    .required('Chọn thời gian trả xe')
    .when('pickupAt', ([pickupAt], schema) =>
      pickupAt instanceof Date
        ? schema.min(pickupAt, 'Thời gian trả phải sau thời gian nhận')
        : schema,
    ),
});

export type BookingPeriodValues = yup.InferType<typeof bookingPeriodSchema>;
