import * as yup from 'yup';

/**
 * Yup schema cho đăng nhập/đăng ký email-mật khẩu.
 *
 * Dùng chung tên field với DTO backend (class-validator) để hai lớp không lệch. Đây là lớp
 * báo lỗi sớm cho người dùng; ràng buộc thật (email unique, hash mật khẩu) ở backend.
 */

export const PASSWORD_MIN = 8;

/** Mật khẩu: tối thiểu 8 ký tự, có cả chữ và số. */
export const passwordSchema = yup
  .string()
  .required('Vui lòng nhập mật khẩu')
  .min(PASSWORD_MIN, `Mật khẩu tối thiểu ${PASSWORD_MIN} ký tự`)
  .matches(/[A-Za-z]/, 'Mật khẩu cần có chữ')
  .matches(/\d/, 'Mật khẩu cần có số');

export const requiredEmailSchema = yup
  .string()
  .trim()
  .email('Email không hợp lệ')
  .required('Vui lòng nhập email');

export const loginSchema = yup.object({
  identifier: yup
    .string()
    .trim()
    .required('Vui lòng nhập email hoặc số điện thoại'),
  password: yup.string().required('Vui lòng nhập mật khẩu'),
});
export type LoginValues = yup.InferType<typeof loginSchema>;

export const registerSchema = yup.object({
  displayName: yup.string().trim().required('Vui lòng nhập họ tên').max(255),
  email: requiredEmailSchema,
  password: passwordSchema,
  confirmPassword: yup
    .string()
    .required('Vui lòng nhập lại mật khẩu')
    .oneOf([yup.ref('password')], 'Mật khẩu nhập lại không khớp'),
});
export type RegisterValues = yup.InferType<typeof registerSchema>;

export const forgotPasswordSchema = yup.object({
  email: requiredEmailSchema,
});
export type ForgotPasswordValues = yup.InferType<typeof forgotPasswordSchema>;

export const resetPasswordSchema = yup.object({
  password: passwordSchema,
  confirmPassword: yup
    .string()
    .required('Vui lòng nhập lại mật khẩu')
    .oneOf([yup.ref('password')], 'Mật khẩu nhập lại không khớp'),
});
export type ResetPasswordValues = yup.InferType<typeof resetPasswordSchema>;
