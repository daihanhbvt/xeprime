import {
  DRIVER_TYPE,
  DRIVER_TYPE_VALUES,
  EXTERNAL_DRIVER_NAME_LENGTH,
  INTERNAL_DRIVER_NOTE_MAX,
  normalizeVnPhoneInput,
  VN_MOBILE_PHONE_PATTERN,
  type DriverType,
} from '@xeprime/types';
import * as yup from 'yup';

/**
 * Form MỜI tài xế (ADR 0063) — SĐT phải là tài khoản khách đã xác minh; server mới là nơi
 * quyết định (`DRIVER_ACCOUNT_NOT_FOUND`).
 *
 * Nhận hàm dịch thay vì gói sẵn câu tiếng Việt: schema dựng ở module scope sẽ đóng băng ngôn ngữ
 * của request ĐẦU TIÊN trong tiến trình SSR, nên component gọi hàm này trong `useMemo`.
 */
export function makeInviteDriverSchema(t: (key: string) => string) {
  return yup.object({
    phone: yup
      .string()
      .trim()
      .required(t('form.errors.phoneRequired'))
      .matches(/^(0|\+84)\d{9}$/, t('form.errors.phoneInvalid')),
    // Hộp mời mới (Figma `23737:46392`) không có ô tên: tên lưu là tên tài khoản tra được. `name`
    // chỉ còn mang tên cũ khi MỜI LẠI một liên kết đã đóng.
    name: yup.string().trim().max(255).default(''),
    driverType: yup.mixed<DriverType>().oneOf(DRIVER_TYPE_VALUES).default(DRIVER_TYPE.STAFF),
    note: yup.string().trim().max(2000).default(''),
  });
}

export type InviteDriverFormValues = yup.InferType<ReturnType<typeof makeInviteDriverSchema>>;

/** Form SỬA một liên kết — SĐT không đổi được (mời lại là một liên kết mới). */
export function makeEditDriverSchema(t: (key: string) => string) {
  return yup.object({
    name: yup.string().trim().required(t('form.errors.nameRequired')).max(255),
    driverType: yup.mixed<DriverType>().oneOf(DRIVER_TYPE_VALUES).default(DRIVER_TYPE.STAFF),
    note: yup.string().trim().max(2000).default(''),
  });
}

export type EditDriverFormValues = yup.InferType<ReturnType<typeof makeEditDriverSchema>>;

/**
 * Form thêm / sửa tài xế NỘI BỘ (ADR 0108) — người không có tài khoản. SĐT di động (khách gọi số
 * này để gặp tài xế); server quy về `0…` và chặn trùng trong danh bạ (`INTERNAL_DRIVER_PHONE_TAKEN`).
 */
export function makeInternalDriverSchema(t: (key: string) => string) {
  return yup.object({
    name: yup
      .string()
      .trim()
      .required(t('internal.form.errors.nameRequired'))
      .min(EXTERNAL_DRIVER_NAME_LENGTH.MIN, t('internal.form.errors.nameShort'))
      .max(EXTERNAL_DRIVER_NAME_LENGTH.MAX),
    phone: yup
      .string()
      .trim()
      .required(t('form.errors.phoneRequired'))
      .test('vn-mobile', t('form.errors.phoneInvalid'), (v) =>
        VN_MOBILE_PHONE_PATTERN.test(normalizeVnPhoneInput(v ?? '')),
      ),
    note: yup.string().trim().max(INTERNAL_DRIVER_NOTE_MAX).default(''),
    /** Ảnh TUỲ CHỌN — URL kho ảnh của bên thuê; `null` = không ảnh. */
    photoUrl: yup.string().nullable().default(null),
  });
}

export type InternalDriverFormValues = yup.InferType<ReturnType<typeof makeInternalDriverSchema>>;
