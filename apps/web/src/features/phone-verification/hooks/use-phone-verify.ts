'use client';

import { useCallback, useEffect, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import type { PhoneVerificationPurpose } from '@xeprime/types';
import { getErrorMessage } from '@/services/api-client';
import { sendOtp, verifyOtp } from '../api';

export type PhoneVerifyStatus = 'idle' | 'code_sent' | 'verified';

const RESEND_COOLDOWN_SEC = 60;

/**
 * Máy trạng thái xác thực SĐT: idle → code_sent → verified. Quản lý đếm ngược gửi lại (khớp
 * cooldown BE) + `devCode` (dev mock). Dùng chung cho mọi chỗ cần verify SĐT (booking, mở shop…).
 */
export function usePhoneVerify(purpose: PhoneVerificationPurpose) {
  const [status, setStatus] = useState<PhoneVerifyStatus>('idle');
  const [cooldown, setCooldown] = useState(0);
  const [devCode, setDevCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

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
    onError: (e) => setError(getErrorMessage(e)),
  });

  const verifyMutation = useMutation({
    mutationFn: (v: { phone: string; code: string }) =>
      verifyOtp({ phone: v.phone, purpose, code: v.code }),
    onSuccess: () => {
      setStatus('verified');
      setError(null);
    },
    onError: (e) => setError(getErrorMessage(e)),
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
    sending: sendMutation.isPending,
    verifying: verifyMutation.isPending,
    send: (phone: string) => sendMutation.mutate(phone),
    /** Gửi mã và chờ kết quả — để bước sau chỉ chuyển khi mã đã gửi thành công. */
    sendAsync: (phone: string) => sendMutation.mutateAsync(phone),
    verify: (phone: string, code: string) => verifyMutation.mutate({ phone, code }),
    reset,
  };
}
