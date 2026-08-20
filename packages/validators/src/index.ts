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
  MAINTENANCE_TYPE_VALUES,
  ODOMETER_CORRECTION_REASON_VALUES,
  ODOMETER_MAX_KM,
  SERVICE_TYPE,
  SERVICE_TYPE_VALUES,
  TENANT_TYPE_VALUES,
  TRANSMISSION_TYPE_VALUES,
  VEHICLE_DOCUMENT_TYPE_VALUES,
  VEHICLE_FEATURE_KEYS,
  VEHICLE_FINANCE_INTEREST_METHOD_VALUES,
  VEHICLE_OPERATION_STATUS_VALUES,
  VEHICLE_SOURCE_TYPE_VALUES,
  VEHICLE_TYPE,
  VEHICLE_TYPE_VALUES,
  VN_PHONE_PATTERN,
} from '@xeprime/types';

export { phoneSchema, requiredPhoneSchema } from './phone';

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
  /**
   * Chi nhánh giữ xe — BẮT BUỘC. Đây là vị trí công khai của xe trên marketplace, nên không có
   * mặc định ngầm: form chọn sẵn chi nhánh mặc định của gian hàng, người dùng đổi được.
   */
  branchId: yup.string().trim().required('Chọn chi nhánh giữ xe'),
  vehicleType: yup.string().oneOf(VEHICLE_TYPE_VALUES).required('Chọn loại xe'),
  /** MẢNG dịch vụ xe phục vụ được (17/08) — một xe đăng đồng thời tự lái/có tài xế/dài hạn. */
  serviceTypes: yup
    .array()
    .of(yup.string().oneOf(SERVICE_TYPE_VALUES).required())
    .min(1, 'Chọn ít nhất một loại dịch vụ')
    .required('Chọn loại dịch vụ')
    .default([SERVICE_TYPE.SELF_DRIVE]),
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
  /** Giá tháng tham chiếu thuê dài hạn — chỉ có nghĩa khi serviceTypes chứa long_term. */
  monthlyPrice: moneySchema
    .transform((v, orig) => (orig === '' || orig === null ? null : v))
    .nullable()
    .default(null),
  /** Giá/ngày đã gồm tài xế (nội thành/cơ bản) — chỉ có nghĩa khi serviceTypes chứa with_driver. */
  withDriverDailyPrice: moneySchema
    .transform((v, orig) => (orig === '' || orig === null ? null : v))
    .nullable()
    .default(null),
  /** Giá/ngày có tài xế lộ trình liên tỉnh (khứ hồi) — bỏ trống = rơi về giá cơ bản. */
  withDriverInterCityPrice: moneySchema
    .transform((v, orig) => (orig === '' || orig === null ? null : v))
    .nullable()
    .default(null),
  /** Giá/ngày có tài xế lộ trình liên tỉnh 1 chiều — bỏ trống = fallback liên tỉnh → cơ bản. */
  withDriverOneWayPrice: moneySchema
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
 * Metadata giấy tờ xe (Wave 5) — nhập tay hoặc chỉnh sau OCR. Mọi trường tuỳ chọn
 * (giấy tờ không bắt buộc); ràng buộc ngày ở backend là lớp chặn thật.
 */
export const vehicleDocumentFormSchema = yup.object({
  type: yup.string().oneOf(VEHICLE_DOCUMENT_TYPE_VALUES).required('Chọn loại giấy tờ'),
  customTypeName: yup
    .string()
    .trim()
    .max(160)
    .default('')
    .when('type', { is: 'other', then: (s) => s.required('Nhập tên loại giấy tờ') }),
  documentNumber: optionalText(120),
  holderName: optionalText(160),
  holderAddress: optionalText(255),
  plateNumber: optionalText(50),
  chassisNumber: optionalText(80),
  engineNumber: optionalText(80),
  issuedAt: optionalDate,
  expiresAt: optionalDate,
  notes: optionalText(4000),
});

export type VehicleDocumentFormValues = yup.InferType<typeof vehicleDocumentFormSchema>;

// ---------------------------------------------------------------------------
// Bảo dưỡng & KM (Wave 6) — docs/design/12 §9
// ---------------------------------------------------------------------------

/** Số KM: nguyên, không âm, trong trần vận hành. Backend + CHECK ở DB là lớp chặn thật. */
const odometerKmSchema = yup
  .number()
  .transform((v, orig) => (orig === '' || orig === null || orig === undefined ? null : v))
  .typeError('Số KM phải là số')
  .integer('Số KM phải là số nguyên')
  .min(0, 'Số KM không được âm')
  .max(ODOMETER_MAX_KM, 'Số KM vượt quá giới hạn cho phép');

export const maintenanceProfileFormSchema = yup.object({
  oilChangeIntervalKm: yup
    .number()
    .transform((v, orig) => (orig === '' || orig === null || orig === undefined ? null : v))
    .typeError('Chu kỳ phải là số')
    .integer('Chu kỳ phải là số nguyên')
    .min(1, 'Chu kỳ phải lớn hơn 0')
    .max(1_000_000, 'Chu kỳ vượt quá giới hạn cho phép')
    .nullable()
    .default(null),
  lastServiceKm: odometerKmSchema.nullable().default(null),
  lastServiceAt: optionalDate,
  notes: optionalText(2000),
});

export type MaintenanceProfileFormValues = yup.InferType<typeof maintenanceProfileFormSchema>;

/**
 * Điều chỉnh KM thủ công. Lý do là BẮT BUỘC ở cả ba lớp (form, DTO backend, CHECK ở DB) —
 * một số KM đổi mà không ai biết vì sao là thứ không được phép tồn tại (§9.1).
 */
export const odometerCorrectionFormSchema = yup.object({
  odometerKm: odometerKmSchema.required('Nhập số KM mới'),
  reasonCode: yup
    .string()
    .oneOf(ODOMETER_CORRECTION_REASON_VALUES)
    .required('Chọn lý do điều chỉnh'),
  reason: yup
    .string()
    .trim()
    .required('Nhập lý do chi tiết')
    .min(3, 'Lý do quá ngắn')
    .max(1000, 'Lý do tối đa 1000 ký tự'),
});

export type OdometerCorrectionFormValues = yup.InferType<typeof odometerCorrectionFormSchema>;

/**
 * Các mảnh dùng chung của form phiếu bảo dưỡng.
 *
 * Schema đầy đủ nằm ở `apps/web/src/features/vehicle-maintenance` vì hai mốc thời gian giữ
 * kiểu `Dayjs` (đúng hợp đồng của `DateTimeField`: component KHÔNG tự serialize để không làm
 * lệch múi giờ ở mọi form), mà package này cố ý không phụ thuộc `dayjs` — cùng lý do khiến
 * schema banner cũng sống cạnh component của nó.
 */
export const maintenanceRecordFields = {
  type: yup.string().oneOf(MAINTENANCE_TYPE_VALUES).required('Chọn loại bảo dưỡng'),
  customTypeName: yup
    .string()
    .trim()
    .max(160)
    .default('')
    .when('type', { is: 'other', then: (s) => s.required('Nhập tên hạng mục') }),
  title: optionalText(255),
  odometerKm: odometerKmSchema.nullable().default(null),
  providerName: optionalText(255),
  cost: moneySchema.nullable().default(null),
  receiptCode: optionalText(100),
  notes: optionalText(2000),
};

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

/**
 * Biến thể có SÀN thời lượng (ngày) — thuê dài hạn dùng `LONG_TERM_MIN_DAYS`. Đếm ngày theo
 * đúng công thức backend (`ceil(Δ/24h)`) để hai tầng không bao giờ lệch nhau về ranh giới.
 */
export const bookingPeriodMinDaysSchema = (minDays: number) =>
  bookingPeriodSchema.shape({
    returnAt: yup
      .date()
      .required('Chọn thời gian trả xe')
      .when('pickupAt', ([pickupAt], schema) =>
        pickupAt instanceof Date
          ? schema.test(
              'min-rental-days',
              `Thời gian thuê tối thiểu ${minDays} ngày`,
              (returnAt) =>
                returnAt instanceof Date &&
                Math.ceil((returnAt.getTime() - pickupAt.getTime()) / 86_400_000) >= minDays,
            )
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
  /**
   * Tỉnh/thành là BẮT BUỘC: đăng ký gian hàng tạo luôn chi nhánh mặc định, và chi nhánh đó là
   * nguồn vị trí công khai của mọi xe sau này. Giá trị là MÃ 2 ký tự lấy từ `GET /provinces` —
   * KHÔNG kiểm theo danh sách cứng ở đây, backend mới là nơi biết tỉnh nào đang mở.
   */
  provinceCode: yup
    .string()
    .trim()
    .required('Chọn tỉnh/thành nơi đặt gian hàng')
    .length(2, 'Mã tỉnh không hợp lệ'),
  address: yup.string().trim().max(500).default(''),
  // default('') + excludeEmptyString: bỏ trống là hợp lệ, chỉ validate khi có nhập.
  phone: yup
    .string()
    .trim()
    .default('')
    .matches(VN_PHONE_PATTERN, {
      message: 'Số điện thoại không hợp lệ',
      excludeEmptyString: true,
    }),
  email: yup.string().trim().default('').email('Email không hợp lệ'),
});

export type RegisterShopValues = yup.InferType<typeof registerShopSchema>;

/**
 * Form thêm/sửa chi nhánh. Dùng chung cho cả hai vì hai màn nhập ĐÚNG cùng một bộ trường —
 * trạng thái/mặc định đi bằng endpoint riêng, không phải input của form.
 */
export const branchFormSchema = yup.object({
  name: yup
    .string()
    .trim()
    .required('Tên chi nhánh là bắt buộc')
    .min(2, 'Tối thiểu 2 ký tự')
    .max(255),
  provinceCode: yup
    .string()
    .trim()
    .required('Chọn tỉnh/thành của chi nhánh')
    .length(2, 'Mã tỉnh không hợp lệ'),
  address: yup.string().trim().max(500).default(''),
  phone: yup
    .string()
    .trim()
    .default('')
    .matches(VN_PHONE_PATTERN, {
      message: 'Số điện thoại không hợp lệ',
      excludeEmptyString: true,
    }),
});

export type BranchFormValues = yup.InferType<typeof branchFormSchema>;

const profileText = (max: number) => yup.string().trim().max(max).default('');

export const shopProfileSchema = yup.object({
  displayName: yup
    .string()
    .trim()
    .required('Tên hiển thị là bắt buộc')
    .max(255)
    .default(''),
  bio: profileText(2000),
  address: profileText(500),
  /**
   * MÃ tỉnh, không phải tên — và nó là tỉnh của CHI NHÁNH MẶC ĐỊNH (backend chuyển tiếp cho
   * `BranchesService`), nên đổi ở đây là dời vị trí công khai của mọi xe thuộc chi nhánh đó.
   *
   * Bắt buộc vì mọi gian hàng đều đã có một tỉnh từ lúc đăng ký; ô trống chỉ xảy ra với hồ sơ cũ
   * mà migration chi nhánh không quy được địa danh — đúng những hồ sơ cần người chọn lại.
   */
  provinceCode: yup
    .string()
    .trim()
    .required('Chọn tỉnh/thành của gian hàng')
    .length(2, 'Mã tỉnh không hợp lệ')
    .default(''),
  /**
   * Chủ gian hàng — dữ liệu NỘI BỘ cho đội ngũ XePrime, không hiện cho khách. Họ tên + SĐT là bắt
   * buộc vì hồ sơ duyệt phải liên hệ được với một người thật; email để trống được, do một phần
   * chủ shop chỉ đăng nhập bằng SĐT (passwordless) và không có email nào để khai.
   */
  ownerFullName: yup
    .string()
    .trim()
    .required('Họ tên chủ gian hàng là bắt buộc')
    .max(255)
    .default(''),
  ownerPhone: yup
    .string()
    .trim()
    .required('Số điện thoại chủ gian hàng là bắt buộc')
    .matches(VN_PHONE_PATTERN, { message: 'Số điện thoại không hợp lệ' })
    .default(''),
  ownerEmail: yup.string().trim().default('').email('Email không hợp lệ'),
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
