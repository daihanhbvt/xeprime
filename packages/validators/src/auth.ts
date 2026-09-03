import * as yup from 'yup';
import { buildRequiredPhoneSchema, type PhoneSchemaLabels } from './phone';

/**
 * Yup schema cho đăng nhập/đăng ký bằng định danh + mật khẩu.
 *
 * Dùng chung tên field với DTO backend (class-validator) để hai lớp không lệch. Đây là lớp
 * báo lỗi sớm cho người dùng; ràng buộc thật (SĐT unique, hash mật khẩu) ở backend.
 *
 * **LUẬT ở đây, CHỮ đi vào từ ngoài.** Mỗi schema có một hàm `buildXSchema(labels)` và một bản
 * dựng sẵn cùng tên cũ: web và app native bắt buộc nhận cùng một tập giá trị hợp lệ (đó là hợp
 * đồng với backend), nhưng câu báo lỗi phải đổi theo ngôn ngữ đang chọn, mà chuỗi nằm cứng trong
 * package thì đông cứng từ lúc nạp bundle. Dựng lại luật ở phía app để dịch được chữ là cách
 * chắc chắn nhất để hai bên lệch nhau về luật.
 */

export const PASSWORD_MIN = 8;

/** Câu lỗi cho các schema xác thực — app native truyền bản đã dịch. */
export interface AuthSchemaLabels extends PhoneSchemaLabels {
  passwordRequired: string;
  passwordTooShort: string;
  passwordNeedsLetter: string;
  passwordNeedsDigit: string;
  emailInvalid: string;
  emailRequired: string;
  identifierRequired: string;
  nameRequired: string;
  confirmRequired: string;
  confirmMismatch: string;
}

/** Câu lỗi mặc định — TIẾNG VIỆT, cho `apps/web` (lớp validate của web chưa i18n hoá). */
const VI: AuthSchemaLabels = {
  invalid: 'Số điện thoại không hợp lệ',
  required: 'Vui lòng nhập số điện thoại',
  passwordRequired: 'Vui lòng nhập mật khẩu',
  passwordTooShort: `Mật khẩu tối thiểu ${PASSWORD_MIN} ký tự`,
  passwordNeedsLetter: 'Mật khẩu cần có chữ',
  passwordNeedsDigit: 'Mật khẩu cần có số',
  emailInvalid: 'Email không hợp lệ',
  emailRequired: 'Vui lòng nhập email',
  identifierRequired: 'Vui lòng nhập email hoặc số điện thoại',
  nameRequired: 'Vui lòng nhập họ tên',
  confirmRequired: 'Vui lòng nhập lại mật khẩu',
  confirmMismatch: 'Mật khẩu nhập lại không khớp',
};

/** Mật khẩu: tối thiểu 8 ký tự, có cả chữ và số. */
export const buildPasswordSchema = (labels: AuthSchemaLabels) =>
  yup
    .string()
    .required(labels.passwordRequired)
    .min(PASSWORD_MIN, labels.passwordTooShort)
    .matches(/[A-Za-z]/, labels.passwordNeedsLetter)
    .matches(/\d/, labels.passwordNeedsDigit);

export const buildRequiredEmailSchema = (labels: AuthSchemaLabels) =>
  yup.string().trim().email(labels.emailInvalid).required(labels.emailRequired);

/** Ô "nhập lại mật khẩu" — luôn đi kèm một ô `password` cùng form. */
const buildConfirmSchema = (labels: AuthSchemaLabels) =>
  yup
    .string()
    .required(labels.confirmRequired)
    .oneOf([yup.ref('password')], labels.confirmMismatch);

export const buildLoginSchema = (labels: AuthSchemaLabels) =>
  yup.object({
    identifier: yup.string().trim().required(labels.identifierRequired),
    password: yup.string().required(labels.passwordRequired),
  });

export const buildOtpLoginSchema = (labels: AuthSchemaLabels) =>
  yup.object({ phone: buildRequiredPhoneSchema(labels) });

export const buildRegisterSchema = (labels: AuthSchemaLabels) =>
  yup.object({
    displayName: yup.string().trim().required(labels.nameRequired).max(255),
    phone: buildRequiredPhoneSchema(labels),
    password: buildPasswordSchema(labels),
    confirmPassword: buildConfirmSchema(labels),
  });

export const buildForgotPasswordSchema = (labels: AuthSchemaLabels) =>
  yup.object({ email: buildRequiredEmailSchema(labels) });

export const buildResetPasswordSchema = (labels: AuthSchemaLabels) =>
  yup.object({
    password: buildPasswordSchema(labels),
    confirmPassword: buildConfirmSchema(labels),
  });

export const passwordSchema = buildPasswordSchema(VI);
export const requiredEmailSchema = buildRequiredEmailSchema(VI);

export const loginSchema = buildLoginSchema(VI);
export type LoginValues = yup.InferType<typeof loginSchema>;

export const otpLoginSchema = buildOtpLoginSchema(VI);
export type OtpLoginValues = yup.InferType<typeof otpLoginSchema>;

export const registerSchema = buildRegisterSchema(VI);
export type RegisterValues = yup.InferType<typeof registerSchema>;

export const forgotPasswordSchema = buildForgotPasswordSchema(VI);
export type ForgotPasswordValues = yup.InferType<typeof forgotPasswordSchema>;

export const resetPasswordSchema = buildResetPasswordSchema(VI);
export type ResetPasswordValues = yup.InferType<typeof resetPasswordSchema>;
