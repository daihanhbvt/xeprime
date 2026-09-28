// Side-effect import, KHÔNG xoá: nạp module này là lúc client mặc định được cấu hình.
import '@/lib/api-client';
import { apiPost } from '@/lib/api-client';
import type { SendOtpInput, SendOtpResult, VerifyOtpInput, VerifyOtpResult } from './types';

/**
 * Hai endpoint này DÙNG CHUNG với web, không có bản riêng cho native — và được phép dùng chung
 * chính vì chúng không phát phiên: chúng chỉ chứng minh "người này giữ số điện thoại kia".
 *
 * Chỗ hai nền tảng rẽ đôi là bước SAU đó: web đổi mã lấy cookie ở `/auth/phone/login`, native
 * đổi lấy cặp Bearer ở `/auth/mobile/phone/login` (ADR 0017).
 */
export const sendOtp = (body: SendOtpInput): Promise<SendOtpResult> =>
  apiPost<SendOtpResult>('/auth/phone/send-otp', body);

export const verifyOtp = (body: VerifyOtpInput): Promise<VerifyOtpResult> =>
  apiPost<VerifyOtpResult>('/auth/phone/verify-otp', body);
