import { DRIVER_TYPE, DRIVER_TYPE_VALUES, type DriverType } from '@xeprime/types';
import * as yup from 'yup';

/** Form hồ sơ tài xế (create/update dùng chung) — validate thật vẫn ở BE. */
export const driverFormSchema = yup.object({
  name: yup.string().trim().required('Nhập tên tài xế').max(255),
  phone: yup
    .string()
    .trim()
    .required('Nhập số điện thoại')
    .matches(/^(0|\+84)\d{9}$/, 'Số điện thoại không hợp lệ'),
  driverType: yup
    .mixed<DriverType>()
    .oneOf(DRIVER_TYPE_VALUES)
    .default(DRIVER_TYPE.STAFF),
  licenseNo: yup.string().trim().max(50).default(''),
  idNo: yup.string().trim().max(50).default(''),
  note: yup.string().trim().max(2000).default(''),
});

export type DriverFormValues = yup.InferType<typeof driverFormSchema>;
