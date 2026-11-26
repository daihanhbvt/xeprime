import * as yup from 'yup';
import type { useTranslations } from 'use-intl';
import {
  BOOKING_COLLATERAL_DESCRIPTION_MAX,
  BOOKING_COLLATERAL_MAX_ITEMS,
  BOOKING_COLLATERAL_TYPE,
  BOOKING_COLLATERAL_TYPE_VALUES,
  BOOKING_EXTRA_CHARGE_LABEL_MAX,
  BOOKING_EXTRA_CHARGE_MAX_LINES,
  ROUTE_TYPE,
  ROUTE_TYPE_VALUES,
  SERVICE_TYPE,
  bookingCollateralNeedsDescription,
  compactPhoneInput,
  type BookingCollateralType,
} from '@xeprime/types';
import { buildRequiredPhoneSchema } from '@xeprime/validators';
import type { Dayjs } from '@xeprime/domain';

type StaffTranslate = ReturnType<typeof useTranslations<'BookingRequests.staffFlow'>>;

/** Hai hình thức nhận xe — gương `PICKUP_METHOD` của web. */
export const PICKUP_METHOD = {
  SELF: 'self',
  DELIVERY: 'delivery',
} as const;

/** Khớp `@MaxLength` của `CreateBookingDto`: tên khách 255, địa chỉ/điểm đến 500, ghi chú 2000. */
const CUSTOMER_NAME_MAX = 255;
const ADDRESS_MAX = 500;
const NOTE_MAX = 2000;

/**
 * Cách gian hàng giữ bảo đảm của ĐƠN (ADR 0109) — chỉ là trạng thái của form: server suy chế độ từ
 * dữ liệu (cọc tiền > 0, có dòng tài sản), không có cột chế độ nào. Gương web `staff-booking-schema`.
 */
export const STAFF_COLLATERAL_MODE = {
  CASH: 'cash',
  ASSET: 'asset',
  BOTH: 'both',
  NONE: 'none',
} as const;
export type StaffCollateralMode =
  (typeof STAFF_COLLATERAL_MODE)[keyof typeof STAFF_COLLATERAL_MODE];
export const STAFF_COLLATERAL_MODE_VALUES = Object.values(STAFF_COLLATERAL_MODE);

export const collateralModeHasCash = (mode: string): boolean =>
  mode === STAFF_COLLATERAL_MODE.CASH || mode === STAFF_COLLATERAL_MODE.BOTH;
export const collateralModeHasAssets = (mode: string): boolean =>
  mode === STAFF_COLLATERAL_MODE.ASSET || mode === STAFF_COLLATERAL_MODE.BOTH;

/**
 * Form của luồng ĐẶT HỘ (gian hàng lập đơn tay) — bản native của web `staffBookingSchema`, cùng
 * luật, cùng câu báo lỗi (`BookingRequests.staffFlow.validation`).
 *
 * Người điền là NHÂN VIÊN: họ tên + SĐT của khách vãng lai gõ tay; không OTP, không điều khoản,
 * không bằng lái. Dịch vụ nằm ở state màn nên vào schema qua yup CONTEXT (`$serviceType`): có tài
 * xế bắt buộc địa chỉ đón, liên tỉnh bắt buộc điểm đến.
 */
export function staffBookingSchema(t: StaffTranslate) {
  const address = (required: string) =>
    yup
      .string()
      .trim()
      .default('')
      .max(ADDRESS_MAX, t('validation.addressMax', { max: ADDRESS_MAX }))
      .required(required);

  return yup.object({
    customerName: yup
      .string()
      .trim()
      .required(t('validation.nameRequired'))
      .max(CUSTOMER_NAME_MAX, t('validation.nameMax', { max: CUSTOMER_NAME_MAX }))
      .default(''),
    /** Cùng luật SĐT với API (`VN_PHONE_PATTERN`); dấu cách/chấm/gạch chép từ danh bạ được bỏ qua. */
    customerPhone: buildRequiredPhoneSchema({
      required: t('validation.phoneRequired'),
      invalid: t('validation.phoneInvalid'),
    })
      .transform((value: unknown) => (typeof value === 'string' ? compactPhoneInput(value) : value))
      .default(''),
    pickupAt: yup
      .mixed<Dayjs>()
      .nullable()
      .defined()
      .test('required', t('validation.pickupRequired'), (v) => v != null),
    /** Dài hạn KHÔNG có ngày trả do người nhập — server suy từ gói bằng tháng lịch (ADR 0011). */
    returnAt: yup
      .mixed<Dayjs>()
      .nullable()
      .defined()
      .when('$serviceType', {
        is: (serviceType: string) => serviceType !== SERVICE_TYPE.LONG_TERM,
        then: (s) =>
          s
            .test('required', t('validation.returnRequired'), (v) => v != null)
            .test('after-pickup', t('validation.returnAfterPickup'), (value, ctx) => {
              const pickup = ctx.parent.pickupAt as Dayjs | null;
              return !value || !pickup || value.isAfter(pickup);
            }),
      }),
    pickupMethod: yup
      .string()
      .oneOf([PICKUP_METHOD.SELF, PICKUP_METHOD.DELIVERY])
      .default(PICKUP_METHOD.SELF),
    deliveryAddress: yup
      .string()
      .trim()
      .default('')
      .when(['pickupMethod', '$serviceType'], {
        is: (pickupMethod: string, serviceType: string) =>
          pickupMethod === PICKUP_METHOD.DELIVERY && serviceType !== SERVICE_TYPE.WITH_DRIVER,
        then: () => address(t('validation.deliveryAddressRequired')),
      }),
    routeType: yup.string().oneOf(ROUTE_TYPE_VALUES).default(ROUTE_TYPE.IN_CITY),
    pickupAddress: yup
      .string()
      .trim()
      .default('')
      .when('$serviceType', {
        is: SERVICE_TYPE.WITH_DRIVER,
        then: () => address(t('validation.driverPickupRequired')),
      }),
    destination: yup
      .string()
      .trim()
      .default('')
      .when(['routeType', '$serviceType'], {
        is: (routeType: string, serviceType: string) =>
          serviceType === SERVICE_TYPE.WITH_DRIVER && routeType !== ROUTE_TYPE.IN_CITY,
        then: () => address(t('validation.destinationRequired')),
      }),
    note: yup
      .string()
      .trim()
      .max(NOTE_MAX, t('validation.noteMax', { max: NOTE_MAX }))
      .default(''),
    /** Tiền thuê nhập tay — CHỈ khi server không báo giá được (xe chưa cấu hình giá ngày). */
    manualBaseAmount: yup.number().min(0, t('validation.amountMin')).nullable().default(null),
    /**
     * Cọc gian hàng THU TRỰC TIẾP khi giao xe — điền sẵn từ chính sách thuê của xe (báo giá), nhân
     * viên sửa theo thoả thuận thực tế. Không đi qua XePrime.
     */
    depositAmount: yup.number().min(0, t('validation.amountMin')).nullable().default(null),
    /**
     * "Giá thoả thuận" (ADR 0109): bật thì giá hệ thống chỉ là gợi ý — tiền thuê, giảm giá, phí giao
     * xe và phụ phí theo dòng do gian hàng nhập. Kiểm "giảm giá ≤ tiền thuê" ở màn lúc tạo.
     */
    negotiated: yup.boolean().default(false),
    manualDiscount: yup.number().min(0, t('validation.amountMin')).nullable().default(null),
    manualDeliveryFee: yup.number().min(0, t('validation.amountMin')).nullable().default(null),
    extraCharges: yup
      .array(
        yup.object({
          label: yup
            .string()
            .trim()
            .required(t('validation.extraLabelRequired'))
            .max(
              BOOKING_EXTRA_CHARGE_LABEL_MAX,
              t('validation.extraLabelMax', { max: BOOKING_EXTRA_CHARGE_LABEL_MAX }),
            )
            .default(''),
          amount: yup
            .number()
            .nullable()
            .defined()
            .test('positive', t('validation.extraAmountPositive'), (v) => v != null && v > 0),
        }),
      )
      .max(BOOKING_EXTRA_CHARGE_MAX_LINES)
      .default([]),
    collateralMode: yup
      .string()
      .oneOf(STAFF_COLLATERAL_MODE_VALUES)
      .default(STAFF_COLLATERAL_MODE.CASH),
    collaterals: yup
      .array(
        yup.object({
          collateralType: yup
            .mixed<BookingCollateralType>()
            .oneOf(BOOKING_COLLATERAL_TYPE_VALUES)
            .default(BOOKING_COLLATERAL_TYPE.CITIZEN_ID),
          description: yup
            .string()
            .trim()
            .max(
              BOOKING_COLLATERAL_DESCRIPTION_MAX,
              t('validation.collateralDescriptionMax', { max: BOOKING_COLLATERAL_DESCRIPTION_MAX }),
            )
            .default('')
            .when('collateralType', {
              is: (type: string) => bookingCollateralNeedsDescription(type),
              then: (s) => s.required(t('validation.collateralDescriptionRequired')),
            }),
        }),
      )
      .max(BOOKING_COLLATERAL_MAX_ITEMS)
      .default([]),
  });
}

export type StaffBookingValues = yup.InferType<ReturnType<typeof staffBookingSchema>>;

/**
 * Tổng tiền của đơn tự lập khi bật "Giá thoả thuận" (ADR 0109) — CHỈ để hiển thị trên màn Xem lại.
 * Native port of web `staff-booking-money.ts`: cùng công thức với `bookingTotal` ở API (tiền thuê −
 * giảm giá + phí giao xe + Σ phụ phí); số ghi vào đơn do server tính lại.
 */
export function negotiatedTotal(input: {
  base: number | null | undefined;
  discount: number | null | undefined;
  delivery: number | null | undefined;
  extras: ReadonlyArray<{ amount?: number | null }> | null | undefined;
}): number {
  const extra = (input.extras ?? []).reduce((sum, row) => sum + (row.amount ?? 0), 0);
  return Math.max(0, (input.base ?? 0) - (input.discount ?? 0) + (input.delivery ?? 0) + extra);
}

/** Hằng giới hạn ghi chú — ô nhập hiện bộ đếm theo đúng trần schema. */
export const STAFF_BOOKING_NOTE_MAX = NOTE_MAX;
