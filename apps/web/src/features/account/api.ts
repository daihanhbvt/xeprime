import { apiGet, apiPatch, apiPost } from '@/services/api-client';
import type {
  SendEmailOtpInput,
  SendOtpResult,
  SendPhoneOtpInput,
  UpdateProfileInput,
  UserProfile,
  VerifyEmailInput,
  VerifyPhoneInput,
} from './types';

/** GET /users/me — hồ sơ của chính mình. Khác `/auth/me` (scope + quyền) ở chỗ có `phone`. */
export const fetchMyProfile = (): Promise<UserProfile> => apiGet<UserProfile>('/users/me');

/**
 * PATCH /users/me — backend CHỈ nhận `displayName` và `avatarUrl`.
 *
 * `email`/`phone` là định danh đăng nhập nên chúng đi đường riêng bên dưới: đổi được, nhưng chỉ
 * sau khi người dùng chứng minh nhận được mã ở địa chỉ/số MỚI.
 */
export const updateMyProfile = (input: UpdateProfileInput): Promise<UserProfile> =>
  apiPatch<UserProfile>('/users/me', input);

/** Bước 1 đổi SĐT: gửi mã tới số mới. Dev (mock) trả `devCode` để tự điền. */
export const sendMyPhoneOtp = (body: SendPhoneOtpInput): Promise<SendOtpResult> =>
  apiPost<SendOtpResult>('/users/me/phone/send-otp', body);

/** Bước 2 đổi SĐT: mã đúng → server ghi số mới và trả hồ sơ đã cập nhật. */
export const verifyMyPhone = (body: VerifyPhoneInput): Promise<UserProfile> =>
  apiPost<UserProfile>('/users/me/phone/verify', body);

/** Bước 1 đổi email: gửi mã 6 số tới địa chỉ mới. */
export const sendMyEmailOtp = (body: SendEmailOtpInput): Promise<SendOtpResult> =>
  apiPost<SendOtpResult>('/users/me/email/send-otp', body);

/** Bước 2 đổi email: mã đúng → server ghi địa chỉ mới và báo cho địa chỉ cũ. */
export const verifyMyEmail = (body: VerifyEmailInput): Promise<UserProfile> =>
  apiPost<UserProfile>('/users/me/email/verify', body);
