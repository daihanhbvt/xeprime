import { apiGet, apiPost } from '@/services/api-client';
import type {
  OtpConfig,
  SendOtpInput,
  SendOtpResult,
  VerifyOtpInput,
  VerifyOtpResult,
} from './types';

/** Gửi mã OTP (công khai). Dev (mock) trả `devCode` để tự điền. */
export const sendOtp = (body: SendOtpInput): Promise<SendOtpResult> =>
  apiPost<SendOtpResult>('/auth/phone/send-otp', body);

/** Xác nhận mã OTP (công khai). Nếu đang đăng nhập, BE stamp luôn vào tài khoản. */
export const verifyOtp = (body: VerifyOtpInput): Promise<VerifyOtpResult> =>
  apiPost<VerifyOtpResult>('/auth/phone/verify-otp', body);

/** Cấu hình OTP của môi trường (công khai) — dev/staging nhận mã test, production không. */
export const getOtpConfig = (): Promise<OtpConfig> =>
  apiGet<OtpConfig>('/auth/phone/otp-config');
