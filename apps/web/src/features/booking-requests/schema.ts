import {
  LONG_TERM_MIN_DAYS,
  ROUTE_TYPE,
  ROUTE_TYPE_VALUES,
  SERVICE_TYPE,
  SERVICE_TYPE_VALUES,
  type RouteType,
  type ServiceType,
} from '@xeprime/types';
import type { Dayjs } from 'dayjs';
import * as yup from 'yup';

/**
 * Schema form "Yêu cầu thuê" trên marketplace (yup — báo lỗi sớm; validate thật ở BE).
 * Ngày là `Dayjs` (AntD DatePicker); bắt buộc qua `.test()` để giữ type `Dayjs | null`.
 */
const requiredDate = (message: string) =>
  yup
    .mixed<Dayjs>()
    .nullable()
    .defined()
    .test('required', message, (value) => value != null);

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
  serviceType: yup
    .mixed<ServiceType>()
    .oneOf(SERVICE_TYPE_VALUES)
    .default(SERVICE_TYPE.SELF_DRIVE),
  /** Lộ trình — bắt buộc khi chuyến CÓ TÀI XẾ. */
  routeType: yup
    .mixed<RouteType>()
    .oneOf(ROUTE_TYPE_VALUES)
    .default(ROUTE_TYPE.IN_CITY),
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
  pickupAt: requiredDate('Chọn thời gian nhận xe'),
  returnAt: requiredDate('Chọn thời gian trả xe')
    .test('after-pickup', 'Thời gian trả phải sau thời gian nhận', (value, ctx) => {
      const pickup = ctx.parent.pickupAt as Dayjs | null;
      return !value || !pickup || value.isAfter(pickup);
    })
    .test(
      'long-term-min-days',
      `Thuê dài hạn tối thiểu ${LONG_TERM_MIN_DAYS} ngày`,
      (value, ctx) => {
        const pickup = ctx.parent.pickupAt as Dayjs | null;
        if (!value || !pickup || ctx.parent.serviceType !== SERVICE_TYPE.LONG_TERM) return true;
        // Cùng công thức đếm ngày với backend (`ceil Δ/24h`) — hai tầng không lệch ranh giới.
        return Math.ceil(value.diff(pickup, 'minute') / 1440) >= LONG_TERM_MIN_DAYS;
      },
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
