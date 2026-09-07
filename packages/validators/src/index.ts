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
  SOURCE_CONTRACT_MAX_FILES,
  TENANT_TYPE_VALUES,
  TRANSMISSION_TYPE_VALUES,
  VEHICLE_DOCUMENT_PRESET_VALUES,
  VEHICLE_DOCUMENT_TYPE,
  VEHICLE_DOCUMENT_TYPE_VALUES,
  VEHICLE_FEATURE_KEYS,
  VEHICLE_FINANCE_INTEREST_METHOD_VALUES,
  VEHICLE_OPERATION_STATUS_VALUES,
  VEHICLE_SOURCE_TYPE_VALUES,
  VEHICLE_TYPE,
  VEHICLE_TYPE_VALUES,
  VN_PHONE_PATTERN,
} from '@xeprime/types';

export {
  phoneSchema,
  requiredPhoneSchema,
  buildPhoneSchema,
  buildRequiredPhoneSchema,
  type PhoneSchemaLabels,
} from './phone';

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
/**
 * `code` là TIỀN TỐ mã, không phải nhãn hiển thị — `useValidationResolver` tra
 * `Vehicles.form.validation.${code}TypeError` v.v. Chỉ `vehicleFormSchema` dùng hàm này (kiểm
 * bằng grep trước khi sửa); đổi cho schema khác thì phải kiểm lại đúng điều đó.
 */
const optionalPositiveInt = (code: string, max: number) =>
  yup
    .number()
    .transform((v, orig) => (orig === '' || orig === null || orig === undefined ? null : v))
    .typeError(`${code}TypeError`)
    .integer(`${code}Integer`)
    .min(1, `${code}Min`)
    .max(max, `${code}Max`)
    .nullable()
    .default(null);
/**
 * Đếm số chữ số thập phân THẬT của một số, kể cả khi nó được viết ở dạng mũ.
 *
 * `String(1e-7)` cho `'1e-7'` — tách theo dấu chấm sẽ đếm ra 0 chữ số thập phân và để lọt một
 * giá trị mà server từ chối. Nhánh mũ ở đây là lý do hàm này không phải một dòng.
 */
function countDecimals(value: number): number {
  if (!Number.isFinite(value)) return 0;
  const [mantissa, exponent] = String(value).split(/e/i);
  const digits = mantissa?.split('.')[1]?.length ?? 0;
  return exponent ? Math.max(0, digits - Number(exponent)) : digits;
}

/**
 * Luật "tối đa N chữ số thập phân" cho một ô số — dùng làm `.test(maxDecimalsTest(...))`.
 *
 * PHẢI khớp `@IsNumber({ maxDecimalPlaces })` của DTO và phần thập phân của cột `Decimal(p, s)`.
 * Thiếu luật này ở yup thì một giá trị như `1.233` đi lọt tới server, bị trả `VALIDATION_FAILED`,
 * và người dùng chỉ thấy một toast chung chung không chỉ ra được ô nào sai — đúng lớp lỗi mà
 * validate phía client sinh ra để chặn.
 *
 * Trả về mô tả test (không phải một hàm bọc schema) để `.test()` giữ nguyên kiểu suy ra của
 * schema: bọc schema bằng một generic làm mất cờ `.defined()`/`.nullable()` và kéo theo lệch
 * kiểu ở mọi `useForm` dùng nó.
 */
export const maxDecimalsTest = (
  places: number,
  message: string,
): { name: string; message: string; test: (value: number | null | undefined) => boolean } => ({
  name: 'max-decimals',
  message,
  test: (value) => value == null || countDecimals(value) <= places,
});

/**
 * Thông số đo được (mức tiêu thụ nhiên liệu…): 0–999 với TỐI ĐA 2 chữ số thập phân — khớp
 * `@IsNumber({ maxDecimalPlaces: 2 })` ở `vehicle.dto.ts` và cột `Decimal(6, 2)`.
 */
const METRIC_DECIMALS = 2;
/** `code` là tiền tố mã — cùng quy ước với `optionalPositiveInt`, chỉ `vehicleFormSchema` dùng. */
const optionalMetric = (code: string) =>
  yup
    .number()
    .transform((v, orig) => (orig === '' || orig === null || orig === undefined ? null : v))
    .typeError(`${code}TypeError`)
    .min(0, `${code}Min`)
    .max(999, `${code}Max`)
    .test(maxDecimalsTest(METRIC_DECIMALS, `${code}Decimals`))
    .nullable()
    .default(null);

/**
 * Giá theo ngày/giờ/tháng — bản LOCAL của `moneySchema` với message là MÃ.
 *
 * KHÔNG đổi `moneySchema` (export ở trên): nó còn được `apps/web/src/features/bookings/schema.ts`
 * dùng, và màn đó chưa có `useValidationResolver` — đổi message của `moneySchema` sẽ làm màn đó
 * hiện nguyên mã lỗi lên UI.
 */
const vehiclePriceSchema = yup
  .number()
  .typeError('priceTypeError')
  .integer('priceInteger')
  .min(0, 'priceMin');

/*
 * Message của schema này là MÃ — `useValidationResolver` tra `Vehicles.form.validation.*`.
 * Xem docblock `vehicleSourceFormSchema` về quy ước chung; đây là schema thứ hai được dịch.
 *
 * `manufactureYear.max` CÒN CHỮ VIỆT CỨNG có chủ đích: cận trên là `năm hiện tại + 1`, tính lúc
 * CHẠY chứ không phải hằng số — `useValidationResolver` hiện chỉ tra mã tĩnh, chưa truyền tham
 * số động vào message dịch. Sửa đúng cần thêm cơ chế tham số ở cả hai hook; để lại một nợ nhỏ,
 * đã ghi rõ, còn hơn xây cơ chế đó chỉ cho một trường.
 */
export const vehicleFormSchema = yup.object({
  code: yup.string().trim().max(80).default(''),
  name: yup.string().trim().required('nameRequired').max(255),
  /**
   * Chi nhánh giữ xe — BẮT BUỘC. Đây là vị trí công khai của xe trên marketplace, nên không có
   * mặc định ngầm: form chọn sẵn chi nhánh mặc định của gian hàng, người dùng đổi được.
   */
  branchId: yup.string().trim().required('branchRequired'),
  vehicleType: yup.string().oneOf(VEHICLE_TYPE_VALUES).required('vehicleTypeRequired'),
  /** MẢNG dịch vụ xe phục vụ được (17/08) — một xe đăng đồng thời tự lái/có tài xế/dài hạn. */
  serviceTypes: yup
    .array()
    .of(yup.string().oneOf(SERVICE_TYPE_VALUES).required())
    .min(1, 'serviceTypesMin')
    .required('serviceTypesRequired')
    .default([SERVICE_TYPE.SELF_DRIVE]),
  sourceType: yup.string().oneOf(VEHICLE_SOURCE_TYPE_VALUES).required('sourceTypeRequired'),
  operationStatus: yup
    .string()
    .oneOf(VEHICLE_OPERATION_STATUS_VALUES)
    .required('operationStatusRequired'),
  plateNumber: optionalText(50),
  brand: optionalText(100),
  model: optionalText(100),
  color: optionalText(80),
  fuelType: yup
    .string()
    .oneOf(FUEL_TYPE_VALUES)
    .nullable()
    .default(null)
    .test('vehicle-fuel-compatible', 'fuelTypeIncompatible', function compatibleFuel(value) {
      return isVehicleFuelTypeAllowed(String(this.parent.vehicleType ?? ''), value);
    }),
  /** Kiểu dáng thân xe — chỉ có nghĩa với ô tô; đổi sang xe máy thì form tự xoá. */
  bodyType: yup
    .string()
    .oneOf(BODY_TYPE_VALUES)
    .nullable()
    .default(null)
    .test('body-type-car-only', 'bodyTypeCarOnly', function carBodyTypeOnly(value) {
      return this.parent.vehicleType === VEHICLE_TYPE.CAR || value == null;
    }),
  manufactureYear: yup
    .number()
    .transform((v, orig) => (orig === '' || orig === null ? null : v))
    .typeError('yearTypeError')
    .integer('yearInteger')
    .min(MIN_VEHICLE_YEAR, 'yearMin')
    // Xem docblock trên `vehicleFormSchema`: cận trên tính lúc chạy, chưa dịch được bằng mã tĩnh.
    .max(MAX_VEHICLE_YEAR, `Đời xe tối đa ${MAX_VEHICLE_YEAR}`)
    .nullable()
    .default(null),
  seatCount: yup
    .number()
    .transform((v, orig) => (orig === '' || orig === null ? null : v))
    .typeError('seatCountTypeError')
    .integer('seatCountInteger')
    .min(1, 'seatCountMin')
    .max(64, 'seatCountMax')
    .nullable()
    .default(null),
  lengthMm: optionalPositiveInt('lengthMm', 30000),
  widthMm: optionalPositiveInt('widthMm', 10000),
  heightMm: optionalPositiveInt('heightMm', 10000),
  curbWeightKg: optionalPositiveInt('curbWeightKg', 100000),
  engineDisplacementCc: optionalPositiveInt('engineDisplacementCc', 30000),
  horsepowerHp: optionalPositiveInt('horsepowerHp', 5000),
  transmission: yup.string().oneOf(TRANSMISSION_TYPE_VALUES).nullable().default(null),
  fuelConsumptionCity: optionalMetric('fuelConsumptionCity'),
  fuelConsumptionHighway: optionalMetric('fuelConsumptionHighway'),
  fuelConsumptionCombined: optionalMetric('fuelConsumptionCombined'),
  weekdayPrice: vehiclePriceSchema
    .transform((v, orig) => (orig === '' || orig === null ? null : v))
    .nullable()
    .default(null),
  weekendPrice: vehiclePriceSchema
    .transform((v, orig) => (orig === '' || orig === null ? null : v))
    .nullable()
    .default(null),
  /** Giá thuê theo giờ — bỏ trống = xe không cho thuê giờ (tiện ích "Thuê theo giờ"). */
  hourlyPrice: vehiclePriceSchema
    .transform((v, orig) => (orig === '' || orig === null ? null : v))
    .nullable()
    .default(null),
  /** Giá tháng tham chiếu thuê dài hạn — chỉ có nghĩa khi serviceTypes chứa long_term. */
  monthlyPrice: vehiclePriceSchema
    .transform((v, orig) => (orig === '' || orig === null ? null : v))
    .nullable()
    .default(null),
  /** Giá/ngày đã gồm tài xế (nội thành/cơ bản) — chỉ có nghĩa khi serviceTypes chứa with_driver. */
  withDriverDailyPrice: vehiclePriceSchema
    .transform((v, orig) => (orig === '' || orig === null ? null : v))
    .nullable()
    .default(null),
  /** Giá/ngày có tài xế lộ trình liên tỉnh (khứ hồi) — bỏ trống = rơi về giá cơ bản. */
  withDriverInterCityPrice: vehiclePriceSchema
    .transform((v, orig) => (orig === '' || orig === null ? null : v))
    .nullable()
    .default(null),
  /** Giá/ngày có tài xế lộ trình liên tỉnh 1 chiều — bỏ trống = fallback liên tỉnh → cơ bản. */
  withDriverOneWayPrice: vehiclePriceSchema
    .transform((v, orig) => (orig === '' || orig === null ? null : v))
    .nullable()
    .default(null),
  deliveryEnabled: yup.boolean().default(false),
  /** % giảm giá marketing — bỏ trống = không giảm. */
  discountPercent: yup
    .number()
    .transform((v, orig) => (orig === '' || orig === null ? null : v))
    .typeError('discountPercentTypeError')
    .integer('discountPercentInteger')
    .min(0, 'discountPercentMin')
    .max(100, 'discountPercentMax')
    .nullable()
    .default(null),
  description: optionalText(4000),
  mainImageUrl: yup
    .string()
    .trim()
    .transform((v) => (v === '' ? null : v))
    .url('mainImageUrlInvalid')
    .max(2000)
    .nullable()
    .default(null),
  images: yup
    .array()
    .of(yup.string().trim().url('imageUrlInvalid').max(2000).required())
    .max(20, 'imagesMax')
    .default([]),
  features: yup.array().of(yup.string().oneOf(VEHICLE_FEATURE_KEYS).required()).default([]),
});

export type VehicleFormValues = yup.InferType<typeof vehicleFormSchema>;

/**
 * Số nguyên VND tuỳ chọn — form nhập number (NumberField), hoá chuỗi khi gửi API (ADR 0007).
 *
 * Chỉ `vehicleSourceFormSchema` dùng hàm này (kiểm bằng grep trước khi sửa) — message ở đây là
 * MÃ để `useValidationResolver` tra `Vehicles.source.validation.*`, không phải chữ hiển thị
 * thẳng. Đổi hàm này cho schema khác thì phải kiểm lại đúng điều đó, nếu không màn kia sẽ hiện
 * nguyên mã lỗi lên UI.
 */
const optionalMoney = yup
  .number()
  .transform((v, orig) => (orig === '' || orig === null || orig === undefined ? null : v))
  .typeError('moneyTypeError')
  .integer('moneyInteger')
  .min(0, 'moneyMin')
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
/*
 * Message của schema này là MÃ, không phải chữ hiển thị — `useValidationResolver` (bản web ở
 * `apps/web/src/i18n`, bản app ở `apps/mobile/src/i18n`) tra ra chữ thật ở
 * `Vehicles.source.validation.*` trước khi react-hook-form thấy `fieldState.error`. Đây là
 * schema DUY NHẤT đã được dịch — mọi schema khác trong file này vẫn còn chữ Việt cứng, nợ chung
 * chưa trả (xem `docs/mobile-vehicle-module-status.md`).
 *
 * `termMonths`/`paymentDay` KHÔNG dùng `optionalPositiveInt` như các schema khác: hàm đó ghép
 * nhãn tiếng Việt thẳng vào message (`` `${label} phải là số` ``) nên không tra mã được — viết
 * riêng bốn dòng ở đây rẻ hơn nhiều so với đổi một hàm dùng chung bởi `vehicleFormSchema`.
 */
export const vehicleSourceFormSchema = yup.object({
  sourceType: yup.string().oneOf(VEHICLE_SOURCE_TYPE_VALUES).required('sourceTypeRequired'),

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
      then: (s) => s.required('bankNameRequired'),
    }),
  contractNumber: optionalText(120),
  originalPrincipal: optionalMoney,
  monthlyPrincipal: optionalMoney,
  monthlyInterest: optionalMoney,
  interestRatePercent: yup
    .number()
    .transform((v, orig) => (orig === '' || orig === null || orig === undefined ? null : v))
    .typeError('interestRateTypeError')
    .min(0, 'interestRateMin')
    .max(100, 'interestRateMax')
    .nullable()
    .default(null),
  termMonths: yup
    .number()
    .transform((v, orig) => (orig === '' || orig === null || orig === undefined ? null : v))
    .typeError('termMonthsTypeError')
    .integer('termMonthsInteger')
    .min(1, 'termMonthsMin')
    .max(600, 'termMonthsMax')
    .nullable()
    .default(null),
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
      then: (s) => s.required('ownerNameRequired'),
    }),
  ownerPhone: optionalText(30),
  ownerEmail: yup.string().trim().email('ownerEmailInvalid').max(160).default(''),
  monthlyRent: optionalMoney.when('sourceType', {
    is: 'rented',
    then: (s) => s.required('monthlyRentRequired'),
  }),
  commissionPercent: yup
    .number()
    .transform((v, orig) => (orig === '' || orig === null || orig === undefined ? null : v))
    .typeError('commissionTypeError')
    .min(0, 'commissionMin')
    .max(100, 'commissionMax')
    .nullable()
    .default(null)
    .when('sourceType', {
      is: 'partnership',
      then: (s) => s.required('commissionRequired'),
    }),

  // chung
  paymentDay: yup
    .number()
    .transform((v, orig) => (orig === '' || orig === null || orig === undefined ? null : v))
    .typeError('paymentDayTypeError')
    .integer('paymentDayInteger')
    .min(1, 'paymentDayMin')
    .max(31, 'paymentDayMax')
    .nullable()
    .default(null),
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
    .max(SOURCE_CONTRACT_MAX_FILES, 'contractFilesMax')
    .default([]),
  notes: optionalText(4000),
});

export type VehicleSourceFormValues = yup.InferType<typeof vehicleSourceFormSchema>;

/**
 * Metadata giấy tờ xe (Wave 5) — nhập tay hoặc chỉnh sau OCR. Mọi trường tuỳ chọn
 * (giấy tờ không bắt buộc); ràng buộc ngày ở backend là lớp chặn thật.
 */
/*
 * Message của hai schema dưới đây là MÃ, tra `Vehicles.documents.validation.*` — cùng quy ước
 * `useValidationResolver`, xem docblock `vehicleSourceFormSchema`.
 */
export const vehicleDocumentFormSchema = yup.object({
  type: yup.string().oneOf(VEHICLE_DOCUMENT_TYPE_VALUES).required('documentTypeRequired'),
  customTypeName: yup
    .string()
    .trim()
    .max(160)
    .default('')
    .when('type', { is: 'other', then: (s) => s.required('customTypeNameRequired') }),
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

/**
 * Form "Thêm loại giấy tờ" — CHỈ chọn loại (+ tên tự đặt) và đính kèm ảnh/file.
 *
 * Cố ý KHÔNG có metadata (biển số, số khung, ngày cấp…): lúc thêm, người dùng đang cầm tờ giấy
 * chứ chưa đọc nó. Các trường đó nhập sau ở màn chi tiết, hoặc để OCR điền.
 *
 * `preset` nhận một mã trong `VEHICLE_DOCUMENT_PRESET`, hoặc `other` nghĩa là "tự đặt tên" —
 * dùng lại đúng hằng số loại giấy tờ thay vì bịa thêm một sentinel, và nó không thể trùng mã
 * preset nào.
 */
export const vehicleDocumentCreateSchema = yup.object({
  preset: yup
    .string()
    .defined()
    .default('')
    .oneOf([...VEHICLE_DOCUMENT_PRESET_VALUES, VEHICLE_DOCUMENT_TYPE.OTHER, ''], 'presetInvalid')
    .test('required', 'documentTypeRequired', (value) => Boolean(value)),
  customTypeName: yup
    .string()
    .trim()
    .defined()
    .default('')
    .max(160, 'customTypeNameMax')
    .when('preset', {
      is: VEHICLE_DOCUMENT_TYPE.OTHER,
      then: (s) =>
        s.test('required', 'customTypeNameRequired', (value) => Boolean(value?.trim())),
    }),
});

export type VehicleDocumentCreateValues = yup.InferType<typeof vehicleDocumentCreateSchema>;

// ---------------------------------------------------------------------------
// Bảo dưỡng & KM (Wave 6) — docs/design/12 §9
// ---------------------------------------------------------------------------

/**
 * Số KM: nguyên, không âm, trong trần vận hành. Backend + CHECK ở DB là lớp chặn thật.
 *
 * Message là MÃ — `useValidationResolver` tra `Maintenance.validation.*` (web) /
 * `Vehicles.maintenance.validation.*` (app), hai namespace riêng vì hai bên đang đặt UI bảo
 * dưỡng ở hai chỗ khác nhau (nợ gộp namespace ghi ở `docs/mobile-vehicle-module-status.md`).
 * Dùng chung cho `maintenanceProfileFormSchema`, `odometerCorrectionFormSchema`,
 * `maintenanceRecordFields` — cả ba đều được dịch trong đợt này nên đổi an toàn.
 */
const odometerKmSchema = yup
  .number()
  .transform((v, orig) => (orig === '' || orig === null || orig === undefined ? null : v))
  .typeError('odometerTypeError')
  .integer('odometerInteger')
  .min(0, 'odometerMin')
  .max(ODOMETER_MAX_KM, 'odometerMax');

export const maintenanceProfileFormSchema = yup.object({
  oilChangeIntervalKm: yup
    .number()
    .transform((v, orig) => (orig === '' || orig === null || orig === undefined ? null : v))
    .typeError('oilIntervalTypeError')
    .integer('oilIntervalInteger')
    .min(1, 'oilIntervalMin')
    .max(1_000_000, 'oilIntervalMax')
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
  odometerKm: odometerKmSchema.required('odometerRequired'),
  reasonCode: yup.string().oneOf(ODOMETER_CORRECTION_REASON_VALUES).required('reasonCodeRequired'),
  reason: yup
    .string()
    .trim()
    .required('reasonRequired')
    .min(3, 'reasonMin')
    .max(1000, 'reasonMax'),
});

export type OdometerCorrectionFormValues = yup.InferType<typeof odometerCorrectionFormSchema>;

/**
 * Chi phí phiếu bảo dưỡng — bản LOCAL của `moneySchema` với message là MÃ.
 *
 * KHÔNG đổi `moneySchema` (export ở trên): nó còn được `apps/web/src/features/bookings/schema.ts`
 * dùng, màn đó chưa có `useValidationResolver`.
 */
const maintenanceCostSchema = yup.number().typeError('costTypeError').integer('costInteger').min(0, 'costMin');

/**
 * Các mảnh dùng chung của form phiếu bảo dưỡng.
 *
 * Schema đầy đủ nằm ở `apps/web/src/features/vehicle-maintenance` vì hai mốc thời gian giữ
 * kiểu `Dayjs` (đúng hợp đồng của `DateTimeField`: component KHÔNG tự serialize để không làm
 * lệch múi giờ ở mọi form), mà package này cố ý không phụ thuộc `dayjs` — cùng lý do khiến
 * schema banner cũng sống cạnh component của nó.
 */
export const maintenanceRecordFields = {
  type: yup.string().oneOf(MAINTENANCE_TYPE_VALUES).required('recordTypeRequired'),
  customTypeName: yup
    .string()
    .trim()
    .max(160)
    .default('')
    .when('type', { is: 'other', then: (s) => s.required('recordCustomTypeNameRequired') }),
  title: optionalText(255),
  odometerKm: odometerKmSchema.nullable().default(null),
  providerName: optionalText(255),
  cost: maintenanceCostSchema.nullable().default(null),
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

/*
 * Message là MÃ — `useValidationResolver` tra `ShopOnboarding.validation.*` (chỉ web dùng
 * schema này; app chưa có màn đăng ký gian hàng).
 */
export const registerShopSchema = yup.object({
  name: yup.string().trim().required('nameRequired').min(2, 'nameMin').max(255),
  tenantType: yup.string().oneOf(TENANT_TYPE_VALUES).required('tenantTypeRequired'),
  /**
   * Tỉnh/thành là BẮT BUỘC: đăng ký gian hàng tạo luôn chi nhánh mặc định, và chi nhánh đó là
   * nguồn vị trí công khai của mọi xe sau này. Giá trị là MÃ 2 ký tự lấy từ `GET /provinces` —
   * KHÔNG kiểm theo danh sách cứng ở đây, backend mới là nơi biết tỉnh nào đang mở.
   */
  provinceCode: yup.string().trim().required('provinceRequired').length(2, 'provinceInvalid'),
  address: yup.string().trim().max(500).default(''),
  // default('') + excludeEmptyString: bỏ trống là hợp lệ, chỉ validate khi có nhập.
  phone: yup
    .string()
    .trim()
    .default('')
    .matches(VN_PHONE_PATTERN, { message: 'phoneInvalid', excludeEmptyString: true }),
  email: yup.string().trim().default('').email('emailInvalid'),
});

export type RegisterShopValues = yup.InferType<typeof registerShopSchema>;

/**
 * Form thêm/sửa chi nhánh. Dùng chung cho cả hai vì hai màn nhập ĐÚNG cùng một bộ trường —
 * trạng thái/mặc định đi bằng endpoint riêng, không phải input của form.
 */
/** Message là MÃ — `useValidationResolver` tra `Branches.validation.*` (chỉ web có màn chi nhánh). */
export const branchFormSchema = yup.object({
  name: yup.string().trim().required('nameRequired').min(2, 'nameMin').max(255),
  provinceCode: yup.string().trim().required('provinceRequired').length(2, 'provinceInvalid'),
  address: yup.string().trim().max(500).default(''),
  phone: yup
    .string()
    .trim()
    .default('')
    .matches(VN_PHONE_PATTERN, { message: 'phoneInvalid', excludeEmptyString: true }),
});

export type BranchFormValues = yup.InferType<typeof branchFormSchema>;

const profileText = (max: number) => yup.string().trim().max(max).default('');

/** Message là MÃ — `useValidationResolver` tra `Shop.validation.*` (chỉ web có màn hồ sơ gian hàng). */
export const shopProfileSchema = yup.object({
  displayName: yup.string().trim().required('displayNameRequired').max(255).default(''),
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
    .required('provinceRequired')
    .length(2, 'provinceInvalid')
    .default(''),
  /**
   * Chủ gian hàng — dữ liệu NỘI BỘ cho đội ngũ XePrime, không hiện cho khách. Họ tên + SĐT là bắt
   * buộc vì hồ sơ duyệt phải liên hệ được với một người thật; email để trống được, do một phần
   * chủ shop chỉ đăng nhập bằng SĐT (passwordless) và không có email nào để khai.
   */
  ownerFullName: yup.string().trim().required('ownerFullNameRequired').max(255).default(''),
  ownerPhone: yup
    .string()
    .trim()
    .required('ownerPhoneRequired')
    .matches(VN_PHONE_PATTERN, { message: 'ownerPhoneInvalid' })
    .default(''),
  ownerEmail: yup.string().trim().default('').email('ownerEmailInvalid'),
  taxCode: profileText(50),
  businessLicenseNo: profileText(100),
  bankName: profileText(100),
  bankAccountNo: profileText(100),
  bankAccountName: profileText(255),
  logoUrl: yup
    .string()
    .trim()
    .transform((v) => (v === '' ? null : v))
    .url('logoUrlInvalid')
    .max(2000)
    .nullable()
    .default(null),
  /** Ảnh bìa trang gian hàng công khai — backend đã nhận sẵn, giờ có UI upload. */
  coverUrl: yup
    .string()
    .trim()
    .transform((v) => (v === '' ? null : v))
    .url('coverUrlInvalid')
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
/** Message là MÃ — `useValidationResolver` tra `Account.validation.*` (chỉ web có màn này). */
export const accountProfileSchema = yup.object({
  displayName: yup
    .string()
    .trim()
    .required('displayNameRequired')
    .max(255, 'displayNameMax')
    .default(''),
  avatarUrl: yup
    .string()
    .trim()
    .transform((v) => (v === '' ? null : v))
    .url('avatarUrlInvalid')
    .max(2000)
    .nullable()
    .default(null),
});

export type AccountProfileValues = yup.InferType<typeof accountProfileSchema>;

export * from './auth';
