import { apiPost } from '@/services/api-client';
import type { SendOtpInput, SendOtpResult, VerifyOtpInput, VerifyOtpResult } from './types';

/** Gửi mã OTP (công khai). Dev (mock) trả `devCode` để tự điền. */
export const sendOtp = (body: SendOtpInput): Promise<SendOtpResult> =>
  apiPost<SendOtpResult>('/auth/phone/send-otp', body);

/** Xác nhận mã OTP (công khai). Nếu đang đăng nhập, BE stamp luôn vào tài khoản. */
export const verifyOtp = (body: VerifyOtpInput): Promise<VerifyOtpResult> =>
  apiPost<VerifyOtpResult>('/auth/phone/verify-otp', body);
