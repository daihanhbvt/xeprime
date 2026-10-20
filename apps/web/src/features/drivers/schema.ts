import { DRIVER_TYPE, DRIVER_TYPE_VALUES, type DriverType } from '@xeprime/types';
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
    name: yup.string().trim().required(t('form.errors.nameRequired')).max(255),
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
