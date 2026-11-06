'use client';

import { useCallback, useEffect, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { API_ERROR_CODE, OTP_POLICY, type PhoneVerificationPurpose } from '@xeprime/types';
import { useErrorMessage } from '@/i18n/use-error-message';
import { getErrorCode, getRetryAfterSeconds } from '@/services/api-client';
import { sendOtp, verifyOtp } from '../api';
import { useOtpTestCodeEnabled } from './use-otp-config';

export type PhoneVerifyStatus = 'idle' | 'code_sent' | 'verified';

/**
 * Mã đã CHẾT ở server — không lượt gõ nào mở lại được, chỉ mã mới: bị khoá vì đoán sai quá
 * `OTP_POLICY.MAX_ATTEMPTS` lần, hoặc đã hết hạn.
 */
const DEAD_CODE_ERRORS = new Set<string>([API_ERROR_CODE.OTP_LOCKED, API_ERROR_CODE.OTP_EXPIRED]);

/** Server nói phải chờ bao lâu mới gửi được mã tiếp — đồng hồ "Gửi lại mã" bám theo con số đó. */
const SEND_WAIT_ERRORS = new Set<string>([
  API_ERROR_CODE.OTP_COOLDOWN,
  API_ERROR_CODE.OTP_TOO_MANY,
]);

/**
 * Máy trạng thái xác thực SĐT: idle → code_sent → verified. Quản lý đếm ngược gửi lại (khớp
 * cooldown BE) + `devCode` (dev mock). Dùng chung cho mọi chỗ cần mã OTP (đăng ký, quên mật khẩu…).
 *
 * `error` là câu ĐÃ DỊCH từ MÃ lỗi (`useErrorMessage`, ADR 0012) — không phải `message` tiếng
 * Việt của backend.
 *
 * `codeDead`: mã đang có đã bị server huỷ (`OTP_LOCKED` / `OTP_EXPIRED`). Màn nhập mã KHOÁ ô mã
 * và giữ nguyên câu báo cho tới khi gửi mã mới thành công — để ô mở thì người dùng gõ tiếp, câu
 * báo biến mất, và lượt sau nhận "mã không đúng": họ không bao giờ biết mã đã bị khoá. Nơi đối
 * chiếu mã qua một endpoint khác (đăng ký, đặt lại mật khẩu) báo lỗi về đây bằng `noteCodeError`.
 */
export function usePhoneVerify(purpose: PhoneVerificationPurpose) {
  const [status, setStatus] = useState<PhoneVerifyStatus>('idle');
  const [cooldown, setCooldown] = useState(0);
  const [devCode, setDevCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [codeDead, setCodeDead] = useState(false);
  const testCodeEnabled = useOtpTestCodeEnabled();
  const errorMessage = useErrorMessage();

  useEffect(() => {
    if (cooldown <= 0) return;
    const id = setInterval(() => setCooldown((c) => (c <= 1 ? 0 : c - 1)), 1000);
    return () => clearInterval(id);
  }, [cooldown > 0]); // eslint-disable-line react-hooks/exhaustive-deps -- chỉ (re)tạo timer khi bật/tắt

  const noteCodeError = useCallback((e: unknown) => {
    const code = getErrorCode(e);
    if (code && DEAD_CODE_ERRORS.has(code)) setCodeDead(true);
  }, []);

  const sendMutation = useMutation({
    mutationFn: (phone: string) => sendOtp({ phone, purpose }),
    onSuccess: (res) => {
      setStatus('code_sent');
      setDevCode(res.devCode ?? null);
      setError(null);
      setCodeDead(false);
      setCooldown(OTP_POLICY.RESEND_COOLDOWN_SECONDS);
    },
    onError: (e) => {
      setError(errorMessage(e));
      // Cooldown / trần gửi theo giờ: khoá nút gửi lại đúng tới lúc server cho gửi.
      const code = getErrorCode(e);
      const wait = getRetryAfterSeconds(e);
      if (code && SEND_WAIT_ERRORS.has(code) && wait !== null) setCooldown(wait);
    },
  });

  const verifyMutation = useMutation({
    mutationFn: (v: { phone: string; code: string }) =>
      verifyOtp({ phone: v.phone, purpose, code: v.code }),
    onSuccess: () => {
      setStatus('verified');
      setError(null);
    },
    onError: (e) => {
      setError(errorMessage(e));
      noteCodeError(e);
    },
  });

  const reset = useCallback(() => {
    setStatus('idle');
    setDevCode(null);
    setError(null);
    setCodeDead(false);
    setCooldown(0);
  }, []);

  return {
    status,
    cooldown,
    devCode,
    error,
    codeDead,
    /**
     * Môi trường nhận mã OTP test (dev/staging): cho nhập mã ngay cả khi chưa gửi — gõ mã test là
     * qua, bấm gửi thì nhận SMS thật như thường. Production luôn false.
     */
    testCodeEnabled,
    /** Ô nhập mã được hiện: đã gửi mã, hoặc môi trường nhận mã test. */
    canEnterCode: status === 'code_sent' || testCodeEnabled,
    sending: sendMutation.isPending,
    verifying: verifyMutation.isPending,
    send: (phone: string) => sendMutation.mutate(phone),
    /** Gửi mã và chờ kết quả — để bước sau chỉ chuyển khi mã đã gửi thành công. */
    sendAsync: (phone: string) => sendMutation.mutateAsync(phone),
    verify: (phone: string, code: string) => verifyMutation.mutate({ phone, code }),
    /** Xác thực và chờ kết quả — nơi gọi tự hiện lỗi cạnh ô mã (form đăng ký đối tác). */
    verifyAsync: (phone: string, code: string) => verifyMutation.mutateAsync({ phone, code }),
    /** Lỗi của một lượt đối chiếu mã qua endpoint KHÁC (đăng ký, đặt lại mật khẩu) — xem `codeDead`. */
    noteCodeError,
    reset,
  };
}
