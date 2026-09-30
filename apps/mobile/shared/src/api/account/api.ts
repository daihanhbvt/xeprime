import type { components } from '@xeprime/types';
import { getApiClient } from '@xeprime/api-client';

type Schemas = components['schemas'];

/** Hồ sơ tài khoản của CON NGƯỜI đang đăng nhập (`GET /users/me`). */
export type UserProfile = Schemas['UserProfileDto'];
/**
 * `PATCH /users/me` — backend CHỈ nhận `displayName` và `avatarUrl`.
 *
 * `email`/`phone` là định danh ĐĂNG NHẬP nên chúng đi đường riêng bên dưới: đổi được, nhưng chỉ
 * sau khi người dùng chứng minh nhận được mã ở địa chỉ/số MỚI.
 */
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
 * Hai kênh đi qua CÙNG một bề mặt (`ContactVerifySheet`) vì các bước giống hệt nhau: nhập định
 * danh mới → nhận mã 6 số → xác nhận. Giá trị này là thứ duy nhất khác giữa hai luồng, nên nó là
 * một tham số chứ không phải hai bản sao của cùng một màn.
 */
export const CONTACT_CHANNEL = {
  EMAIL: 'email',
  PHONE: 'phone',
} as const;
export type ContactChannel = (typeof CONTACT_CHANNEL)[keyof typeof CONTACT_CHANNEL];

export const accountApi = {
  /**
   * KHÁC `/auth/me`: đó là phiên + scope + quyền (thứ RBAC đọc lại mỗi request), còn đây là hồ
   * sơ con người — có `phone`, `phoneVerified`, và là thứ màn Tài khoản sửa.
   */
  me(): Promise<UserProfile> {
    return getApiClient().get<UserProfile>('/users/me');
  },

  updateMe(body: UpdateProfileInput): Promise<UserProfile> {
    return getApiClient().patch<UserProfile>('/users/me', body);
  },

  /** Bước 1 đổi SĐT: gửi mã tới số MỚI. Môi trường mock trả `devCode` để tự điền. */
  sendPhoneOtp(body: SendPhoneOtpInput): Promise<SendOtpResult> {
    return getApiClient().post<SendOtpResult>('/users/me/phone/send-otp', body);
  },

  /** Bước 2 đổi SĐT: mã đúng → server ghi số mới và trả hồ sơ đã cập nhật. */
  verifyPhone(body: VerifyPhoneInput): Promise<UserProfile> {
    return getApiClient().post<UserProfile>('/users/me/phone/verify', body);
  },

  /** Bước 1 đổi email: gửi mã 6 số tới địa chỉ MỚI. */
  sendEmailOtp(body: SendEmailOtpInput): Promise<SendOtpResult> {
    return getApiClient().post<SendOtpResult>('/users/me/email/send-otp', body);
  },

  /** Bước 2 đổi email: mã đúng → server ghi địa chỉ mới và báo cho địa chỉ cũ. */
  verifyEmail(body: VerifyEmailInput): Promise<UserProfile> {
    return getApiClient().post<UserProfile>('/users/me/email/verify', body);
  },
};
