import * as yup from 'yup';
import {
  COLLATERAL_ASSET_TYPE_VALUES,
  COLLATERAL_MODE,
  COLLATERAL_MODE_VALUES,
  LONG_TERM_PACKAGE_MONTHS,
  SERVICE_TYPE,
} from '@xeprime/types';
import { maxDecimalsTest } from '@xeprime/validators';

/**
 * Schema form chính sách thuê (yup — báo lỗi sớm ngay trên ô nhập; validate thật ở BE:
 * PricingService.validatePolicy + class-validator). Giá trị số là `number | null` theo quy ước
 * `NumberField`; bắt buộc khai bằng `.test('required')` để GIỮ kiểu `| null` (cùng thủ pháp với
 * `requestFormSchema` — `.required()` của yup làm InferType lệch với RHF).
 *
 * Ràng buộc chéo (bậc tăng dần, bán kính khớp mốc cuối) kiểm ở đây với ĐÚNG câu chữ server —
 * hai lớp cùng một thông điệp thì người dùng không thấy hai kiểu lỗi khác nhau.
 */

const optionalMoney = (label: string) =>
  yup
    .number()
    .nullable()
    .defined()
    .default(null)
    .integer(`${label} phải là số nguyên VND`)
    .min(0, `${label} không được âm`);

const requiredNumber = (message: string) =>
  yup
    .number()
    .nullable()
    .defined()
    .default(null)
    .test('required', message, (value) => value != null);

/**
 * Khoảng cách giao nhận nhận TỐI ĐA 1 chữ số thập phân — khớp
 * `@IsNumber({ maxDecimalPlaces: 1 })` của `DeliveryTierDto`/`deliveryMaxRadiusKm`. Không có
 * luật này ở đây thì 1.25 km lọt xuống server và quay về thành một toast chung chung.
 */
const KM_DECIMALS = 1;
const KM_DECIMALS_MESSAGE = `Khoảng cách chỉ nhận tối đa ${KM_DECIMALS} chữ số thập phân`;

export const deliveryTierSchema = yup.object({
  toKm: requiredNumber('Nhập mốc "đến" (km)')
    .moreThan(0, 'Mốc khoảng cách phải lớn hơn 0')
    .max(500, 'Tối đa 500 km')
    .test(maxDecimalsTest(KM_DECIMALS, KM_DECIMALS_MESSAGE)),
  fee: optionalMoney('Phí giao nhận'),
});

/**
 * Mốc ưu đãi cấu hình theo THÁNG (17/08 đợt 4 — Mioto: -2% từ 3 tháng): form nhập tháng,
 * lưu xuống API vẫn là `minDays = tháng × 30` (form.ts convert) — máy giá đếm ngày không đổi.
 * Ưu đãi này CHỈ áp cho dịch vụ Thuê dài hạn (luật ở PricingService.buildQuote).
 */
export const discountTierSchema = yup.object({
  // Mốc là một GÓI thuê hợp lệ, không phải số tháng tự do — form dùng Select, schema chặn nốt.
  minMonths: requiredNumber('Chọn mốc gói thuê').oneOf(
    [...LONG_TERM_PACKAGE_MONTHS],
    `Mốc ưu đãi phải là gói ${LONG_TERM_PACKAGE_MONTHS.join(', ')} tháng`,
  ),
  percent: requiredNumber('Nhập mức giảm (%)')
    .integer('Mức giảm phải là số nguyên')
    .min(1, 'Ít nhất 1%')
    .max(100, 'Tối đa 100%'),
  note: yup.string().trim().max(255).defined().default(''),
});

export const policyFormSchema = yup.object({
  /*
   * Ba chế độ bảo đảm LOẠI TRỪ nhau — cùng luật với CHECK `rental_policies_collateral_scope_check`
   * và `PricingService.validatePolicy`. Ba lớp nói cùng một điều để người dùng không gặp hai
   * kiểu thông báo khác nhau cho cùng một sai sót.
   */
  collateralMode: yup
    .string()
    .oneOf([...COLLATERAL_MODE_VALUES])
    .defined()
    .default(COLLATERAL_MODE.CASH),
  collateralAssetTypes: yup
    .array()
    .of(yup.string().oneOf([...COLLATERAL_ASSET_TYPE_VALUES]).defined())
    .defined()
    .default([])
    .when(['collateralMode', '$policyEditable'], {
      is: (mode: string, editable?: boolean) => mode === COLLATERAL_MODE.ASSET && editable !== false,
      then: (s) => s.min(1, 'Chọn ít nhất một loại tài sản nhận thế chấp'),
    }),
  // Chỉ bắt buộc ở chế độ "Cọc tiền"; hai chế độ kia không thu tiền nên ô này biến mất khỏi form.
  depositAmount: optionalMoney('Tiền cọc').when(['collateralMode', '$policyEditable'], {
    is: (mode: string, editable?: boolean) => mode === COLLATERAL_MODE.CASH && editable !== false,
    then: (s) =>
      s
        .test('required', 'Nhập số tiền cọc mặc định', (value) => value != null)
        .moreThan(0, 'Chọn "Cọc tiền" thì số tiền cọc phải lớn hơn 0'),
  }),
  deliveryEnabled: yup.boolean().defined().default(false),
  deliveryMaxRadiusKm: yup
    .number()
    .nullable()
    .defined()
    .default(null)
    .max(500, 'Tối đa 500 km')
    .moreThan(0, 'Giá trị bán kính không thể âm')
    .test(maxDecimalsTest(KM_DECIMALS, KM_DECIMALS_MESSAGE))
    .when(['deliveryEnabled', '$policyEditable'], {
      is: (enabled: boolean, editable?: boolean) => enabled && editable !== false,
      then: (s) => s.test('required', 'Nhập bán kính hỗ trợ tối đa', (value) => value != null),
    }),
  deliveryTiers: yup
    .array()
    .of(deliveryTierSchema)
    .defined()
    .default([])
    .when(['deliveryEnabled', '$policyEditable'], {
      is: (enabled: boolean, editable?: boolean) => enabled && editable !== false,
      then: (s) => s.min(1, 'Bật giao nhận thì phải có ít nhất một bậc khoảng cách'),
    })
    .test('ascending', 'Các mốc khoảng cách phải tăng dần', (tiers) => {
      if (!tiers) return true;
      for (let i = 1; i < tiers.length; i++) {
        const prev = tiers[i - 1]?.toKm;
        const curr = tiers[i]?.toKm;
        if (prev != null && curr != null && curr <= prev) return false;
      }
      return true;
    })
    .test('covers-radius', '', function coversRadius(tiers) {
      const { deliveryEnabled, deliveryMaxRadiusKm } = this.parent as {
        deliveryEnabled: boolean;
        deliveryMaxRadiusKm: number | null;
      };
      if (!deliveryEnabled || !tiers?.length || deliveryMaxRadiusKm == null) return true;
      const last = tiers[tiers.length - 1]?.toKm;
      if (last == null || last === deliveryMaxRadiusKm) return true;
      return this.createError({
        message:
          deliveryMaxRadiusKm > last
            ? `Có khoảng trống cấu hình giữa mốc ${last} km và ${deliveryMaxRadiusKm} km`
            : `Bậc ${last} km vượt quá bán kính hỗ trợ ${deliveryMaxRadiusKm} km`,
      });
    }),
  overtimeFeePerHour: optionalMoney('Phí quá giờ'),
  overtimeGraceMinutes: yup
    .number()
    .nullable()
    .defined()
    .default(null)
    .integer('Số phút phải là số nguyên')
    .min(0, 'Không được âm')
    .max(1440, 'Tối đa 1440 phút'),
  overtimeRoundingMinutes: yup
    .number()
    .nullable()
    .defined()
    .default(null)
    .integer('Số phút phải là số nguyên')
    .min(1, 'Ít nhất 1 phút')
    .max(1440, 'Tối đa 1440 phút'),
  discountEnabled: yup.boolean().defined().default(false),
  discountTiers: yup
    .array()
    .of(discountTierSchema)
    .defined()
    .default([])
    .when(['discountEnabled', '$policyEditable'], {
      is: (enabled: boolean, editable?: boolean) => enabled && editable !== false,
      then: (s) => s.min(1, 'Bật ưu đãi thì phải có ít nhất một mốc giảm giá'),
    })
    .max(LONG_TERM_PACKAGE_MONTHS.length, `Tối đa ${LONG_TERM_PACKAGE_MONTHS.length} mốc ưu đãi`)
    /*
     * Hai luật đi cùng nhau (cùng luật với PricingService.validatePolicy):
     *   - mốc tăng dần, không trùng;
     *   - % KHÔNG được giảm khi thời hạn tăng — cam kết dài hơn mà ưu đãi thấp hơn là nghịch lý
     *     với khách, và vì mốc lấy theo "cao nhất đạt tới" nên nó tạo ra giá thuê lâu = đắt hơn.
     */
    .test('ascending-months', '', function ascendingMonths(tiers) {
      if (!tiers) return true;
      for (let i = 1; i < tiers.length; i++) {
        const prev = tiers[i - 1];
        const curr = tiers[i];
        if (prev?.minMonths == null || curr?.minMonths == null) continue;
        if (curr.minMonths <= prev.minMonths) {
          return this.createError({
            message:
              curr.minMonths === prev.minMonths
                ? `Trùng mốc ưu đãi "${curr.minMonths} tháng"`
                : 'Các mốc ưu đãi phải theo số tháng tăng dần',
          });
        }
        if (curr.percent != null && prev.percent != null && curr.percent < prev.percent) {
          return this.createError({
            message: `Ưu đãi ${curr.minMonths} tháng không được thấp hơn mốc ${prev.minMonths} tháng`,
          });
        }
      }
      return true;
    }),
});

export type PolicyFormValues = yup.InferType<typeof policyFormSchema>;

/**
 * Form giá theo xe = giá ĐỦ các dịch vụ xe đăng + toàn bộ chính sách (khi ghi đè).
 *
 * Giá ngày thường chỉ bắt buộc khi xe đăng TỰ LÁI (`$serviceTypes` truyền qua context của
 * useForm) — xe chỉ chạy có tài xế/dài hạn không bị ép nhập giá tự lái. Giá chuyên biệt còn
 * lại là tuỳ chọn ở đây; điều kiện "đủ giá mới được gửi duyệt public" nằm ở
 * `features/vehicles/publication.ts` (đối xứng backend `missingPublicFields`).
 */
export const vehiclePricingFormSchema = policyFormSchema.shape({
  weekdayPrice: optionalMoney('Giá thuê').when('$serviceTypes', {
    is: (services: readonly string[] | undefined) =>
      !services || services.includes(SERVICE_TYPE.SELF_DRIVE),
    then: (s) => s.test('required', 'Nhập giá thuê theo ngày', (value) => value != null),
  }),
  weekendPrice: optionalMoney('Giá cuối tuần'),
  hourlyPrice: optionalMoney('Giá theo giờ'),
  discountPercent: yup
    .number()
    .nullable()
    .defined()
    .default(null)
    .integer('Mức giảm phải là số nguyên')
    .min(0, 'Mức giảm không được âm')
    .max(100, 'Tối đa 100%'),
  monthlyPrice: optionalMoney('Giá tháng'),
  withDriverDailyPrice: optionalMoney('Giá/ngày có tài xế'),
  withDriverInterCityPrice: optionalMoney('Giá liên tỉnh'),
  withDriverOneWayPrice: optionalMoney('Giá 1 chiều'),
});

export type VehiclePricingFormValues = yup.InferType<typeof vehiclePricingFormSchema>;
