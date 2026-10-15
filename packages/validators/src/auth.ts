import * as yup from 'yup';
import {
  compactPhoneInput,
  detectLoginIdentifierKind,
  isValidLoginIdentifier,
  LOGIN_IDENTIFIER_KIND,
  VN_PHONE_PATTERN,
} from '@xeprime/types';
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
  /**
   * Ô "email hoặc SĐT" mà không đoán được người dùng định nhập gì (vd `nguyenvana`).
   *
   * Tuỳ chọn — thiếu thì rơi về câu tiếng Việt mặc định. Hai trường hợp còn lại KHÔNG cần khoá
   * mới: gõ có `@` thì dùng `emailInvalid`, gõ ra dáng số thì dùng `invalid` (câu lỗi SĐT) —
   * đúng câu người dùng sẽ thấy ở ô email và ô SĐT riêng lẻ, nên không có bản dịch thứ hai cho
   * cùng một ý.
   */
  identifierInvalid?: string;
}

/** Câu lỗi mặc định — TIẾNG VIỆT, cho client nào chưa cấp bản dịch của mình. */
const VI: Required<AuthSchemaLabels> = {
  invalid: 'Số điện thoại không hợp lệ',
  required: 'Vui lòng nhập số điện thoại',
  passwordRequired: 'Vui lòng nhập mật khẩu',
  passwordTooShort: `Mật khẩu tối thiểu ${PASSWORD_MIN} ký tự`,
  passwordNeedsLetter: 'Mật khẩu cần có chữ',
  passwordNeedsDigit: 'Mật khẩu cần có số',
  emailInvalid: 'Email không hợp lệ',
  emailRequired: 'Vui lòng nhập email',
  identifierRequired: 'Vui lòng nhập email hoặc số điện thoại',
  identifierInvalid: 'Nhập email (vd ban@congty.vn) hoặc số điện thoại (vd 0901234567)',
  nameRequired: 'Vui lòng nhập họ tên',
  confirmRequired: 'Vui lòng nhập lại mật khẩu',
  confirmMismatch: 'Mật khẩu nhập lại không khớp',
};

/** Khoá của từng quy tắc mật khẩu — trùng tên với khoá câu lỗi trong `AuthSchemaLabels`. */
export type PasswordRuleKey = 'passwordTooShort' | 'passwordNeedsLetter' | 'passwordNeedsDigit';

/**
 * Ba quy tắc mật khẩu ở dạng ĐỌC ĐƯỢC TỪNG CÁI — nguồn duy nhất cho cả schema lẫn bảng "Yêu cầu
 * của mật khẩu" trên màn đổi mật khẩu.
 *
 * Bảng tick ✓/✗ theo từng quy tắc phải đánh giá đúng thứ schema sẽ từ chối. Nếu bảng tự viết lại
 * ba biểu thức của riêng nó thì sớm muộn hai bên lệch nhau, và người dùng thấy cả ba dòng xanh
 * nhưng bấm Lưu vẫn đỏ — lỗi khó chịu nhất vì màn hình đang nói dối họ.
 */
export const PASSWORD_RULES: ReadonlyArray<{
  readonly key: PasswordRuleKey;
  readonly test: (value: string) => boolean;
}> = [
  { key: 'passwordTooShort', test: (value) => value.length >= PASSWORD_MIN },
  { key: 'passwordNeedsLetter', test: (value) => /[A-Za-z]/.test(value) },
  { key: 'passwordNeedsDigit', test: (value) => /\d/.test(value) },
];

/**
 * Mật khẩu: tối thiểu 8 ký tự, có cả chữ và số.
 *
 * Dựng TỪ `PASSWORD_RULES` để luật và bảng hiển thị không thể lệch nhau. Tên của mỗi `.test`
 * chính là khoá quy tắc, nên lỗi trả về vẫn chỉ đúng dòng nào chưa đạt.
 */
export const buildPasswordSchema = (labels: AuthSchemaLabels) =>
  PASSWORD_RULES.reduce(
    (schema, rule) => schema.test(rule.key, labels[rule.key], (value) => rule.test(value ?? '')),
    yup.string().required(labels.passwordRequired),
  );

export const buildRequiredEmailSchema = (labels: AuthSchemaLabels) =>
  yup.string().trim().email(labels.emailInvalid).required(labels.emailRequired);

/** Ô "nhập lại mật khẩu" — luôn đi kèm một ô `password` cùng form. */
const buildConfirmSchema = (labels: AuthSchemaLabels) =>
  yup
    .string()
    .required(labels.confirmRequired)
    .oneOf([yup.ref('password')], labels.confirmMismatch);

/**
 * Ô "Email hoặc số điện thoại" của màn đăng nhập.
 *
 * Luật nằm ở `@xeprime/types` (`isValidLoginIdentifier`) vì backend phân nhánh email/SĐT theo
 * đúng chuỗi này; ở đây chỉ chọn CÂU LỖI theo thứ người dùng đang gõ dở. Một `.test()` chứ không
 * phải hai nhánh `oneOf`: yup gộp lỗi của `oneOf` thành một câu chung, mà "chung chung" đúng là
 * thứ ô này phải tránh.
 */
export const buildLoginIdentifierSchema = (labels: AuthSchemaLabels) =>
  yup
    .string()
    .trim()
    .required(labels.identifierRequired)
    .test({
      name: 'login-identifier',
      test(value, ctx) {
        // Bỏ trống đã có `required()` lo — chạy tiếp ở đây chỉ tạo hai câu lỗi cho một ô trống.
        if (!value) return true;
        if (isValidLoginIdentifier(value)) return true;

        const kind = detectLoginIdentifierKind(value);
        const message =
          kind === LOGIN_IDENTIFIER_KIND.EMAIL
            ? labels.emailInvalid
            : kind === LOGIN_IDENTIFIER_KIND.PHONE
              ? labels.invalid
              : (labels.identifierInvalid ?? VI.identifierInvalid);
        return ctx.createError({ message });
      },
    });

export const buildLoginSchema = (labels: AuthSchemaLabels) =>
  yup.object({
    identifier: buildLoginIdentifierSchema(labels),
    password: yup.string().required(labels.passwordRequired),
  });

/**
 * Ô "Số điện thoại" của màn đăng nhập site khách / site partner — ADR 0060: định danh đăng nhập
 * CHỈ là SĐT. Nhận dấu cách/chấm/gạch/ngoặc như ô định danh cũ (`compactPhoneInput`) — đó là
 * cách người ta chép số từ danh bạ, không phải một số khác; backend bỏ chúng cùng một cách.
 */
export const buildLoginPhoneSchema = (labels: AuthSchemaLabels) =>
  yup
    .string()
    .trim()
    .required(labels.required)
    .test('login-phone', labels.invalid, (value) =>
      value ? VN_PHONE_PATTERN.test(compactPhoneInput(value)) : true,
    );

/** Đăng nhập site khách / site partner: SĐT + mật khẩu (ADR 0060). Site quản trị dùng `buildLoginSchema`. */
export const buildPhoneLoginSchema = (labels: AuthSchemaLabels) =>
  yup.object({
    phone: buildLoginPhoneSchema(labels),
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

/**
 * Quên mật khẩu bằng SĐT (ADR 0060) — bước 1, số nhận mã. Bước 2 là mã 6 số (ô OTP riêng) +
 * `buildResetPasswordSchema`. Không giả định tài khoản có email.
 */
export const buildForgotPasswordPhoneSchema = (labels: AuthSchemaLabels) =>
  yup.object({ phone: buildRequiredPhoneSchema(labels) });

export const buildResetPasswordSchema = (labels: AuthSchemaLabels) =>
  yup.object({
    password: buildPasswordSchema(labels),
    confirmPassword: buildConfirmSchema(labels),
  });

/**
 * Quên mật khẩu bằng SĐT — MỘT màn (web + app): SĐT · mật khẩu mới · nhập lại. Bấm "Xác nhận" thì gửi
 * mã `password_reset` và mở popup nhập mã; đúng mã ⇒ `POST /auth/password/reset-otp` (ADR 0060).
 */
export const buildResetPasswordByPhoneSchema = (labels: AuthSchemaLabels) =>
  buildForgotPasswordPhoneSchema(labels).concat(buildResetPasswordSchema(labels));

export const passwordSchema = buildPasswordSchema(VI);
export const requiredEmailSchema = buildRequiredEmailSchema(VI);
export const loginIdentifierSchema = buildLoginIdentifierSchema(VI);

export const loginSchema = buildLoginSchema(VI);
export type LoginValues = yup.InferType<typeof loginSchema>;

export const phoneLoginSchema = buildPhoneLoginSchema(VI);
export type PhoneLoginValues = yup.InferType<typeof phoneLoginSchema>;

export const otpLoginSchema = buildOtpLoginSchema(VI);
export type OtpLoginValues = yup.InferType<typeof otpLoginSchema>;

export const registerSchema = buildRegisterSchema(VI);
export type RegisterValues = yup.InferType<typeof registerSchema>;

export const forgotPasswordSchema = buildForgotPasswordSchema(VI);
export type ForgotPasswordValues = yup.InferType<typeof forgotPasswordSchema>;

export const forgotPasswordPhoneSchema = buildForgotPasswordPhoneSchema(VI);
export type ForgotPasswordPhoneValues = yup.InferType<typeof forgotPasswordPhoneSchema>;

export const resetPasswordSchema = buildResetPasswordSchema(VI);
export const resetPasswordByPhoneSchema = buildResetPasswordByPhoneSchema(VI);
export type ResetPasswordByPhoneValues = yup.InferType<typeof resetPasswordByPhoneSchema>;
export type ResetPasswordValues = yup.InferType<typeof resetPasswordSchema>;
