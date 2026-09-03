import * as yup from 'yup';
import {
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
const ADDRESS_MAX = 500;
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
  packageRequired: string;
  pickupPreferenceRequired: string;
  requestedPickupDateRequired: string;
  routeRequired: string;
  pickupAddressRequired: string;
  destinationRequired: string;
  deliveryAddressRequired: string;
  noteTooLong: string;
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
export function buildBookingRequestSchema(labels: BookingRequestSchemaLabels) {
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
    pickupAddress: yup
      .string()
      .trim()
      .max(ADDRESS_MAX)
      .default('')
      .when('serviceType', {
        is: SERVICE_TYPE.WITH_DRIVER,
        then: (s) => s.required(labels.pickupAddressRequired),
      }),
    /** Điểm đến bắt buộc với lộ trình LIÊN TỈNH — nội thành thì lộ trình tự do. */
    destination: yup
      .string()
      .trim()
      .max(ADDRESS_MAX)
      .default('')
      .when('routeType', {
        is: (value: string | null) =>
          value === ROUTE_TYPE.INTER_CITY || value === ROUTE_TYPE.INTER_CITY_ONE_WAY,
        then: (s) => s.required(labels.destinationRequired),
      }),

    deliveryRequested: yup.boolean().default(false),
    deliveryAddress: yup
      .string()
      .trim()
      .max(ADDRESS_MAX)
      .default('')
      .when('deliveryRequested', {
        is: true,
        then: (s) => s.required(labels.deliveryAddressRequired),
      }),

    note: yup.string().trim().max(NOTE_MAX, labels.noteTooLong).default(''),
  });
}

/** Suy từ CHÍNH schema — `yup.oneOf`/`default` thu hẹp kiểu, interface viết tay sẽ lệch resolver. */
export type BookingRequestFormValues = yup.InferType<ReturnType<typeof buildBookingRequestSchema>>;
