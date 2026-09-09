import * as yup from 'yup';
import {
  MILEAGE_LIMIT,
  SERVICE_TYPE,
  VEHICLE_OPERATION_STATUS,
  VEHICLE_SOURCE_TYPE,
  VEHICLE_TYPE,
  vehicleEnergySpecPolicy,
} from '@xeprime/types';
import { vehicleFormSchema, type VehicleFormValues } from '@xeprime/validators';

/**
 * Schema của wizard ĐĂNG XE NHANH.
 *
 * Không viết lại luật: nó `pick` đúng các trường wizard nhanh hỏi từ `vehicleFormSchema` (nguồn
 * dùng chung với wizard `/manage` và màn sửa xe), rồi CHỈ bổ sung ràng buộc riêng của luồng này:
 *
 *  1. thông số năng lượng bắt buộc theo `vehicleEnergySpecPolicy` — cùng ma trận mà backend dùng
 *     để dựng checklist lên chợ, nên form không thể nói "đủ" khi server nói "thiếu";
 *  2. cấu hình cho thuê tối thiểu (giá ngày, giảm giá, giao xe, hạn mức km) — các trường này
 *     thuộc CHÍNH SÁCH thuê, không thuộc hồ sơ xe, nên chúng chỉ sống ở schema này.
 *
 * Hai bản Yup lệch nhau là cách chắc chắn nhất để một wizard cho lưu thứ wizard kia từ chối, nên
 * mọi luật về xe phải sửa ở `@xeprime/validators`, không phải ở đây.
 */
const VEHICLE_FIELDS = [
  'vehicleType',
  'name',
  'branchId',
  'plateNumber',
  'brand',
  'model',
  // Mẫu xe chuẩn: wizard nhanh cũng gửi id danh mục như form đầy đủ — không có lý do gì để
  // xe đăng nhanh kém chuẩn hoá hơn xe đăng ở /manage.
  'vehicleCatalogModelId',
  'manufactureYear',
  'seatCount',
  'motorbikeCategory',
  'color',
  'fuelType',
  'transmission',
  'fuelConsumptionCombined',
  'electricRangeKm',
  'batteryCapacityKwh',
  'electricConsumptionKwhPer100Km',
  'engineDisplacementCc',
  'description',
  'features',
  'mainImageUrl',
  'images',
  'weekdayPrice',
  'discountPercent',
] as const satisfies ReadonlyArray<keyof VehicleFormValues>;

const money = (code: string) =>
  yup
    .number()
    .transform((v, orig) => (orig === '' || orig === null || orig === undefined ? null : v))
    .typeError(`${code}TypeError`)
    .integer(`${code}Integer`)
    .min(0, `${code}Min`)
    .nullable()
    .default(null);

export const quickVehicleSchema = vehicleFormSchema.pick(VEHICLE_FIELDS).shape({
  /*
   * Giá ngày thường là thứ DUY NHẤT bắt buộc ở bước cho thuê: xe không có giá thì không lên chợ
   * được, còn mọi cấu hình khác đều có mặc định an toàn (tắt).
   */
  weekdayPrice: money('price').test('required', 'weekdayPriceRequired', (v) => v != null),

  /** Bật/tắt giảm giá — mặc định TẮT. Không có ưu đãi nào tự sinh ra vì ảnh mẫu có một con số. */
  discountEnabled: yup.boolean().defined().default(false),

  /** Nhận chuyến tự động — ghi vào `VehicleServiceSetting` của dịch vụ tự lái. */
  autoAcceptEnabled: yup.boolean().defined().default(false),

  deliveryEnabled: yup.boolean().defined().default(false),
  deliveryFreeWithinKm: yup
    .number()
    .nullable()
    .defined()
    .default(null)
    .min(0, 'deliveryFreeMin')
    .max(500, 'deliveryRadiusMax'),
  deliveryMaxRadiusKm: yup
    .number()
    .nullable()
    .defined()
    .default(null)
    .max(500, 'deliveryRadiusMax')
    .when('deliveryEnabled', {
      is: true,
      then: (s) =>
        s
          .test('required', 'deliveryRadiusRequired', (v) => v != null)
          .moreThan(0, 'deliveryRadiusMin'),
    }),
  deliveryFee: money('deliveryFee').when('deliveryEnabled', {
    is: true,
    then: (s) => s.test('required', 'deliveryFeeRequired', (v) => v != null),
  }),

  mileageLimitEnabled: yup.boolean().defined().default(false),
  includedDistanceKmPerDay: yup
    .number()
    .nullable()
    .defined()
    .default(null)
    .integer('mileageInteger')
    .min(MILEAGE_LIMIT.minKmPerDay, 'mileageMin')
    .max(MILEAGE_LIMIT.maxKmPerDay, 'mileageMax')
    .when('mileageLimitEnabled', {
      is: true,
      then: (s) => s.test('required', 'mileageRequired', (v) => v != null),
    }),
  excessDistanceFeePerKm: money('excessFee')
    .max(MILEAGE_LIMIT.maxFeePerKm, 'excessFeeMax')
    .when('mileageLimitEnabled', {
      is: true,
      then: (s) => s.test('required', 'excessFeeRequired', (v) => v != null),
    }),

  /** Điều khoản riêng của chủ xe — snapshot vào yêu cầu/đơn qua `VehicleServiceSetting`. */
  termsText: yup.string().trim().max(4000, 'termsTooLong').defined().default(''),
});

export type QuickVehicleValues = yup.InferType<typeof quickVehicleSchema>;

/**
 * Thông số năng lượng bắt buộc — kiểm bằng CHÍNH ma trận của backend.
 *
 * Không nhét vào `quickVehicleSchema` bằng `.when()` vì luật phụ thuộc HAI trường (loại xe +
 * nguồn năng lượng) và còn được dùng lại ở checklist trước khi gửi duyệt.
 */
export function missingEnergyFields(values: QuickVehicleValues): Array<keyof QuickVehicleValues> {
  const policy = vehicleEnergySpecPolicy(values.vehicleType, values.fuelType);
  const missing: Array<keyof QuickVehicleValues> = [];
  if (!values.fuelType) missing.push('fuelType');
  if (policy.fuelConsumption === 'required' && values.fuelConsumptionCombined == null) {
    missing.push('fuelConsumptionCombined');
  }
  if (policy.electricRangeKm === 'required' && values.electricRangeKm == null) {
    missing.push('electricRangeKm');
  }
  if (policy.transmission === 'required' && !values.transmission) missing.push('transmission');
  return missing;
}

/** Giá trị mở form — mọi công tắc TẮT, không có con số mẫu nào. */
export const QUICK_VEHICLE_DEFAULTS: QuickVehicleValues = {
  vehicleType: VEHICLE_TYPE.CAR,
  name: '',
  branchId: '',
  plateNumber: '',
  brand: '',
  model: '',
  vehicleCatalogModelId: null,
  manufactureYear: null,
  seatCount: null,
  motorbikeCategory: null,
  color: '',
  fuelType: null,
  transmission: null,
  fuelConsumptionCombined: null,
  electricRangeKm: null,
  batteryCapacityKwh: null,
  electricConsumptionKwhPer100Km: null,
  engineDisplacementCc: null,
  description: '',
  features: [],
  mainImageUrl: null,
  images: [],
  weekdayPrice: null,
  discountPercent: null,
  discountEnabled: false,
  autoAcceptEnabled: false,
  deliveryEnabled: false,
  deliveryFreeWithinKm: null,
  deliveryMaxRadiusKm: null,
  deliveryFee: null,
  mileageLimitEnabled: false,
  includedDistanceKmPerDay: null,
  excessDistanceFeePerKm: null,
  termsText: '',
};

/** Hằng cố định của luồng nhanh — xe tự lái, sẵn sàng, thuộc sở hữu; đổi sau ở `/manage`. */
export const QUICK_VEHICLE_FIXED = {
  serviceTypes: [SERVICE_TYPE.SELF_DRIVE],
  operationStatus: VEHICLE_OPERATION_STATUS.AVAILABLE,
  sourceType: VEHICLE_SOURCE_TYPE.OWNED,
} as const;
