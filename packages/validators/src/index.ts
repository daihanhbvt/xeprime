/**
 * Yup schema dùng chung cho form frontend.
 *
 * CLAUDE.md mục 4: frontend validate bằng yup, backend validate bằng class-validator.
 * Hai lớp này KHÔNG thay thế nhau — yup để báo lỗi sớm cho người dùng, class-validator là
 * lớp chặn thật. Bỏ lớp backend vì "frontend đã validate rồi" là lỗ bảo mật.
 */
import * as yup from 'yup';
import {
  BODY_TYPE_VALUES,
  FUEL_TYPE_VALUES,
  isVehicleFuelTypeAllowed,
  SERVICE_TYPE_VALUES,
  TENANT_TYPE_VALUES,
  TRANSMISSION_TYPE_VALUES,
  VEHICLE_FEATURE_KEYS,
  VEHICLE_FINANCE_INTEREST_METHOD_VALUES,
  VEHICLE_OPERATION_STATUS_VALUES,
  VEHICLE_SOURCE_TYPE_VALUES,
  VEHICLE_TYPE,
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
const optionalPositiveInt = (label: string, max: number) =>
  yup
    .number()
    .transform((v, orig) => (orig === '' || orig === null || orig === undefined ? null : v))
    .typeError(`${label} phải là số`)
    .integer(`${label} phải là số nguyên`)
    .min(1, `${label} phải lớn hơn 0`)
    .max(max, `${label} vượt quá giới hạn cho phép`)
    .nullable()
    .default(null);
const optionalMetric = (label: string) =>
  yup
    .number()
    .transform((v, orig) => (orig === '' || orig === null || orig === undefined ? null : v))
    .typeError(`${label} phải là số`)
    .min(0, `${label} không được âm`)
    .max(999, `${label} vượt quá giới hạn cho phép`)
    .nullable()
    .default(null);

export const vehicleFormSchema = yup.object({
  code: yup.string().trim().max(80).default(''),
  name: yup.string().trim().required('Tên xe là bắt buộc').max(255),
  vehicleType: yup.string().oneOf(VEHICLE_TYPE_VALUES).required('Chọn loại xe'),
  serviceType: yup.string().oneOf(SERVICE_TYPE_VALUES).required('Chọn loại dịch vụ'),
  sourceType: yup.string().oneOf(VEHICLE_SOURCE_TYPE_VALUES).required('Chọn hình thức nguồn xe'),
  operationStatus: yup
    .string()
    .oneOf(VEHICLE_OPERATION_STATUS_VALUES)
    .required('Chọn trạng thái vận hành'),
  plateNumber: optionalText(50),
  brand: optionalText(100),
  model: optionalText(100),
  color: optionalText(80),
  fuelType: yup
    .string()
    .oneOf(FUEL_TYPE_VALUES)
    .nullable()
    .default(null)
    .test(
      'vehicle-fuel-compatible',
      'Nguồn năng lượng không phù hợp với loại phương tiện',
      function compatibleFuel(value) {
        return isVehicleFuelTypeAllowed(String(this.parent.vehicleType ?? ''), value);
      },
    ),
  /** Kiểu dáng thân xe — chỉ có nghĩa với ô tô; đổi sang xe máy thì form tự xoá. */
  bodyType: yup
    .string()
    .oneOf(BODY_TYPE_VALUES)
    .nullable()
    .default(null)
    .test(
      'body-type-car-only',
      'Kiểu dáng thân xe chỉ áp dụng cho ô tô',
      function carBodyTypeOnly(value) {
        return this.parent.vehicleType === VEHICLE_TYPE.CAR || value == null;
      },
    ),
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
  lengthMm: optionalPositiveInt('Chiều dài', 30000),
  widthMm: optionalPositiveInt('Chiều rộng', 10000),
  heightMm: optionalPositiveInt('Chiều cao', 10000),
  curbWeightKg: optionalPositiveInt('Trọng lượng', 100000),
  engineDisplacementCc: optionalPositiveInt('Dung tích động cơ', 30000),
  horsepowerHp: optionalPositiveInt('Công suất', 5000),
  transmission: yup.string().oneOf(TRANSMISSION_TYPE_VALUES).nullable().default(null),
  fuelConsumptionCity: optionalMetric('Mức tiêu thụ trong đô thị'),
  fuelConsumptionHighway: optionalMetric('Mức tiêu thụ ngoài đô thị'),
  fuelConsumptionCombined: optionalMetric('Mức tiêu thụ kết hợp'),
  weekdayPrice: moneySchema
    .transform((v, orig) => (orig === '' || orig === null ? null : v))
    .nullable()
    .default(null),
  weekendPrice: moneySchema
    .transform((v, orig) => (orig === '' || orig === null ? null : v))
    .nullable()
    .default(null),
  /** Giá thuê theo giờ — bỏ trống = xe không cho thuê giờ (tiện ích "Thuê theo giờ"). */
  hourlyPrice: moneySchema
    .transform((v, orig) => (orig === '' || orig === null ? null : v))
    .nullable()
    .default(null),
  deliveryEnabled: yup.boolean().default(false),
  noCollateral: yup.boolean().default(false),
  /** % giảm giá marketing — bỏ trống = không giảm. */
  discountPercent: yup
    .number()
    .transform((v, orig) => (orig === '' || orig === null ? null : v))
    .typeError('% giảm giá phải là số')
    .integer('% giảm giá phải là số nguyên')
    .min(0, 'Tối thiểu 0%')
    .max(100, 'Tối đa 100%')
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
  features: yup.array().of(yup.string().oneOf(VEHICLE_FEATURE_KEYS).required()).default([]),
});

export type VehicleFormValues = yup.InferType<typeof vehicleFormSchema>;

/** Số nguyên VND tuỳ chọn — form nhập number (NumberField), hoá chuỗi khi gửi API (ADR 0007). */
const optionalMoney = yup
  .number()
  .transform((v, orig) => (orig === '' || orig === null || orig === undefined ? null : v))
  .typeError('Vui lòng nhập số')
  .integer('Số tiền phải là số nguyên')
  .min(0, 'Số tiền không được âm')
  .nullable()
  .default(null);

const optionalDate = yup.string().trim().nullable().default(null);

/**
 * Hồ sơ nguồn xe & tài chính (Wave 4) — tab Nguồn xe & tài chính.
 *
 * Bắt buộc-theo-biến-thể khớp REQUIRED_FIELDS ở backend (VehicleSourceService); các trường
 * còn lại tuỳ chọn. Trường lạc biến thể không cần chặn ở đây — form chỉ render trường của
 * biến thể đang chọn và mapper chỉ gửi đúng nhóm đó.
 */
export const vehicleSourceFormSchema = yup.object({
  sourceType: yup.string().oneOf(VEHICLE_SOURCE_TYPE_VALUES).required('Chọn hình thức nguồn xe'),

  // owned — tất cả tuỳ chọn
  purchaseDate: optionalDate,
  purchasePrice: optionalMoney,
  purchasePlace: optionalText(255),

  // financed
  bankName: yup
    .string()
    .trim()
    .max(160)
    .default('')
    .when('sourceType', {
      is: 'financed',
      then: (s) => s.required('Nhập ngân hàng / tổ chức tín dụng'),
    }),
  contractNumber: optionalText(120),
  originalPrincipal: optionalMoney,
  monthlyPrincipal: optionalMoney,
  monthlyInterest: optionalMoney,
  interestRatePercent: yup
    .number()
    .transform((v, orig) => (orig === '' || orig === null || orig === undefined ? null : v))
    .typeError('Lãi suất phải là số')
    .min(0, 'Lãi suất không được âm')
    .max(100, 'Lãi suất tối đa 100%')
    .nullable()
    .default(null),
  termMonths: optionalPositiveInt('Thời hạn vay', 600),
  interestMethod: yup
    .string()
    .oneOf([...VEHICLE_FINANCE_INTEREST_METHOD_VALUES])
    .nullable()
    .default(null),

  // rented + partnership
  ownerName: yup
    .string()
    .trim()
    .max(160)
    .default('')
    .when('sourceType', {
      is: (value: string) => value === 'rented' || value === 'partnership',
      then: (s) => s.required('Nhập tên chủ xe / doanh nghiệp'),
    }),
  ownerPhone: optionalText(30),
  ownerEmail: yup.string().trim().email('Email không hợp lệ').max(160).default(''),
  monthlyRent: optionalMoney.when('sourceType', {
    is: 'rented',
    then: (s) => s.required('Nhập tiền thuê hàng tháng'),
  }),
  commissionPercent: yup
    .number()
    .transform((v, orig) => (orig === '' || orig === null || orig === undefined ? null : v))
    .typeError('Tỷ lệ phải là số')
    .min(0, 'Tỷ lệ tối thiểu 0%')
    .max(100, 'Tỷ lệ tối đa 100%')
    .nullable()
    .default(null)
    .when('sourceType', {
      is: 'partnership',
      then: (s) => s.required('Nhập tỷ lệ chia sẻ doanh thu'),
    }),

  // chung
  paymentDay: optionalPositiveInt('Ngày đến hạn', 31),
  startDate: optionalDate,
  endDate: optionalDate,
  /**
   * Tài liệu đính kèm — chỉ là METADATA server phát: `id` file riêng tư (null với bản ghi
   * legacy Wave 4 chờ tải lên lại). KHÔNG có URL nào trong form state (Wave 4.1).
   */
  contractFiles: yup
    .array()
    .of(
      yup.object({
        id: yup.string().nullable().defined(),
        name: yup.string().required(),
        size: yup.number().nullable().optional(),
        status: yup.string().oneOf(['ready', 'legacy']).required(),
      }),
    )
    .max(10, 'Tối đa 10 tệp hợp đồng')
    .default([]),
  notes: optionalText(4000),
});

export type VehicleSourceFormValues = yup.InferType<typeof vehicleSourceFormSchema>;

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
  name: yup
    .string()
    .trim()
    .required('Tên gian hàng là bắt buộc')
    .min(2, 'Tối thiểu 2 ký tự')
    .max(255),
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
  /** Ảnh bìa trang gian hàng công khai — backend đã nhận sẵn, giờ có UI upload. */
  coverUrl: yup
    .string()
    .trim()
    .transform((v) => (v === '' ? null : v))
    .url('Đường dẫn ảnh bìa không hợp lệ')
    .max(2000)
    .nullable()
    .default(null),
});

export type ShopProfileValues = yup.InferType<typeof shopProfileSchema>;

/**
 * Hồ sơ tài khoản KHÁCH (`PATCH /users/me`) — khác hoàn toàn `shopProfileSchema` ở trên.
 *
 * Chỉ hai trường vì backend chỉ nhận đúng hai: `email`/`phone` là khoá nhận diện, muốn đổi thì
 * phải qua luồng xác thực riêng. Đưa chúng vào form ở đây sẽ là chức năng giả.
 */
export const accountProfileSchema = yup.object({
  displayName: yup
    .string()
    .trim()
    .required('Vui lòng nhập họ tên')
    .max(255, 'Họ tên tối đa 255 ký tự')
    .default(''),
  avatarUrl: yup
    .string()
    .trim()
    .transform((v) => (v === '' ? null : v))
    .url('Đường dẫn ảnh không hợp lệ')
    .max(2000)
    .nullable()
    .default(null),
});

export type AccountProfileValues = yup.InferType<typeof accountProfileSchema>;

export * from './auth';
