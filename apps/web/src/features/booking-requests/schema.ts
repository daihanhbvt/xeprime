import {
  BOOKING_REQUEST_NOTE_MAX_LENGTH,
  LONG_TERM_PACKAGE_MONTHS,
  PICKUP_PREFERENCE,
  PICKUP_PREFERENCE_VALUES,
  ROUTE_TYPE,
  ROUTE_TYPE_VALUES,
  SERVICE_TYPE,
  SERVICE_TYPE_VALUES,
  compactPhoneInput,
  type LongTermPackageMonths,
  type PickupPreference,
  type RouteType,
  type ServiceType,
} from '@xeprime/types';
import { buildRequiredPhoneSchema } from '@xeprime/validators';
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
/** Họ tên người thuê — khớp `@MaxLength(255)` của `CreateBookingRequestDto.customerName`. */
const CUSTOMER_NAME_MAX = 255;
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

/**
 * Schema form "Yêu cầu thuê" trên marketplace (yup — báo lỗi sớm; validate thật ở BE).
 * Ngày là `Dayjs` (AntD DatePicker); bắt buộc qua `.test()` để giữ type `Dayjs | null`.
 *
 * **Là HÀM nhận `t`, không phải một object hằng.** Câu báo lỗi validation là chữ hiện cho người
 * dùng đọc như mọi chữ khác (ADR 0012), mà một hằng ở tầng module thì không đọc được ngôn ngữ
 * đang dùng — bản trước viết thẳng tiếng Việt vào đây, nên khách đang xem giao diện tiếng Anh
 * nhận câu báo lỗi tiếng Việt đúng lúc họ đang mắc kẹt giữa luồng đặt xe. Nơi gọi bọc `useMemo`.
 *
 * ## Toạ độ đi KÈM địa chỉ, nhưng không bắt buộc
 *
 * Chữ trong ô địa chỉ luôn đã được xác nhận (`ConfirmedPlaceField`): hoặc là dòng gợi ý khách
 * bấm — kèm toạ độ — hoặc là khách chủ động chọn "dùng đúng địa chỉ đã nhập" cho một địa chỉ mà
 * nhà cung cấp bản đồ không biết. Ca thứ hai KHÔNG có toạ độ, và web không vẽ bản đồ để đặt ghim
 * (ADR 0061 điều 1), nên đòi toạ độ ở đây là khoá nút "Tiếp tục" bằng một lỗi không thao tác nào
 * sửa được (ADR 0035 điều 6). Báo giá giao xe khi đó tự tra địa chỉ chữ ở server, không tra được
 * thì hai bên tự thoả thuận phí (ADR 0018).
 */
export function requestFormSchema(t: FormTranslate) {
  return yup.object({
    /*
     * LIÊN HỆ của chuyến (ADR 0063) — họ tên + SĐT chủ xe sẽ gọi, sửa ở màn Xem lại. Mặc định là
     * của TÀI KHOẢN (flow điền khi `/auth/me` về); SĐT khác số tài khoản KHÔNG cần OTP. Danh tính
     * (danh sách chặn, tự đặt xe, chống trùng) vẫn đọc từ tài khoản ở server, không từ hai ô này.
     */
    customerName: yup
      .string()
      .trim()
      .required(t('errors.customerName'))
      .max(CUSTOMER_NAME_MAX, t('errors.customerNameMax', { max: CUSTOMER_NAME_MAX }))
      .default(''),
    /** Cùng luật SĐT với API (`VN_PHONE_PATTERN`); dấu cách/chấm/gạch chép từ danh bạ được bỏ qua. */
    customerPhone: buildRequiredPhoneSchema({
      required: t('errors.customerPhone'),
      invalid: t('errors.customerPhoneFormat'),
    })
      .transform((value: unknown) => (typeof value === 'string' ? compactPhoneInput(value) : value))
      .default(''),
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
     * Địa chỉ giao xe. Đây là địa chỉ SINH RA TIỀN (phí giao theo km từ chi nhánh tới đúng điểm
     * đó), nên chữ bắt buộc khi khách chọn giao tận nơi; toạ độ đi kèm khi khách chọn gợi ý.
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
    deliveryLatitude: addressFields().latitude,
    deliveryLongitude: addressFields().longitude,
    deliveryLocationSource: addressFields().locationSource,
    /**
     * Ô "Tôi đã đọc và đồng ý…" ở màn Xem lại (Figma `19727:55409`) — khách tick mới gửi được.
     * Cùng một lời đồng ý phủ cả điều khoản riêng của chủ xe khi xe bắt buộc (08/09/2026), nên
     * payload mang `acceptedTerms: true` và server kiểm lại (`RENTAL_TERMS_ACCEPTANCE_REQUIRED`).
     * Kiểm ở bước Xác nhận thay vì trong schema: đây là lời đồng ý của MỘT người, không bao giờ
     * khôi phục từ bản nháp.
     */
    acceptedTerms: yup.boolean().default(false),
    /**
     * Lời nhắn cho chủ xe (không bắt buộc) — chủ xe đọc nó ở hộp thư yêu cầu. Trần dùng chung với
     * DTO bên API; server cắt khoảng trắng và lưu chuỗi rỗng thành `null`.
     */
    note: yup
      .string()
      .trim()
      .max(
        BOOKING_REQUEST_NOTE_MAX_LENGTH,
        t('errors.noteMax', { max: BOOKING_REQUEST_NOTE_MAX_LENGTH }),
      )
      .default(''),
  });
}

export type RequestFormValues = yup.InferType<ReturnType<typeof requestFormSchema>>;
