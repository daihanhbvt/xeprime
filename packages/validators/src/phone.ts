import * as yup from 'yup';
import { VN_PHONE_PATTERN } from '@xeprime/types';

/** SĐT Việt Nam: 0xxxxxxxxx hoặc +84xxxxxxxxx. */
export const phoneSchema = yup
  .string()
  .trim()
  .matches(VN_PHONE_PATTERN, 'Số điện thoại không hợp lệ');

export const requiredPhoneSchema = phoneSchema.required('Vui lòng nhập số điện thoại');
