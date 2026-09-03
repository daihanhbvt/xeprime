import { DRIVER_TYPE, DRIVER_TYPE_VALUES, type DriverType } from '@xeprime/types';
import * as yup from 'yup';

/**
 * Form hồ sơ tài xế (create/update dùng chung) — validate thật vẫn ở BE.
 *
 * Nhận hàm dịch thay vì gói sẵn câu tiếng Việt: schema dựng ở module scope sẽ đóng băng ngôn ngữ
 * của request ĐẦU TIÊN trong tiến trình SSR, nên component gọi hàm này trong `useMemo`.
 */
export function makeDriverFormSchema(t: (key: string) => string) {
  return yup.object({
    name: yup.string().trim().required(t('form.errors.nameRequired')).max(255),
    phone: yup
      .string()
      .trim()
      .required(t('form.errors.phoneRequired'))
      .matches(/^(0|\+84)\d{9}$/, t('form.errors.phoneInvalid')),
    driverType: yup.mixed<DriverType>().oneOf(DRIVER_TYPE_VALUES).default(DRIVER_TYPE.STAFF),
    licenseNo: yup.string().trim().max(50).default(''),
    /** Hạn GPLX dạng YYYY-MM-DD — hết hạn thì không gán vào đơn mới được (server chặn). */
    licenseExpiresAt: yup.string().nullable().default(null),
    idNo: yup.string().trim().max(50).default(''),
    note: yup.string().trim().max(2000).default(''),
  });
}

export type DriverFormValues = yup.InferType<ReturnType<typeof makeDriverFormSchema>>;
