'use client';

import { useCallback, useEffect, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import type { PhoneVerificationPurpose } from '@xeprime/types';
import { useErrorMessage } from '@/i18n/use-error-message';
import { sendOtp, verifyOtp } from '../api';
import { useOtpTestCodeEnabled } from './use-otp-config';

export type PhoneVerifyStatus = 'idle' | 'code_sent' | 'verified';

const RESEND_COOLDOWN_SEC = 60;

/**
 * Máy trạng thái xác thực SĐT: idle → code_sent → verified. Quản lý đếm ngược gửi lại (khớp
 * cooldown BE) + `devCode` (dev mock). Dùng chung cho mọi chỗ cần mã OTP (đăng ký, quên mật khẩu…).
 *
 * `error` là câu ĐÃ DỊCH từ MÃ lỗi (`useErrorMessage`, ADR 0012) — không phải `message` tiếng
 * Việt của backend.
 */
export function usePhoneVerify(purpose: PhoneVerificationPurpose) {
  const [status, setStatus] = useState<PhoneVerifyStatus>('idle');
  const [cooldown, setCooldown] = useState(0);
  const [devCode, setDevCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const testCodeEnabled = useOtpTestCodeEnabled();
  const errorMessage = useErrorMessage();

  useEffect(() => {
    if (cooldown <= 0) return;
    const id = setInterval(() => setCooldown((c) => (c <= 1 ? 0 : c - 1)), 1000);
    return () => clearInterval(id);
  }, [cooldown > 0]); // eslint-disable-line react-hooks/exhaustive-deps -- chỉ (re)tạo timer khi bật/tắt

  const sendMutation = useMutation({
    mutationFn: (phone: string) => sendOtp({ phone, purpose }),
    onSuccess: (res) => {
      setStatus('code_sent');
      setDevCode(res.devCode ?? null);
      setError(null);
      setCooldown(RESEND_COOLDOWN_SEC);
    },
    onError: (e) => setError(errorMessage(e)),
  });

  const verifyMutation = useMutation({
    mutationFn: (v: { phone: string; code: string }) =>
      verifyOtp({ phone: v.phone, purpose, code: v.code }),
    onSuccess: () => {
      setStatus('verified');
      setError(null);
    },
    onError: (e) => setError(errorMessage(e)),
  });

  const reset = useCallback(() => {
    setStatus('idle');
    setDevCode(null);
    setError(null);
    setCooldown(0);
  }, []);

  return {
    status,
    cooldown,
    devCode,
    error,
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
    reset,
  };
}
