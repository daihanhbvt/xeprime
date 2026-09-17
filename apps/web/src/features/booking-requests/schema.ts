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
import type { useTranslations } from 'next-intl';
import * as yup from 'yup';

/**
 * Chữ của form yêu cầu thuê — namespace riêng cho các câu VALIDATION.
 *
 * Xem `i18n/keys.ts`: phải khai với tên namespace CỤ THỂ, generic sẽ nổ `TS2590`.
 */
type FormTranslate = ReturnType<typeof useTranslations<'BookingRequests.form'>>;

/** Số ký tự tối đa của phần "số nhà, đường" — khớp `ADDRESS_LINE_MAX_LENGTH` bên API. */
const ADDRESS_LINE_MAX = 255;
/** Điểm đến của chuyến có tài xế là chuỗi tự do; trần khớp cột `destination` bên API. */
const DESTINATION_MAX = 500;

/**
 * Phần CÓ CẤU TRÚC của một địa chỉ vật lý trong luồng đặt xe, có TIỀN TỐ.
 *
 * Yêu cầu thuê mang tới ba địa điểm (điểm đón, điểm đến, địa chỉ giao xe) nên các trường phải
 * có tiền tố; hàm này sinh ra đúng bộ bảy trường cho một tiền tố để ba chỗ không lệch nhau.
 *
 * Bắt buộc hay không thì do `.when()` ở ngoài quyết định: chỉ đòi khi luồng thật sự cần địa chỉ
 * đó.
 *
 * **`wardCode` và `provinceCode` không bao giờ bắt buộc ở luồng này.** Người điền là KHÁCH THUÊ
 * và màn hình không hỏi họ hai thứ đó (lý do đầy đủ ở `RenterAddressBlock`): mã tỉnh suy ra từ
 * địa điểm họ chọn, mã xã thì bỏ hẳn. Bắt buộc một trường không có ô nhập nào là dựng một lỗi
 * mà người dùng không có cách nào sửa.
 */
const addressFields = () => ({
  provinceCode: yup.string().trim().default(''),
  wardCode: yup.string().trim().default(''),
  addressLine: yup.string().trim().default(''),
  placeId: yup.string().trim().nullable().default(null),
  latitude: yup.number().nullable().default(null),
  longitude: yup.number().nullable().default(null),
  locationSource: yup.string().nullable().default(null),
});

/** Hai cách nhận xe — giá trị đi vào form, nhãn ở component. */
export const PICKUP_METHOD = {
  SELF: 'self',
  DELIVERY: 'delivery',
} as const;
export type PickupMethod = (typeof PICKUP_METHOD)[keyof typeof PICKUP_METHOD];

export interface RequestFormSchemaOptions {
  /**
   * Người dùng CÓ CÁCH nào để tạo ra một toạ độ không.
   *
   * `false` khi trình duyệt không dựng được bản đồ tương tác (chưa cấu hình
   * `NEXT_PUBLIC_GEOAPIFY_MAP_KEY`) — lúc đó không có gợi ý để chọn và cũng không có bản đồ để
   * đặt ghim, nên đòi toạ độ là khoá luôn nút "Tiếp tục" bằng một lỗi mà không thao tác nào sửa
   * được. Bản đồ hỏng không được phép trở thành "không đặt được xe" (ADR 0035 điều 6).
   *
   * Chú ý: `/places/search` chết mà khoá bản đồ vẫn còn thì cờ này VẪN `true`, và đúng như vậy —
   * khách hết gợi ý nhưng vẫn tự đặt được ghim, tức là vẫn có đường đi tới một toạ độ thật.
   */
  canConfirmLocation: boolean;
}

/**
 * Schema form "Yêu cầu thuê" trên marketplace (yup — báo lỗi sớm; validate thật ở BE).
 * Ngày là `Dayjs` (AntD DatePicker); bắt buộc qua `.test()` để giữ type `Dayjs | null`.
 *
 * **Là HÀM nhận `t`, không phải một object hằng.** Câu báo lỗi validation là chữ hiện cho người
 * dùng đọc như mọi chữ khác (ADR 0012), mà một hằng ở tầng module thì không đọc được ngôn ngữ
 * đang dùng — bản trước viết thẳng tiếng Việt vào đây, nên khách đang xem giao diện tiếng Anh
 * nhận câu báo lỗi tiếng Việt đúng lúc họ đang mắc kẹt giữa luồng đặt xe. Nơi gọi bọc `useMemo`.
 *
 * ## Toạ độ là điều kiện BẮT BUỘC của một địa chỉ, không phải phần thêm
 *
 * `pickupLatitude`/`deliveryLatitude` (và cặp kinh độ) bắt buộc ở những luồng cần địa chỉ, và
 * chỉ khi người dùng thật sự tạo ra được một toạ độ ({@link RequestFormSchemaOptions}). Đó là
 * chỗ kỷ luật "địa chỉ phải được bản đồ xác nhận" trở thành một cái CHẶN thật: ô chữ có thể còn
 * chữ do người dùng gõ tay, nhưng không có toạ độ thì quãng đường giao xe không tính được
 * (ADR 0018) và tài xế không có chỗ nào để lái tới. Lỗi hiện ngay dưới bản đồ, nơi người dùng
 * thao tác để sửa — xem `ConfirmedPlaceField`.
 */
export function requestFormSchema(t: FormTranslate, options: RequestFormSchemaOptions) {
  const { canConfirmLocation } = options;
  return yup.object({
    customerName: yup.string().trim().required(t('errors.customerName')).max(255),
    customerPhone: yup
      .string()
      .trim()
      .required(t('errors.customerPhone'))
      .matches(/^(0|\+84)\d{9}$/, t('errors.customerPhoneFormat')),
    /*
     * KHÔNG hỏi email. Liên hệ của luồng này là SĐT — nó được xác thực bằng OTP ngay tại đây và
     * là thứ gian hàng dùng để gọi lại. Email từng là một ô "không bắt buộc" mà gần như không ai
     * điền, còn cột `customerEmail` bên API vẫn nhận (khách có tài khoản đã có sẵn email).
     */
    /** Dịch vụ của chuyến (17/08) — component chỉ đưa ra lựa chọn nằm trong serviceTypes của xe. */
    serviceType: yup
      .mixed<ServiceType>()
      .oneOf(SERVICE_TYPE_VALUES)
      .default(SERVICE_TYPE.SELF_DRIVE),
    /** Lộ trình — bắt buộc khi chuyến CÓ TÀI XẾ. */
    routeType: yup.mixed<RouteType>().oneOf(ROUTE_TYPE_VALUES).default(ROUTE_TYPE.IN_CITY),
    /**
     * Địa chỉ đón khách — bắt buộc khi có tài xế (xe đến đón, khác giao xe tận nơi).
     *
     * Chuỗi hiển thị do SERVER ghép từ mã tỉnh + phần chi tiết, nên form KHÔNG có ô
     * `pickupAddress` nào cả; điều kiện bắt buộc nằm ở `pickupAddressLine` và ở cặp toạ độ.
     */
    pickupProvinceCode: addressFields().provinceCode,
    pickupWardCode: addressFields().wardCode,
    pickupAddressLine: addressFields()
      .addressLine.max(ADDRESS_LINE_MAX, t('errors.addressLineMax', { max: ADDRESS_LINE_MAX }))
      .when('serviceType', {
        is: SERVICE_TYPE.WITH_DRIVER,
        then: (s) => s.required(t('errors.pickupAddressLine')),
      }),
    pickupPlaceId: addressFields().placeId,
    pickupLatitude: addressFields().latitude.when('serviceType', {
      is: (v: string) => canConfirmLocation && v === SERVICE_TYPE.WITH_DRIVER,
      then: (s) => s.required(t('errors.addressNotConfirmed')),
    }),
    pickupLongitude: addressFields().longitude.when('serviceType', {
      is: (v: string) => canConfirmLocation && v === SERVICE_TYPE.WITH_DRIVER,
      then: (s) => s.required(t('errors.addressNotConfirmed')),
    }),
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
      .max(DESTINATION_MAX, t('errors.destinationMax', { max: DESTINATION_MAX }))
      .default('')
      .when(['serviceType', 'routeType'], {
        is: (serviceType: string, routeType: string) =>
          serviceType === SERVICE_TYPE.WITH_DRIVER && routeType !== ROUTE_TYPE.IN_CITY,
        then: (s) => s.required(t('errors.destination')),
      }),
    /**
     * Khoảng thuê chỉ tồn tại với dịch vụ tính theo NGÀY. Thuê dài hạn đi mô hình GÓI: khách chọn
     * gói + nguyện vọng ngày nhận, ngày trả do server tính khi gian hàng duyệt (ADR 0011).
     */
    pickupAt: yup
      .mixed<Dayjs>()
      .nullable()
      .defined()
      .test('required', t('errors.pickupAt'), (value, ctx) =>
        ctx.parent.serviceType === SERVICE_TYPE.LONG_TERM ? true : value != null,
      ),
    returnAt: yup
      .mixed<Dayjs>()
      .nullable()
      .defined()
      .test('required', t('errors.returnAt'), (value, ctx) =>
        ctx.parent.serviceType === SERVICE_TYPE.LONG_TERM ? true : value != null,
      )
      .test('after-pickup', t('errors.returnAfterPickup'), (value, ctx) => {
        const pickup = ctx.parent.pickupAt as Dayjs | null;
        return !value || !pickup || value.isAfter(pickup);
      }),

    /** Gói thuê dài hạn — bắt buộc khi dịch vụ là dài hạn; chỉ nhận đúng sáu gói. */
    longTermPackageMonths: yup
      .mixed<LongTermPackageMonths>()
      .nullable()
      .defined()
      .default(null)
      .test('package-required', t('errors.longTermPackage'), (value, ctx) =>
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
      .test('required-when-specific', t('errors.requestedPickupDate'), (value, ctx) =>
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
     * ghim), nên chữ VÀ toạ độ đều bắt buộc khi khách chọn giao tận nơi — khác hẳn những ô địa
     * chỉ chỉ để liên hệ.
     */
    deliveryProvinceCode: addressFields().provinceCode,
    deliveryWardCode: addressFields().wardCode,
    deliveryAddressLine: addressFields()
      .addressLine.max(ADDRESS_LINE_MAX, t('errors.addressLineMax', { max: ADDRESS_LINE_MAX }))
      .when('pickupMethod', {
        is: PICKUP_METHOD.DELIVERY,
        then: (s) => s.required(t('errors.deliveryAddressLine')),
      }),
    deliveryPlaceId: addressFields().placeId,
    deliveryLatitude: addressFields().latitude.when('pickupMethod', {
      is: (v: string) => canConfirmLocation && v === PICKUP_METHOD.DELIVERY,
      then: (s) => s.required(t('errors.addressNotConfirmed')),
    }),
    deliveryLongitude: addressFields().longitude.when('pickupMethod', {
      is: (v: string) => canConfirmLocation && v === PICKUP_METHOD.DELIVERY,
      then: (s) => s.required(t('errors.addressNotConfirmed')),
    }),
    deliveryLocationSource: addressFields().locationSource,
    /**
     * Khách đồng ý điều khoản riêng của chủ xe (08/09/2026). Bắt buộc hay không phụ thuộc vào
     * `rentalTerms.requireTermsAcceptance` của xe — dữ liệu server, nên luồng kiểm ở bước Xác nhận
     * thay vì trong schema; server kiểm lại (`RENTAL_TERMS_ACCEPTANCE_REQUIRED`).
     */
    acceptedTerms: yup.boolean().default(false),
  });
}

export type RequestFormValues = yup.InferType<ReturnType<typeof requestFormSchema>>;
