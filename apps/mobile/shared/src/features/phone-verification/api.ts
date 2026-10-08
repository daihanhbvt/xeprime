// Side-effect import, KHÔNG xoá: nạp module này là lúc client mặc định được cấu hình.
import '@/lib/api-client';
import { APP_PROFILE } from '@/app-profile';
import { apiPost } from '@/lib/api-client';
import type { SendOtpInput, SendOtpResult, VerifyOtpInput, VerifyOtpResult } from './types';

/**
 * Hai endpoint này DÙNG CHUNG với web, không có bản riêng cho native — và được phép dùng chung
 * chính vì chúng không phát phiên: chúng chỉ chứng minh "người này giữ số điện thoại kia".
 *
 * Chỗ hai nền tảng rẽ đôi là bước SAU đó: web đổi mã lấy cookie ở `/auth/phone/login`, native
 * đổi lấy cặp Bearer ở `/auth/mobile/phone/login` (ADR 0017).
 *
 * Mỗi mã thuộc MỘT realm (ADR 0053): app native không đi qua site web nên khai app của mình ở
 * `clientApp` — app khách ⇒ `customer`, app Partner ⇒ `partner`. Gửi và xác minh PHẢI cùng giá
 * trị, nếu không mã ghi ở realm này bị đem xác minh ở realm kia và luôn "sai mã". `clientApp` đặt
 * SAU `...body` để nơi gọi không ghi đè được app thật đang chạy.
 */
export const sendOtp = (body: Omit<SendOtpInput, 'clientApp'>): Promise<SendOtpResult> =>
  apiPost<SendOtpResult>('/auth/phone/send-otp', { ...body, clientApp: APP_PROFILE.clientApp });

export const verifyOtp = (body: Omit<VerifyOtpInput, 'clientApp'>): Promise<VerifyOtpResult> =>
  apiPost<VerifyOtpResult>('/auth/phone/verify-otp', {
    ...body,
    clientApp: APP_PROFILE.clientApp,
  });
