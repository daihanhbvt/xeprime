import type { components } from '@xeprime/types';

/** Hồ sơ tài khoản KHÁCH — lấy từ contract OpenAPI (ADR 0007), không viết tay. */
type Schemas = components['schemas'];

export type UserProfile = Schemas['UserProfileDto'];
export type UpdateProfileInput = Schemas['UpdateMeDto'];

/** Đổi/thêm SĐT và email — mỗi kênh hai bước: xin mã, rồi xác nhận mã. */
export type SendPhoneOtpInput = Schemas['SendPhoneOtpDto'];
export type VerifyPhoneInput = Schemas['VerifyPhoneDto'];
export type SendEmailOtpInput = Schemas['SendEmailOtpDto'];
export type VerifyEmailInput = Schemas['VerifyEmailDto'];
export type SendOtpResult = Schemas['SendOtpResultDto'];

/**
 * Kênh liên lạc mà người dùng đang đổi.
 *
 * Hai kênh đi qua CÙNG một màn hình (`ContactVerifyModal`) vì các bước giống hệt nhau: nhập
 * định danh mới → nhận mã 6 số → xác nhận. Giá trị này là thứ duy nhất khác giữa hai luồng, nên
 * nó là một tham số chứ không phải hai bản sao của cùng một modal.
 */
export const CONTACT_CHANNEL = {
  EMAIL: 'email',
  PHONE: 'phone',
} as const;
export type ContactChannel = (typeof CONTACT_CHANNEL)[keyof typeof CONTACT_CHANNEL];
