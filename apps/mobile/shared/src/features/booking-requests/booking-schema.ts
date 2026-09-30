import * as yup from 'yup';
import {
  ADDRESS_LINE_MAX_LENGTH,
  LONG_TERM_PACKAGE_MONTHS,
  PICKUP_PREFERENCE,
  PICKUP_PREFERENCE_VALUES,
  ROUTE_TYPE,
  ROUTE_TYPE_VALUES,
  SERVICE_TYPE,
  SERVICE_TYPE_VALUES,
  VN_PHONE_PATTERN,
} from '@xeprime/types';

/**
 * Trần độ dài — gương `@MaxLength` của `CreateBookingRequestDto`. Chặn thật ở backend; đây chỉ
 * là lớp báo sớm để khách không gõ xong cả đoạn rồi mới bị trả về.
 */
export const NAME_MAX = 255;
/** Điểm đến tối đa — `DESTINATION_MAX` của schema web. */
export const DESTINATION_MAX = 500;
const ADDRESS_MAX = DESTINATION_MAX;
/** Phần "số nhà, đường" — khớp `ADDRESS_LINE_MAX_LENGTH` của `@xeprime/types` và cột DB. */
const ADDRESS_LINE_MAX = ADDRESS_LINE_MAX_LENGTH;
export const NOTE_MAX = 2000;

/** Câu lỗi đã dịch, do màn hình truyền vào — xem chú thích ở `buildBookingRequestSchema`. */
export interface BookingRequestSchemaLabels {
  nameRequired: string;
  nameTooLong: string;
  phoneRequired: string;
  phoneInvalid: string;
  emailInvalid: string;
  serviceRequired: string;
  pickupAtRequired: string;
  returnAtRequired: string;
  /** Trả phải SAU nhận — `errors.returnAfterPickup` của web. */
  returnAfterPickup: string;
  /** Vượt độ dài ô địa chỉ chi tiết — `errors.addressLineMax` của web. */
  addressLineMax: string;
  /** Vượt độ dài điểm đến — `errors.destinationMax` của web. */
  destinationMax: string;
  packageRequired: string;
  pickupPreferenceRequired: string;
  requestedPickupDateRequired: string;
  routeRequired: string;
  pickupAddressRequired: string;
  destinationRequired: string;
  deliveryAddressRequired: string;
  /**
   * Địa chỉ có chữ nhưng CHƯA có toạ độ (ADR 0042).
   *
   * Một câu cho cả hai địa chỉ: việc phải làm giống hệt nhau — chọn một dòng gợi ý, hoặc đặt ghim.
   */
  addressNotConfirmed: string;
  noteTooLong: string;
}

export interface BookingRequestSchemaOptions {
  /**
   * Người dùng CÓ CÁCH nào để tạo ra một toạ độ không.
   *
   * `false` khi `/places/search` trả `available: false` (chưa cấu hình khoá, hoặc nhà cung cấp
   * lỗi). Trên native cái ghim chỉ sinh ra từ một dòng gợi ý — không có bản đồ tương tác để tự
   * đặt — nên lúc đó đòi toạ độ là khoá luôn nút "Tiếp tục" bằng một lỗi mà không thao tác nào
   * sửa được. Bản đồ hỏng không được phép trở thành "không đặt được xe" (ADR 0035 điều 6).
   */
  canConfirmLocation: boolean;
}

/**
 * Khách gửi yêu cầu thuê (BKG-01) — lớp báo lỗi SỚM; lớp chặn thật là DTO backend và constraint
 * DB (ADR 0006).
 *
 * `pickupAt`/`returnAt` CHỈ có nghĩa với dịch vụ theo ngày. Thuê dài hạn không gửi chúng (server
 * bỏ qua kể cả khi gửi) — khách nêu NGUYỆN VỌNG ngày nhận, gian hàng chốt lịch lúc duyệt và
 * server tính ngày trả bằng THÁNG LỊCH (ADR 0011).
 *
 * Câu lỗi đi VÀO qua `labels` vì chúng phải đổi theo ngôn ngữ đang chọn, mà hằng mức module thì
 * cố định từ lúc nạp bundle.
 */
export function buildBookingRequestSchema(
  labels: BookingRequestSchemaLabels,
  options: BookingRequestSchemaOptions = { canConfirmLocation: true },
) {
  const { canConfirmLocation } = options;
  return yup.object({
    customerName: yup
      .string()
      .trim()
      .required(labels.nameRequired)
      .max(NAME_MAX, labels.nameTooLong),
    customerPhone: yup
      .string()
      .trim()
      .required(labels.phoneRequired)
      .matches(VN_PHONE_PATTERN, { message: labels.phoneInvalid }),
    customerEmail: yup.string().trim().default('').email(labels.emailInvalid),
    serviceType: yup.string().oneOf(SERVICE_TYPE_VALUES).required(labels.serviceRequired),

    /** ISO-8601. Chuỗi chứ không phải `Date`: nó đi thẳng vào body, không qua bộ chọn của AntD. */
    pickupAt: yup
      .string()
      .default('')
      .when('serviceType', {
        is: (value: string) => value !== SERVICE_TYPE.LONG_TERM,
        then: (s) => s.required(labels.pickupAtRequired),
      }),
    returnAt: yup
      .string()
      .default('')
      .when('serviceType', {
        is: (value: string) => value !== SERVICE_TYPE.LONG_TERM,
        then: (s) => s.required(labels.returnAtRequired),
      })
      // Cùng phép kiểm `after-pickup` của schema web — hai mốc là chuỗi ISO (mốc tuyệt đối).
      .test('after-pickup', labels.returnAfterPickup, (value, ctx) => {
        const pickup = ctx.parent.pickupAt as string;
        return !value || !pickup || Date.parse(value) > Date.parse(pickup);
      }),

    longTermPackageMonths: yup
      .number()
      .oneOf([...LONG_TERM_PACKAGE_MONTHS])
      .nullable()
      .default(null)
      .when('serviceType', {
        is: SERVICE_TYPE.LONG_TERM,
        then: (s) => s.required(labels.packageRequired),
      }),
    pickupPreference: yup
      .string()
      .oneOf(PICKUP_PREFERENCE_VALUES)
      .nullable()
      .default(null)
      .when('serviceType', {
        is: SERVICE_TYPE.LONG_TERM,
        then: (s) => s.required(labels.pickupPreferenceRequired),
      }),
    /** `YYYY-MM-DD`, chỉ bắt buộc khi khách chọn một ngày cụ thể. */
    requestedPickupDate: yup
      .string()
      .default('')
      .when('pickupPreference', {
        is: PICKUP_PREFERENCE.SPECIFIC_DATE,
        then: (s) => s.required(labels.requestedPickupDateRequired),
      }),

    routeType: yup
      .string()
      .oneOf(ROUTE_TYPE_VALUES)
      .nullable()
      .default(null)
      .when('serviceType', {
        is: SERVICE_TYPE.WITH_DRIVER,
        then: (s) => s.required(labels.routeRequired),
      }),
    /*
     * Điểm đón đi theo mô hình hành chính HAI CẤP (ADR 0035): mã tỉnh + mã xã chọn từ danh mục,
     * phần "số nhà, đường" thì gõ. Chuỗi hiển thị do SERVER ghép nên form KHÔNG còn ô nào chứa
     * nó — bắt buộc chuyển sang ba trường dưới đây.
     */
    /*
     * `provinceCode` và `wardCode` KHÔNG bao giờ bắt buộc ở luồng này (ADR 0042).
     *
     * Người điền là KHÁCH THUÊ và màn hình không hỏi họ hai thứ đó — lý do đầy đủ ở
     * `RenterAddressBlock`: mã tỉnh suy ra từ địa điểm họ chọn, mã xã thì bỏ hẳn. Bắt buộc một
     * trường không có ô nhập nào là dựng một lỗi mà người dùng không có cách nào sửa.
     *
     * Thứ bắt buộc thay vào đó là TOẠ ĐỘ: phí giao xe đo bằng quãng đường tới cái ghim (ADR 0018),
     * nên một địa chỉ không ghim là một đơn không tính được phí — và điều đó chỉ lộ ra ở bước báo
     * giá, sau khi khách đã điền xong mọi thứ.
     */
    pickupProvinceCode: yup.string().trim().default(''),
    pickupWardCode: yup.string().trim().default(''),
    pickupAddressLine: yup
      .string()
      .trim()
      .max(ADDRESS_LINE_MAX, labels.addressLineMax)
      .default('')
      .when('serviceType', {
        is: SERVICE_TYPE.WITH_DRIVER,
        then: (s) => s.required(labels.pickupAddressRequired),
      }),
    pickupPlaceId: yup.string().trim().nullable().default(null),
    pickupLatitude: yup
      .number()
      .nullable()
      .default(null)
      .when('serviceType', {
        is: (v: string) => canConfirmLocation && v === SERVICE_TYPE.WITH_DRIVER,
        then: (s) => s.required(labels.addressNotConfirmed),
      }),
    pickupLongitude: yup
      .number()
      .nullable()
      .default(null)
      .when('serviceType', {
        is: (v: string) => canConfirmLocation && v === SERVICE_TYPE.WITH_DRIVER,
        then: (s) => s.required(labels.addressNotConfirmed),
      }),
    pickupLocationSource: yup.string().nullable().default(null),
    /** Điểm đến bắt buộc với lộ trình LIÊN TỈNH — nội thành thì lộ trình tự do. */
    destination: yup
      .string()
      .trim()
      .max(ADDRESS_MAX, labels.destinationMax)
      .default('')
      .when('routeType', {
        is: (value: string | null) =>
          value === ROUTE_TYPE.INTER_CITY || value === ROUTE_TYPE.INTER_CITY_ONE_WAY,
        then: (s) => s.required(labels.destinationRequired),
      }),

    deliveryRequested: yup.boolean().default(false),
    /*
     * Địa chỉ giao xe là địa chỉ SINH RA TIỀN (phí giao theo km từ chi nhánh tới GHIM), nên thứ
     * bắt buộc là CHỮ + TOẠ ĐỘ. Mã tỉnh/xã thì không — xem chú thích ở khối địa chỉ đón.
     */
    deliveryProvinceCode: yup.string().trim().default(''),
    deliveryWardCode: yup.string().trim().default(''),
    deliveryAddressLine: yup
      .string()
      .trim()
      .max(ADDRESS_LINE_MAX, labels.addressLineMax)
      .default('')
      .when('deliveryRequested', {
        is: true,
        then: (s) => s.required(labels.deliveryAddressRequired),
      }),
    deliveryPlaceId: yup.string().trim().nullable().default(null),
    deliveryLatitude: yup
      .number()
      .nullable()
      .default(null)
      .when('deliveryRequested', {
        is: (v: boolean) => canConfirmLocation && v === true,
        then: (s) => s.required(labels.addressNotConfirmed),
      }),
    deliveryLongitude: yup
      .number()
      .nullable()
      .default(null)
      .when('deliveryRequested', {
        is: (v: boolean) => canConfirmLocation && v === true,
        then: (s) => s.required(labels.addressNotConfirmed),
      }),
    deliveryLocationSource: yup.string().nullable().default(null),

    note: yup.string().trim().max(NOTE_MAX, labels.noteTooLong).default(''),
  });
}

/** Suy từ CHÍNH schema — `yup.oneOf`/`default` thu hẹp kiểu, interface viết tay sẽ lệch resolver. */
export type BookingRequestFormValues = yup.InferType<ReturnType<typeof buildBookingRequestSchema>>;
