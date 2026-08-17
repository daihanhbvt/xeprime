import * as yup from 'yup';
import { SERVICE_TYPE } from '@xeprime/types';

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

export const deliveryTierSchema = yup.object({
  toKm: requiredNumber('Nhập mốc "đến" (km)')
    .moreThan(0, 'Mốc khoảng cách phải lớn hơn 0')
    .max(500, 'Tối đa 500 km'),
  fee: optionalMoney('Phí giao nhận'),
});

export const discountTierSchema = yup.object({
  minDays: requiredNumber('Nhập số ngày tối thiểu')
    .integer('Số ngày phải là số nguyên')
    .min(1, 'Ít nhất 1 ngày')
    .max(365, 'Tối đa 365 ngày'),
  percent: requiredNumber('Nhập mức giảm (%)')
    .integer('Mức giảm phải là số nguyên')
    .min(1, 'Ít nhất 1%')
    .max(100, 'Tối đa 100%'),
  note: yup.string().trim().max(255).defined().default(''),
});

export const policyFormSchema = yup.object({
  depositAmount: optionalMoney('Tiền cọc').test(
    'required',
    'Nhập số tiền cọc mặc định',
    (value) => value != null,
  ),
  deliveryEnabled: yup.boolean().defined().default(false),
  deliveryMaxRadiusKm: yup
    .number()
    .nullable()
    .defined()
    .default(null)
    .max(500, 'Tối đa 500 km')
    .moreThan(0, 'Giá trị bán kính không thể âm')
    .when('deliveryEnabled', {
      is: true,
      then: (s) => s.test('required', 'Nhập bán kính hỗ trợ tối đa', (value) => value != null),
    }),
  deliveryTiers: yup
    .array()
    .of(deliveryTierSchema)
    .defined()
    .default([])
    .when('deliveryEnabled', {
      is: true,
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
    .when('discountEnabled', {
      is: true,
      then: (s) => s.min(1, 'Bật ưu đãi thì phải có ít nhất một mốc giảm giá'),
    })
    .test('ascending-days', '', function ascendingDays(tiers) {
      if (!tiers) return true;
      for (let i = 1; i < tiers.length; i++) {
        const prev = tiers[i - 1]?.minDays;
        const curr = tiers[i]?.minDays;
        if (prev != null && curr != null && curr <= prev) {
          return this.createError({
            message:
              curr === prev
                ? `Trùng mốc ưu đãi "từ ${curr} ngày"`
                : 'Các mốc ưu đãi phải theo số ngày tăng dần',
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
  monthlyPrice: optionalMoney('Giá tháng'),
  withDriverDailyPrice: optionalMoney('Giá/ngày có tài xế'),
  withDriverInterCityPrice: optionalMoney('Giá liên tỉnh'),
  withDriverOneWayPrice: optionalMoney('Giá 1 chiều'),
});

export type VehiclePricingFormValues = yup.InferType<typeof vehiclePricingFormSchema>;
