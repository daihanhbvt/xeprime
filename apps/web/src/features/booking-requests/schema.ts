import {
  LONG_TERM_PACKAGE_MONTHS,
  PICKUP_PREFERENCE,
  PICKUP_PREFERENCE_VALUES,
  ROUTE_TYPE,
  ROUTE_TYPE_VALUES,
  SERVICE_TYPE,
  SERVICE_TYPE_VALUES,
  type LongTermPackageMonths,
  type PickupPreference,
  type RouteType,
  type ServiceType,
} from '@xeprime/types';
import type { Dayjs } from 'dayjs';
import * as yup from 'yup';

/**
 * Schema form "Yêu cầu thuê" trên marketplace (yup — báo lỗi sớm; validate thật ở BE).
 * Ngày là `Dayjs` (AntD DatePicker); bắt buộc qua `.test()` để giữ type `Dayjs | null`.
 */
/** Hai cách nhận xe — giá trị đi vào form, nhãn ở component. */
export const PICKUP_METHOD = {
  SELF: 'self',
  DELIVERY: 'delivery',
} as const;
export type PickupMethod = (typeof PICKUP_METHOD)[keyof typeof PICKUP_METHOD];

export const requestFormSchema = yup.object({
  customerName: yup.string().trim().required('Nhập họ tên').max(255),
  customerPhone: yup
    .string()
    .trim()
    .required('Nhập số điện thoại')
    .matches(/^(0|\+84)\d{9}$/, 'Số điện thoại không hợp lệ'),
  /** Tuỳ chọn — chỉ để shop liên hệ thêm; không dùng để định danh. */
  customerEmail: yup
    .string()
    .trim()
    .email('Email không hợp lệ')
    .max(255)
    .default('')
    .transform((v: string) => v ?? ''),
  /** Dịch vụ của chuyến (17/08) — component chỉ đưa ra lựa chọn nằm trong serviceTypes của xe. */
  serviceType: yup.mixed<ServiceType>().oneOf(SERVICE_TYPE_VALUES).default(SERVICE_TYPE.SELF_DRIVE),
  /** Lộ trình — bắt buộc khi chuyến CÓ TÀI XẾ. */
  routeType: yup.mixed<RouteType>().oneOf(ROUTE_TYPE_VALUES).default(ROUTE_TYPE.IN_CITY),
  /** Địa chỉ đón khách — bắt buộc khi có tài xế (xe đến đón, khác giao xe tận nơi). */
  pickupAddress: yup
    .string()
    .trim()
    .max(500, 'Tối đa 500 ký tự')
    .default('')
    .when('serviceType', {
      is: SERVICE_TYPE.WITH_DRIVER,
      then: (s) => s.required('Nhập địa chỉ đón'),
    }),
  /** Điểm đến — bắt buộc khi lộ trình liên tỉnh (khứ hồi hoặc 1 chiều). */
  destination: yup
    .string()
    .trim()
    .max(500, 'Tối đa 500 ký tự')
    .default('')
    .when(['serviceType', 'routeType'], {
      is: (serviceType: string, routeType: string) =>
        serviceType === SERVICE_TYPE.WITH_DRIVER && routeType !== ROUTE_TYPE.IN_CITY,
      then: (s) => s.required('Nhập điểm đến'),
    }),
  /**
   * Khoảng thuê chỉ tồn tại với dịch vụ tính theo NGÀY. Thuê dài hạn đi mô hình GÓI: khách chọn
   * gói + nguyện vọng ngày nhận, ngày trả do server tính khi gian hàng duyệt (ADR 0011).
   */
  pickupAt: yup
    .mixed<Dayjs>()
    .nullable()
    .defined()
    .test('required', 'Chọn thời gian nhận xe', (value, ctx) =>
      ctx.parent.serviceType === SERVICE_TYPE.LONG_TERM ? true : value != null,
    ),
  returnAt: yup
    .mixed<Dayjs>()
    .nullable()
    .defined()
    .test('required', 'Chọn thời gian trả xe', (value, ctx) =>
      ctx.parent.serviceType === SERVICE_TYPE.LONG_TERM ? true : value != null,
    )
    .test('after-pickup', 'Thời gian trả phải sau thời gian nhận', (value, ctx) => {
      const pickup = ctx.parent.pickupAt as Dayjs | null;
      return !value || !pickup || value.isAfter(pickup);
    }),

  /** Gói thuê dài hạn — bắt buộc khi dịch vụ là dài hạn; chỉ nhận đúng sáu gói. */
  longTermPackageMonths: yup
    .mixed<LongTermPackageMonths>()
    .nullable()
    .defined()
    .default(null)
    .test('package-required', 'Chọn gói thuê', (value, ctx) =>
      ctx.parent.serviceType === SERVICE_TYPE.LONG_TERM
        ? value != null && (LONG_TERM_PACKAGE_MONTHS as readonly number[]).includes(value)
        : true,
    ),
  /** Nguyện vọng nhận xe — bắt buộc khi dài hạn. */
  pickupPreference: yup
    .mixed<PickupPreference>()
    .oneOf(PICKUP_PREFERENCE_VALUES)
    .default(PICKUP_PREFERENCE.WITHIN_7_DAYS),
  /** Ngày khách muốn nhận — chỉ khi chọn "ngày cụ thể" (chỉ NGÀY, giờ do gian hàng chốt). */
  requestedPickupDate: yup
    .mixed<Dayjs>()
    .nullable()
    .defined()
    .default(null)
    .test('required-when-specific', 'Chọn ngày muốn nhận xe', (value, ctx) =>
      ctx.parent.serviceType === SERVICE_TYPE.LONG_TERM &&
      ctx.parent.pickupPreference === PICKUP_PREFERENCE.SPECIFIC_DATE
        ? value != null
        : true,
    ),
  /**
   * Hình thức nhận xe. Wave 9 bỏ hẳn công tắc "giao tận nơi" + báo giá theo khoảng cách; giờ là
   * một lựa chọn hai phương án, và giao tận nơi **luôn miễn phí lúc gửi yêu cầu**.
   */
  pickupMethod: yup
    .mixed<PickupMethod>()
    .oneOf([PICKUP_METHOD.SELF, PICKUP_METHOD.DELIVERY])
    .default(PICKUP_METHOD.SELF),
  deliveryAddress: yup
    .string()
    .trim()
    .max(500, 'Tối đa 500 ký tự')
    .default('')
    .when('pickupMethod', {
      is: PICKUP_METHOD.DELIVERY,
      then: (s) => s.required('Nhập địa chỉ giao xe'),
    }),
  /** Xác nhận điều khoản — chặn ở bước cuối, không phải lúc nhập liệu. */
  agreed: yup.boolean().default(false),
});

export type RequestFormValues = yup.InferType<typeof requestFormSchema>;
