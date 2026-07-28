/**
 * Yup schema dùng chung cho form frontend.
 *
 * CLAUDE.md mục 4: frontend validate bằng yup, backend validate bằng class-validator.
 * Hai lớp này KHÔNG thay thế nhau — yup để báo lỗi sớm cho người dùng, class-validator là
 * lớp chặn thật. Bỏ lớp backend vì "frontend đã validate rồi" là lỗ bảo mật.
 */
import * as yup from 'yup';
import {
  FUEL_TYPE_VALUES,
  SERVICE_TYPE_VALUES,
  TENANT_TYPE_VALUES,
  VEHICLE_FEATURE_KEYS,
  VEHICLE_OPERATION_STATUS_VALUES,
  VEHICLE_TYPE_VALUES,
} from '@xeprime/types';

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

/** Đời xe hợp lệ: 1980 → sang năm (xe đời mới ra trước lịch). */
const MIN_VEHICLE_YEAR = 1980;
const MAX_VEHICLE_YEAR = new Date().getFullYear() + 1;

/** Text tuỳ chọn: chuỗi trim, rỗng coi như bỏ trống (map sang undefined khi gửi API). */
const optionalText = (max: number) => yup.string().trim().max(max).default('');

export const vehicleFormSchema = yup.object({
  code: yup.string().trim().required('Mã xe là bắt buộc').max(80),
  name: yup.string().trim().required('Tên xe là bắt buộc').max(255),
  vehicleType: yup.string().oneOf(VEHICLE_TYPE_VALUES).required('Chọn loại xe'),
  serviceType: yup.string().oneOf(SERVICE_TYPE_VALUES).required('Chọn loại dịch vụ'),
  operationStatus: yup
    .string()
    .oneOf(VEHICLE_OPERATION_STATUS_VALUES)
    .required('Chọn trạng thái vận hành'),
  plateNumber: optionalText(50),
  brand: optionalText(100),
  model: optionalText(100),
  color: optionalText(80),
  fuelType: yup.string().oneOf(FUEL_TYPE_VALUES).nullable().default(null),
  manufactureYear: yup
    .number()
    .transform((v, orig) => (orig === '' || orig === null ? null : v))
    .typeError('Đời xe phải là số')
    .integer('Đời xe phải là số nguyên')
    .min(MIN_VEHICLE_YEAR, `Đời xe từ ${MIN_VEHICLE_YEAR}`)
    .max(MAX_VEHICLE_YEAR, `Đời xe tối đa ${MAX_VEHICLE_YEAR}`)
    .nullable()
    .default(null),
  seatCount: yup
    .number()
    .transform((v, orig) => (orig === '' || orig === null ? null : v))
    .typeError('Số chỗ phải là số')
    .integer('Số chỗ phải là số nguyên')
    .min(1, 'Ít nhất 1 chỗ')
    .max(64, 'Tối đa 64 chỗ')
    .nullable()
    .default(null),
  weekdayPrice: moneySchema
    .transform((v, orig) => (orig === '' || orig === null ? null : v))
    .nullable()
    .default(null),
  weekendPrice: moneySchema
    .transform((v, orig) => (orig === '' || orig === null ? null : v))
    .nullable()
    .default(null),
  description: optionalText(4000),
  mainImageUrl: yup
    .string()
    .trim()
    .transform((v) => (v === '' ? null : v))
    .url('Đường dẫn ảnh không hợp lệ')
    .max(2000)
    .nullable()
    .default(null),
  images: yup
    .array()
    .of(yup.string().trim().url('Đường dẫn ảnh không hợp lệ').max(2000).required())
    .max(20, 'Tối đa 20 ảnh')
    .default([]),
  features: yup
    .array()
    .of(yup.string().oneOf(VEHICLE_FEATURE_KEYS).required())
    .default([]),
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

// ---------------------------------------------------------------------------
// Gian hàng (đăng ký + hồ sơ) — Phase 2 duyệt shop
// ---------------------------------------------------------------------------

export const registerShopSchema = yup.object({
  name: yup.string().trim().required('Tên gian hàng là bắt buộc').min(2, 'Tối thiểu 2 ký tự').max(255),
  tenantType: yup.string().oneOf(TENANT_TYPE_VALUES).required('Chọn loại hình'),
  // default('') + excludeEmptyString: bỏ trống là hợp lệ, chỉ validate khi có nhập.
  phone: yup
    .string()
    .trim()
    .default('')
    .matches(/^(0|\+84)\d{9}$/, {
      message: 'Số điện thoại không hợp lệ',
      excludeEmptyString: true,
    }),
  email: yup.string().trim().default('').email('Email không hợp lệ'),
});

export type RegisterShopValues = yup.InferType<typeof registerShopSchema>;

const profileText = (max: number) => yup.string().trim().max(max).default('');

export const shopProfileSchema = yup.object({
  displayName: profileText(255),
  bio: profileText(2000),
  address: profileText(500),
  provinceName: profileText(100),
  taxCode: profileText(50),
  businessLicenseNo: profileText(100),
  bankName: profileText(100),
  bankAccountNo: profileText(100),
  bankAccountName: profileText(255),
  logoUrl: yup
    .string()
    .trim()
    .transform((v) => (v === '' ? null : v))
    .url('Đường dẫn logo không hợp lệ')
    .max(2000)
    .nullable()
    .default(null),
});

export type ShopProfileValues = yup.InferType<typeof shopProfileSchema>;

export * from './auth';
