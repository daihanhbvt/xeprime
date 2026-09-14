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
 * Phần CÓ CẤU TRÚC của một địa chỉ vật lý trong luồng đặt xe, có TIỀN TỐ.
 *
 * Yêu cầu thuê mang tới ba địa điểm (điểm đón, điểm đến, địa chỉ giao xe) nên các trường phải
 * có tiền tố; hàm này sinh ra đúng bộ bảy trường cho một tiền tố để ba chỗ không lệch nhau.
 *
 * Bắt buộc hay không thì do `.when()` ở ngoài quyết định — cùng cách mà `pickupAddress` và
 * `deliveryAddress` đang làm: chỉ đòi khi luồng thật sự cần địa chỉ đó.
 */
const addressFields = () => ({
  provinceCode: yup.string().trim().default(''),
  wardCode: yup.string().trim().default(''),
  addressLine: yup.string().trim().max(255, 'Tối đa 255 ký tự').default(''),
  placeId: yup.string().trim().nullable().default(null),
  latitude: yup.number().nullable().default(null),
  longitude: yup.number().nullable().default(null),
  locationSource: yup.string().nullable().default(null),
});

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
  /*
   * KHÔNG hỏi email. Liên hệ của luồng này là SĐT — nó được xác thực bằng OTP ngay tại đây và
   * là thứ gian hàng dùng để gọi lại. Email từng là một ô "không bắt buộc" mà gần như không ai
   * điền, còn cột `customerEmail` bên API vẫn nhận (khách có tài khoản đã có sẵn email).
   */
  /** Dịch vụ của chuyến (17/08) — component chỉ đưa ra lựa chọn nằm trong serviceTypes của xe. */
  serviceType: yup.mixed<ServiceType>().oneOf(SERVICE_TYPE_VALUES).default(SERVICE_TYPE.SELF_DRIVE),
  /** Lộ trình — bắt buộc khi chuyến CÓ TÀI XẾ. */
  routeType: yup.mixed<RouteType>().oneOf(ROUTE_TYPE_VALUES).default(ROUTE_TYPE.IN_CITY),
  /**
   * Địa chỉ đón khách — bắt buộc khi có tài xế (xe đến đón, khác giao xe tận nơi).
   *
   * Chuỗi hiển thị do SERVER ghép từ mã tỉnh + mã xã + phần chi tiết, nên form KHÔNG còn một ô
   * `pickupAddress` nào cả; điều kiện bắt buộc chuyển sang `pickupAddressLine`.
   */
  pickupProvinceCode: addressFields().provinceCode.when('serviceType', {
    is: SERVICE_TYPE.WITH_DRIVER,
    then: (s) => s.required('Chọn tỉnh/thành nơi đón'),
  }),
  pickupWardCode: addressFields().wardCode.when('serviceType', {
    is: SERVICE_TYPE.WITH_DRIVER,
    then: (s) => s.required('Chọn xã/phường nơi đón'),
  }),
  pickupAddressLine: addressFields().addressLine.when('serviceType', {
    is: SERVICE_TYPE.WITH_DRIVER,
    then: (s) => s.required('Nhập số nhà, đường nơi đón'),
  }),
  pickupPlaceId: addressFields().placeId,
  pickupLatitude: addressFields().latitude,
  pickupLongitude: addressFields().longitude,
  pickupLocationSource: addressFields().locationSource,
  /**
   * Điểm đến — bắt buộc khi lộ trình liên tỉnh (khứ hồi hoặc 1 chiều).
   *
   * VẪN là chuỗi tự do và KHÔNG có mã hành chính: điểm đến là một ĐỊA ĐIỂM ("Sân bay Nội Bài",
   * "Đà Lạt"), không phải một địa chỉ giao nhận. Bắt khách chọn xã/phường cho nó là hỏi một thứ
   * họ không biết và hệ thống không dùng tới.
   */
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
  /**
   * Địa chỉ giao xe. Đây là địa chỉ SINH RA TIỀN (phí giao theo km từ chi nhánh tới đúng cái
   * ghim), nên cả ba phần đều bắt buộc khi khách chọn giao tận nơi — khác hẳn những ô địa chỉ
   * chỉ để liên hệ.
   */
  deliveryProvinceCode: addressFields().provinceCode.when('pickupMethod', {
    is: PICKUP_METHOD.DELIVERY,
    then: (s) => s.required('Chọn tỉnh/thành nơi giao xe'),
  }),
  deliveryWardCode: addressFields().wardCode.when('pickupMethod', {
    is: PICKUP_METHOD.DELIVERY,
    then: (s) => s.required('Chọn xã/phường nơi giao xe'),
  }),
  deliveryAddressLine: addressFields().addressLine.when('pickupMethod', {
    is: PICKUP_METHOD.DELIVERY,
    then: (s) => s.required('Nhập số nhà, đường nơi giao xe'),
  }),
  deliveryPlaceId: addressFields().placeId,
  deliveryLatitude: addressFields().latitude,
  deliveryLongitude: addressFields().longitude,
  deliveryLocationSource: addressFields().locationSource,
  /**
   * Khách đồng ý điều khoản riêng của chủ xe (08/09/2026). Bắt buộc hay không phụ thuộc vào
   * `rentalTerms.requireTermsAcceptance` của xe — dữ liệu server, nên luồng kiểm ở bước Xác nhận
   * thay vì trong schema; server kiểm lại (`RENTAL_TERMS_ACCEPTANCE_REQUIRED`).
   */
  acceptedTerms: yup.boolean().default(false),
});

export type RequestFormValues = yup.InferType<typeof requestFormSchema>;
